import { describe, it, expect } from "vitest";
import {
  RULE_TEMPLATES,
  resolveTemplate,
  isTemplateReference,
  parseTemplateReference,
  resolveRuleTemplates,
} from "../src/templates";

describe("RULE_TEMPLATES", () => {
  it("has 15 templates", () => {
    expect(Object.keys(RULE_TEMPLATES).length).toBe(15);
  });

  it("all templates have required fields", () => {
    for (const [, tpl] of Object.entries(RULE_TEMPLATES)) {
      expect(Array.isArray(tpl.params)).toBe(true);
      expect(typeof tpl.expression).toBe("string");
    }
  });

  const expected = [
    "minValue", "maxValue", "between", "fieldEquals", "fieldNotEquals",
    "isEmpty", "isNotEmpty", "fieldsEqual", "fieldGreaterThan",
    "fieldLessThan", "matches", "minLength", "maxLength",
    "includes", "notIncludes",
  ];
  it.each(expected)("contains %s", (name) => {
    expect(RULE_TEMPLATES[name]).toBeDefined();
  });
});

describe("resolveTemplate", () => {
  it("resolves minValue", () => {
    const result = resolveTemplate(RULE_TEMPLATES.minValue, { fieldId: "age", minValue: 18 });
    expect(result).toContain("value('age')");
    expect(result).toContain("18");
  });

  it("resolves fieldEquals", () => {
    const result = resolveTemplate(RULE_TEMPLATES.fieldEquals, { fieldId: "country", value: "AU" });
    expect(result).toBe("value('country') === 'AU'");
  });

  it("resolves fieldsEqual", () => {
    const result = resolveTemplate(RULE_TEMPLATES.fieldsEqual, { fieldId1: "pw", fieldId2: "pw2" });
    expect(result).toBe("value('pw') === value('pw2')");
  });

  it("throws on missing param", () => {
    expect(() => resolveTemplate(RULE_TEMPLATES.minValue, { fieldId: "age" })).toThrow("Missing required parameter");
  });
});

describe("isTemplateReference", () => {
  it("bare name", () => {
    expect(isTemplateReference("isEmpty")).toBe(true);
  });
  it("function call", () => {
    expect(isTemplateReference("minValue(18)")).toBe(true);
  });
  it("not a template", () => {
    expect(isTemplateReference("value('x') > 5")).toBe(false);
  });
  it("unknown function", () => {
    expect(isTemplateReference("fakeTemplate(1)")).toBe(false);
  });
});

describe("parseTemplateReference", () => {
  it("bare name", () => {
    const { templateId, params } = parseTemplateReference("isEmpty");
    expect(templateId).toBe("isEmpty");
    expect(params).toEqual({});
  });

  it("numeric arg", () => {
    const { templateId, params } = parseTemplateReference("minValue(18)");
    expect(templateId).toBe("minValue");
    expect(params.minValue).toBe(18);
  });

  it("string arg", () => {
    const { templateId, params } = parseTemplateReference("fieldEquals('AU')");
    expect(templateId).toBe("fieldEquals");
    expect(params.value).toBe("AU");
  });

  it("multiple args", () => {
    const { templateId, params } = parseTemplateReference("between(0, 150)");
    expect(templateId).toBe("between");
    expect(params.min).toBe(0);
    expect(params.max).toBe(150);
  });

  it("two-field template", () => {
    const { params } = parseTemplateReference("fieldsEqual(password, confirmPassword)");
    expect(params.fieldId1).toBe("password");
    expect(params.fieldId2).toBe("confirmPassword");
  });

  it("throws on invalid syntax", () => {
    expect(() => parseTemplateReference("not a template")).toThrow("Invalid template reference");
  });

  it("throws on unknown template", () => {
    expect(() => parseTemplateReference("fakeTemplate(1)")).toThrow("Unknown template");
  });

  it("auto-infers fieldId when fewer args", () => {
    const { params } = parseTemplateReference("minValue(18)");
    expect(params.fieldId).toBeUndefined();
    expect(params.minValue).toBe(18);
  });
});

describe("resolveRuleTemplates", () => {
  it("resolves string when", () => {
    const rules = [
      { id: "r1", when: "minValue(18)", affects: [{ target: "age", valid: false }] },
    ];
    const resolved = resolveRuleTemplates(rules);
    expect(typeof resolved[0].when).toBe("object");
    expect(resolved[0].when.expressions).toContain("value('age')");
  });

  it("preserves non-template expression", () => {
    const rules = [
      { id: "r1", when: "value('x') > 5", affects: [{ target: "x" }] },
    ];
    const resolved = resolveRuleTemplates(rules);
    expect(resolved[0].when.expressions).toBe("value('x') > 5");
  });

  it("preserves other rule fields", () => {
    const rules = [
      { id: "r1", when: "true", affects: [{ target: "x" }], required_parent: ["r0"] },
    ];
    const resolved = resolveRuleTemplates(rules);
    expect(resolved[0].id).toBe("r1");
    expect(resolved[0].required_parent).toEqual(["r0"]);
  });

  it("resolves nested expression objects", () => {
    const rules = [
      {
        id: "r1",
        when: { type: "and" as const, expressions: ["minValue(18)"] },
        affects: [{ target: "age", valid: false }],
      },
    ];
    const resolved = resolveRuleTemplates(rules);
    const inner = resolved[0].when.expressions;
    expect(Array.isArray(inner)).toBe(true);
    expect(inner[0]).toContain("value('age')");
  });
});

describe("custom function + template registration", () => {
  it("registers, resolves, evaluates, and fails closed when missing", async () => {
    const { registerFunction, unregisterFunction, registerTemplate, unregisterTemplate, prepareForm, evaluateRules, evaluateExpression } =
      await import("../src/index");

    // Toy checksum: valid when the digit sum is divisible by 7
    registerFunction("checksumFails", (v: any) => {
      if (!v) return false;
      const sum = String(v).split("").filter((c) => /\d/.test(c)).reduce((a, c) => a + Number(c), 0);
      return sum % 7 !== 0;
    });
    registerTemplate("checksumInvalid", {
      params: ["fieldId"],
      expression: "checksumFails(value('${fieldId}'))",
    });
    try {
      const form = {
        fields: [{ id: "code", meta: { type: "text", label: "Code" } }],
        layout: [],
        rules: [
          { id: "r1", when: "checksumInvalid", affects: [{ target: "code", valid: false, message: "Invalid code" }] },
        ],
      } as any;
      const prepared = prepareForm(form);
      expect(evaluateRules(prepared, { code: "7000" }).derived.valid.has("code")).toBe(true);
      expect(evaluateRules(prepared, { code: "1234" }).derived.valid.has("code")).toBe(false);
      expect(evaluateRules(prepared, {}).derived.valid.has("code")).toBe(true);
    } finally {
      unregisterFunction("checksumFails");
      unregisterTemplate("checksumInvalid");
    }
    // Unregistered functions fail closed
    expect(evaluateExpression("noSuchFunction(value('x'))", { values: { x: 1 } })).toBe(false);
  });
});

describe("backslash-safe param substitution", () => {
  it("resolves regex patterns containing backslashes and $ sequences", () => {
    const result = resolveTemplate(RULE_TEMPLATES.matches, { fieldId: "code", pattern: "^\\d{4}$&" });
    expect(result).toBe("/^\\d{4}$&/.test(value('code') || '')");
  });
});
