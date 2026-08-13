import type { ExpressionString } from "./types";

export interface RuleTemplate {
  params: string[];
  expression: ExpressionString;
}

export const RULE_TEMPLATES: Record<string, RuleTemplate> = {
  minValue: {
    params: ["fieldId", "minValue"],
    expression: "value('${fieldId}') < ${minValue} && value('${fieldId}') !== null && value('${fieldId}') !== ''",
  },
  maxValue: {
    params: ["fieldId", "maxValue"],
    expression: "value('${fieldId}') > ${maxValue}",
  },
  between: {
    params: ["fieldId", "min", "max"],
    expression: "(value('${fieldId}') < ${min} || value('${fieldId}') > ${max}) && value('${fieldId}') !== null",
  },
  fieldEquals: {
    params: ["fieldId", "value"],
    expression: "value('${fieldId}') === '${value}'",
  },
  fieldNotEquals: {
    params: ["fieldId", "value"],
    expression: "value('${fieldId}') !== '${value}'",
  },
  isEmpty: {
    params: ["fieldId"],
    expression: "isEmpty(value('${fieldId}'))",
  },
  isNotEmpty: {
    params: ["fieldId"],
    expression: "!isEmpty(value('${fieldId}'))",
  },
  fieldsEqual: {
    params: ["fieldId1", "fieldId2"],
    expression: "value('${fieldId1}') === value('${fieldId2}')",
  },
  fieldGreaterThan: {
    params: ["fieldId1", "fieldId2"],
    expression: "value('${fieldId1}') > value('${fieldId2}')",
  },
  fieldLessThan: {
    params: ["fieldId1", "fieldId2"],
    expression: "value('${fieldId1}') < value('${fieldId2}')",
  },
  matches: {
    params: ["fieldId", "pattern"],
    expression: "/${pattern}/.test(value('${fieldId}') || '')",
  },
  minLength: {
    params: ["fieldId", "minLength"],
    expression: "(value('${fieldId}') || '').length < ${minLength}",
  },
  maxLength: {
    params: ["fieldId", "maxLength"],
    expression: "(value('${fieldId}') || '').length > ${maxLength}",
  },
  includes: {
    params: ["fieldId", "value"],
    expression: "(value('${fieldId}') || []).includes('${value}')",
  },
  notIncludes: {
    params: ["fieldId", "value"],
    expression: "!(value('${fieldId}') || []).includes('${value}')",
  },
};

/**
 * Register a custom rule template. Templates are named, parameterized
 * expression generators — a host can add domain-specific shorthands
 * (typically delegating to a function added via registerFunction).
 * Register the same template in every engine that prepares the schema.
 */
export function registerTemplate(name: string, template: RuleTemplate): void {
  if (!/^[a-zA-Z_]\w*$/.test(name)) {
    throw new Error(`Invalid template name: ${name}`);
  }
  RULE_TEMPLATES[name] = template;
}

export function unregisterTemplate(name: string): void {
  delete RULE_TEMPLATES[name];
}

export function resolveTemplate(
  template: RuleTemplate,
  params: Record<string, any>,
  templateId?: string
): ExpressionString {
  let expression = template.expression;

  for (const paramName of template.params) {
    if (!(paramName in params)) {
      throw new Error(
        `Missing required parameter "${paramName}"${templateId ? ` for template "${templateId}"` : ""}`
      );
    }
  }

  for (const [paramName, paramValue] of Object.entries(params)) {
    const paramPattern = new RegExp(
      `\\$\\{${paramName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`,
      "g"
    );

    let valueStr: string;
    if (typeof paramValue === "string") {
      valueStr = paramValue;
    } else if (typeof paramValue === "number" || typeof paramValue === "boolean") {
      valueStr = String(paramValue);
    } else {
      valueStr = JSON.stringify(paramValue);
    }

    // Function replacement — a string replacement would interpret `$&`-style
    // sequences inside param values (e.g. regex patterns) as substitutions.
    expression = expression.replace(paramPattern, () => valueStr);
  }

  return expression;
}

export function isTemplateReference(exprString: string): boolean {
  if (RULE_TEMPLATES[exprString]) return true;

  const templateCallMatch = exprString.match(/^(\w+)\(/);
  if (!templateCallMatch || RULE_TEMPLATES[templateCallMatch[1]] === undefined) {
    return false;
  }

  // A template reference is exactly `name(args)` — the paren opened after the
  // name must close at the END of the string. Compound expressions that merely
  // START with a template name (e.g. "isEmpty(x) && value('y') === 'z'") are
  // plain expressions, not template calls.
  let depth = 0;
  let quote: string | null = null;
  for (let i = templateCallMatch[1].length; i < exprString.length; i++) {
    const ch = exprString[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return i === exprString.length - 1;
    }
  }
  return false;
}

/** Split template args on commas, ignoring commas inside quoted strings
 * (e.g. matches('^[A-Z]{2,4}$') is a single argument). */
function splitTemplateArgs(paramsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of paramsString) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export function parseTemplateReference(exprString: string): { templateId: string; params: Record<string, any> } {
  if (RULE_TEMPLATES[exprString]) {
    return { templateId: exprString, params: {} };
  }

  const match = exprString.match(/^(\w+)\((.*)\)$/);
  if (!match) {
    throw new Error(`Invalid template reference syntax: "${exprString}"`);
  }

  const templateId = match[1];
  const paramsString = match[2].trim();

  const template = RULE_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown template: "${templateId}". Available: ${Object.keys(RULE_TEMPLATES).join(", ")}`);
  }

  const params: Record<string, any> = {};

  if (paramsString) {
    const paramValues = splitTemplateArgs(paramsString);

    const shouldAutoInferFieldId =
      template.params[0] === "fieldId" &&
      paramValues.length < template.params.length;

    let valueIndex = 0;
    for (let i = 0; i < template.params.length; i++) {
      const paramName = template.params[i];

      if (shouldAutoInferFieldId && paramName === "fieldId") {
        continue;
      }

      if (valueIndex < paramValues.length) {
        let value = paramValues[valueIndex].trim();

        if (/^\d+(\.\d+)?$/.test(value)) {
          params[paramName] = parseFloat(value);
        } else if (/^['"].*['"]$/.test(value)) {
          params[paramName] = value.slice(1, -1);
        } else {
          params[paramName] = value;
        }

        valueIndex++;
      }
    }
  }

  return { templateId, params };
}

function resolveExpressionString(exprString: string, rule: any): string {
  if (isTemplateReference(exprString)) {
    const { templateId, params } = parseTemplateReference(exprString);
    const template = RULE_TEMPLATES[templateId];

    if (template.params.includes("fieldId") && !params.fieldId) {
      if (rule.affects && rule.affects.length > 0 && rule.affects[0].target) {
        params.fieldId = rule.affects[0].target;
      } else {
        throw new Error(
          `Rule "${rule.id}" uses template "${templateId}" which requires a fieldId, but no fieldId param was provided and no target found in affects`
        );
      }
    }

    return resolveTemplate(template, params, templateId);
  }

  return exprString;
}

function resolveExpression(expr: any, rule: any): any {
  if (typeof expr === "string") {
    return resolveExpressionString(expr, rule);
  }

  if (Array.isArray(expr)) {
    return expr.map(e => resolveExpression(e, rule));
  }

  if (typeof expr === "object" && expr !== null) {
    if ("expressions" in expr) {
      return {
        ...expr,
        expressions: resolveExpression(expr.expressions, rule),
      };
    }
  }

  return expr;
}

export function resolveRuleTemplates(rules: any[]): any[] {
  return rules.map((rule) => {
    let when = rule.when;

    if (typeof when === "string") {
      when = { expressions: when };
    }

    return {
      ...rule,
      when: resolveExpression(when, rule),
    };
  });
}
