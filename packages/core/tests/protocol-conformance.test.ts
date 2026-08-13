/**
 * Protocol conformance tests — locks in behavior added/fixed during the
 * 2026-08 protocol review:
 * - isEmpty is exported and treats {} as empty (spec §7)
 * - canProgress uses the protocol-wide empty check
 * - template args may contain commas inside quotes (regex quantifiers)
 * - bare-identifier expressions register rule dependencies
 * - the injected isEmpty() expression helper matches spec §7
 */
import { describe, it, expect } from "vitest";
import {
  prepareForm,
  evaluateRules,
  canProgress,
  isEmpty,
  isTemplateReference,
  parseTemplateReference,
  buildRuleDependencies,
  evaluateExpression,
} from "../src/index";
import type { Form } from "../src/index";

describe("isEmpty (spec §7)", () => {
  it("treats null, undefined, '', [], {} as empty", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty("")).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
  });

  it("treats 0, false, 'a', [0], {a:1} as non-empty", () => {
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty("a")).toBe(false);
    expect(isEmpty([0])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
  });
});

describe("canProgress empty semantics", () => {
  const form: Form = {
    fields: [{ id: "docs", meta: { type: "file", label: "Documents" } }],
    layout: [{ id: "s1", meta: { title: "Step" }, children: [{ id: "docs" } as any] }],
    rules: [
      {
        id: "docs-blocking",
        when: "true",
        affects: [{ target: "docs", blocking: true }],
      },
    ],
  };

  it("blocks on an empty object value", () => {
    const prepared = prepareForm(form);
    const { derived } = evaluateRules(prepared, { docs: {} });
    expect(canProgress(derived, { docs: {} })).toBe(false);
  });

  it("progresses on a non-empty value", () => {
    const prepared = prepareForm(form);
    const values = { docs: [{ name: "f.pdf" }] };
    const { derived } = evaluateRules(prepared, values);
    expect(canProgress(derived, values)).toBe(true);
  });
});

describe("template args with commas inside quotes", () => {
  it("keeps a regex quantifier comma inside a quoted pattern", () => {
    const { templateId, params } = parseTemplateReference("matches('^[A-Z]{2,4}$')");
    expect(templateId).toBe("matches");
    expect(params.pattern).toBe("^[A-Z]{2,4}$");
  });

  it("keeps commas inside quoted values for fieldEquals", () => {
    const { params } = parseTemplateReference("fieldEquals('a,b')");
    expect(params.value).toBe("a,b");
  });

  it("still splits unquoted args", () => {
    const { params } = parseTemplateReference("between(0, 150)");
    expect(params.min).toBe(0);
    expect(params.max).toBe(150);
  });

  it("evaluates a comma-quantifier matches rule end to end", () => {
    const form: Form = {
      fields: [{ id: "code", meta: { type: "text", label: "Code" } }],
      layout: [],
      rules: [
        {
          id: "code-format",
          when: "matches('^[A-Z]{2,4}$')",
          affects: [{ target: "code", valid: false, message: "Bad code" }],
        },
      ],
    };
    const prepared = prepareForm(form);
    // Pattern matches → rule fires
    let res = evaluateRules(prepared, { code: "ABC" });
    expect(res.derived.valid.has("code")).toBe(false);
    // Pattern doesn't match → rule doesn't fire
    res = evaluateRules(prepared, { code: "abc" });
    expect(res.derived.valid.has("code")).toBe(true);
  });
});

describe("bare-identifier rule dependencies", () => {
  it("registers bare field names used in expressions", () => {
    const form: Form = {
      fields: [
        { id: "first_name", meta: { type: "text", label: "First" } },
        { id: "age", meta: { type: "number", label: "Age" } },
        { id: "country", meta: { type: "text", label: "Country" } },
      ],
      layout: [],
      rules: [
        { id: "r1", when: "isEmpty(first_name)", affects: [{ target: "first_name", valid: false }] },
        { id: "r2", when: "age >= 18 && value('country') === 'AU'", affects: [{ target: "age", valid: false }] },
      ],
    };
    const deps = buildRuleDependencies(form);
    expect(deps.ruleToFields["r1"].has("first_name")).toBe(true);
    expect(deps.ruleToFields["r2"].has("age")).toBe(true);
    expect(deps.ruleToFields["r2"].has("country")).toBe(true);
    expect(deps.fieldToRules["first_name"].has("r1")).toBe(true);
    expect(deps.fieldToRules["age"].has("r2")).toBe(true);
  });

  it("does not register identifiers that are not fields", () => {
    const form: Form = {
      fields: [{ id: "age", meta: { type: "number", label: "Age" } }],
      layout: [],
      rules: [{ id: "r1", when: "env('mode') === 'x' && age > 1", affects: [{ target: "age", valid: false }] }],
    };
    const deps = buildRuleDependencies(form);
    expect(deps.ruleToFields["r1"].has("age")).toBe(true);
    expect(deps.ruleToFields["r1"].has("env")).toBe(false);
    expect(deps.ruleToFields["r1"].has("mode")).toBe(false);
  });
});

describe("compound expressions starting with a template name", () => {
  it("detects template references only on full-string match", () => {
    expect(isTemplateReference("isEmpty(first_name)")).toBe(true);
    expect(isTemplateReference("matches('^(A|B)$')")).toBe(true); // parens in pattern
    expect(isTemplateReference("isEmpty(other) && value('p') === 'x'")).toBe(false);
    expect(isTemplateReference("isEmpty(a) || isEmpty(b)")).toBe(false);
  });

  it("prepares and evaluates a compound isEmpty rule without throwing", () => {
    const form: Form = {
      fields: [
        { id: "request_type", meta: { type: "select", label: "Purpose" } },
        { id: "other_purpose", meta: { type: "text", label: "Other" } },
      ],
      layout: [],
      rules: [
        {
          id: "req_other",
          when: "isEmpty(other_purpose) && value('request_type') === 'other'",
          affects: [{ target: "other_purpose", valid: false, message: "Please specify" }],
        },
      ],
    };
    const prepared = prepareForm(form); // must not throw
    expect(evaluateRules(prepared, { request_type: "other" }).derived.valid.has("other_purpose")).toBe(false);
    expect(evaluateRules(prepared, { request_type: "standard" }).derived.valid.has("other_purpose")).toBe(true);
  });

  it("isEmpty template agrees with the builtin on empty arrays", () => {
    const form: Form = {
      fields: [{ id: "tags", meta: { type: "select", label: "Tags" } }],
      layout: [],
      rules: [
        { id: "req_tags", when: "isEmpty", affects: [{ target: "tags", valid: false }] },
      ],
    };
    const prepared = prepareForm(form);
    expect(evaluateRules(prepared, { tags: [] }).derived.valid.has("tags")).toBe(false);
    expect(evaluateRules(prepared, { tags: ["vip"] }).derived.valid.has("tags")).toBe(true);
  });
});

describe("container visibility cascade", () => {
  const form: Form = {
    fields: [
      { id: "entity_type", meta: { type: "select", label: "Entity" } },
      { id: "reg_code", meta: { type: "text", label: "Registration code", required: true } },
    ],
    layout: [
      { id: "step1", meta: { title: "Basics" }, children: [{ id: "entity_type" }] },
      { id: "company_step", meta: { title: "Company" }, children: [{ id: "reg_code" }] },
    ],
    rules: [
      {
        id: "hide-company-step",
        when: "value('entity_type') !== 'company'",
        affects: [{ target: "company_step", visible: false }],
      },
      {
        id: "code-blocking",
        when: "true",
        affects: [{ target: "reg_code", blocking: true }],
      },
    ],
  };

  it("hiding a container hides its descendant fields", () => {
    const prepared = prepareForm(form);
    const { derived } = evaluateRules(prepared, { entity_type: "individual" });
    expect(derived.visible.has("company_step")).toBe(false);
    expect(derived.visible.has("reg_code")).toBe(false);
  });

  it("fields in a hidden container do not block progression", () => {
    const prepared = prepareForm(form);
    const values = { entity_type: "individual" };
    const { derived } = evaluateRules(prepared, values);
    expect(canProgress(derived, values)).toBe(true);
  });

  it("showing the container restores field visibility", () => {
    const prepared = prepareForm(form);
    const values = { entity_type: "company" };
    const { derived } = evaluateRules(prepared, values);
    expect(derived.visible.has("company_step")).toBe(true);
    expect(derived.visible.has("reg_code")).toBe(true);
    expect(canProgress(derived, values)).toBe(false); // reg_code blocking + empty
  });
});

describe("injected isEmpty() expression helper (spec §7)", () => {
  it("treats {} as empty inside expressions", () => {
    expect(evaluateExpression("isEmpty(value('x'))", { values: { x: {} } })).toBe(true);
    expect(evaluateExpression("isEmpty(value('x'))", { values: { x: [] } })).toBe(true);
    expect(evaluateExpression("isEmpty(value('x'))", { values: { x: "" } })).toBe(true);
    expect(evaluateExpression("isEmpty(value('x'))", { values: { x: null } })).toBe(true);
    expect(evaluateExpression("isEmpty(value('x'))", { values: { x: "a" } })).toBe(false);
    expect(evaluateExpression("isEmpty(value('x'))", { values: { x: { a: 1 } } })).toBe(false);
  });
});
