import type {
  Expression,
  ExpressionString,
  ExpressionContext,
  Form,
  RuleDependencies,
  RuleKey,
  FieldKey,
} from "./types";

// Dependency Extraction

const FIELD_REFERENCE_REGEX = /value\(\s*['"]([^'"]+)['"]\s*\)/g;
const IDENTIFIER_REGEX = /\b[a-zA-Z_$][\w$]*\b/g;

function extractFieldsFromString(
  exprString: ExpressionString,
  knownFields?: Set<FieldKey>
): Set<FieldKey> {
  const fields = new Set<FieldKey>();
  FIELD_REFERENCE_REGEX.lastIndex = 0;
  let match;
  while ((match = FIELD_REFERENCE_REGEX.exec(exprString)) !== null) {
    fields.add(match[1]);
  }

  // Bare identifiers that name a known field also create dependencies —
  // the compiler injects every field id as a local variable, so
  // `age >= 18` depends on `age` just like `value('age') >= 18` does.
  if (knownFields) {
    IDENTIFIER_REGEX.lastIndex = 0;
    while ((match = IDENTIFIER_REGEX.exec(exprString)) !== null) {
      if (knownFields.has(match[0])) fields.add(match[0]);
    }
  }

  return fields;
}

function extractFieldsFromExpression(
  expr: Expression | ExpressionString,
  knownFields?: Set<FieldKey>
): Set<FieldKey> {
  const fields = new Set<FieldKey>();

  if (typeof expr === "string") {
    return extractFieldsFromString(expr, knownFields);
  }

  const { expressions } = expr;

  if (typeof expressions === "string") {
    const extracted = extractFieldsFromString(expressions, knownFields);
    extracted.forEach((f) => fields.add(f));
  } else if (!Array.isArray(expressions) && typeof expressions === "object") {
    const extracted = extractFieldsFromExpression(expressions, knownFields);
    extracted.forEach((f) => fields.add(f));
  } else if (Array.isArray(expressions)) {
    for (const item of expressions) {
      const extracted =
        typeof item === "string"
          ? extractFieldsFromString(item, knownFields)
          : extractFieldsFromExpression(item, knownFields);
      extracted.forEach((f) => fields.add(f));
    }
  }

  return fields;
}

export function buildRuleDependencies(form: Form): RuleDependencies {
  const ruleToFields: Record<RuleKey, Set<FieldKey>> = {};
  const fieldToRules: Record<FieldKey, Set<RuleKey>> = {};

  const knownFields = new Set<FieldKey>(form.fields.map((f) => f.id));

  for (const field of form.fields) {
    fieldToRules[field.id] = new Set();
  }

  for (const rule of form.rules) {
    const fields = extractFieldsFromExpression(rule.when, knownFields);
    ruleToFields[rule.id] = fields;

    for (const fieldId of fields) {
      if (!fieldToRules[fieldId]) {
        fieldToRules[fieldId] = new Set();
      }
      fieldToRules[fieldId].add(rule.id);
    }
  }

  return { ruleToFields, fieldToRules };
}

// Expression Evaluation
//
// Expressions are parsed and evaluated by the safe recursive-descent parser
// in parser.ts — no eval / new Function, so the engine works under a strict
// Content-Security-Policy and schema expressions cannot execute arbitrary
// code. The parser is a direct port of the Python engine's; the conformance
// suite keeps the two identical.

import { safeEvaluate, clearParserCache } from "./parser";

function evaluateExpressionString(
  exprString: ExpressionString,
  ctx: ExpressionContext
): boolean {
  return safeEvaluate(exprString, { values: ctx.values, env: ctx.env });
}

export function evaluateExpression(
  expr: Expression | ExpressionString,
  ctx: ExpressionContext
): boolean {
  if (typeof expr === "string") {
    return evaluateExpressionString(expr, ctx);
  }

  const { type = "and", expressions } = expr;

  if (typeof expressions === "string") {
    return evaluateExpressionString(expressions, ctx);
  }

  if (!Array.isArray(expressions) && typeof expressions === "object") {
    return evaluateExpression(expressions, ctx);
  }

  if (Array.isArray(expressions)) {
    const results = expressions.map((item) => {
      if (typeof item === "string") {
        return evaluateExpressionString(item, ctx);
      } else {
        return evaluateExpression(item, ctx);
      }
    });

    if (type === "or") {
      return results.some((r) => r);
    } else {
      return results.every((r) => r);
    }
  }

  return false;
}

export function clearExpressionCache(): void {
  clearParserCache();
}
