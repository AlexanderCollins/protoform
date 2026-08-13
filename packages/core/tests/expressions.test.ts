import { describe, it, expect } from "vitest";
import {
  buildRuleDependencies,
  evaluateExpression,
  clearExpressionCache,
} from "../src/expressions";
import type { Form } from "../src/types";

// Clear cache between tests for isolation
describe("evaluateExpression", () => {
  // --- Literals ---
  describe("literals", () => {
    it("true is truthy", () => {
      expect(evaluateExpression("true", { values: {} })).toBe(true);
    });
    it("false is falsy", () => {
      expect(evaluateExpression("false", { values: {} })).toBe(false);
    });
    it("null is falsy", () => {
      expect(evaluateExpression("null", { values: {} })).toBe(false);
    });
    it("undefined is falsy", () => {
      expect(evaluateExpression("undefined", { values: {} })).toBe(false);
    });
    it("number 42 is truthy", () => {
      expect(evaluateExpression("42", { values: {} })).toBe(true);
    });
    it("number 0 is falsy", () => {
      expect(evaluateExpression("0", { values: {} })).toBe(false);
    });
    it("non-empty string is truthy", () => {
      expect(evaluateExpression("'hello'", { values: {} })).toBe(true);
    });
    it("empty string is falsy", () => {
      expect(evaluateExpression("''", { values: {} })).toBe(false);
    });
  });

  // --- Value lookups ---
  describe("value()", () => {
    it("reads field value", () => {
      expect(evaluateExpression("value('name') === 'Alex'", { values: { name: "Alex" } })).toBe(true);
    });
    it("missing field returns undefined", () => {
      expect(evaluateExpression("value('name') === undefined", { values: {} })).toBe(true);
    });
    it("reads number", () => {
      expect(evaluateExpression("value('age') === 25", { values: { age: 25 } })).toBe(true);
    });
    it("reads boolean", () => {
      expect(evaluateExpression("value('flag') === true", { values: { flag: true } })).toBe(true);
    });
  });

  // --- Env lookups ---
  describe("env()", () => {
    it("reads env value", () => {
      expect(evaluateExpression("env('role') === 'admin'", { values: {}, env: { role: "admin" } })).toBe(true);
    });
    it("missing env key returns undefined", () => {
      expect(evaluateExpression("env('role') === undefined", { values: {}, env: {} })).toBe(true);
    });
    it("undefined env returns undefined", () => {
      expect(evaluateExpression("env('role') === undefined", { values: {} })).toBe(true);
    });
  });

  // --- Comparisons ---
  describe("comparisons", () => {
    it("=== strings", () => {
      expect(evaluateExpression("value('x') === 'AU'", { values: { x: "AU" } })).toBe(true);
      expect(evaluateExpression("value('x') === 'AU'", { values: { x: "US" } })).toBe(false);
    });
    it("!== strings", () => {
      expect(evaluateExpression("value('x') !== 'AU'", { values: { x: "US" } })).toBe(true);
    });
    it(">= numbers", () => {
      expect(evaluateExpression("value('x') >= 18", { values: { x: 18 } })).toBe(true);
      expect(evaluateExpression("value('x') >= 18", { values: { x: 17 } })).toBe(false);
    });
    it("<= numbers", () => {
      expect(evaluateExpression("value('x') <= 18", { values: { x: 18 } })).toBe(true);
    });
    it("> numbers", () => {
      expect(evaluateExpression("value('x') > 18", { values: { x: 19 } })).toBe(true);
      expect(evaluateExpression("value('x') > 18", { values: { x: 18 } })).toBe(false);
    });
    it("< numbers", () => {
      expect(evaluateExpression("value('x') < 18", { values: { x: 17 } })).toBe(true);
    });
    it("=== with null", () => {
      // Missing values normalize to null (undefined ≡ null across engines),
      // matching the Python engine — value('missing') === null is true.
      expect(evaluateExpression("value('x') === null", { values: {} })).toBe(true);
      expect(evaluateExpression("value('x') === undefined", { values: {} })).toBe(true);
      expect(evaluateExpression("value('x') === null", { values: { x: 1 } })).toBe(false);
    });
  });

  // --- Logic ---
  describe("logic operators", () => {
    it("&& both true", () => {
      expect(evaluateExpression("value('a') === 1 && value('b') === 2", { values: { a: 1, b: 2 } })).toBe(true);
    });
    it("&& one false", () => {
      expect(evaluateExpression("value('a') === 1 && value('b') === 2", { values: { a: 1, b: 3 } })).toBe(false);
    });
    it("|| one true", () => {
      expect(evaluateExpression("value('a') === 1 || value('b') === 2", { values: { a: 0, b: 2 } })).toBe(true);
    });
    it("|| both false", () => {
      expect(evaluateExpression("value('a') === 1 || value('b') === 2", { values: { a: 0, b: 0 } })).toBe(false);
    });
    it("! negation", () => {
      expect(evaluateExpression("!value('x')", { values: { x: "" } })).toBe(true);
      expect(evaluateExpression("!value('x')", { values: { x: "hi" } })).toBe(false);
    });
  });

  // --- Member access ---
  describe("member access", () => {
    it(".length on string", () => {
      expect(evaluateExpression("(value('x') || '').length >= 2", { values: { x: "hi" } })).toBe(true);
      expect(evaluateExpression("(value('x') || '').length >= 2", { values: { x: "a" } })).toBe(false);
    });
  });

  // --- Method calls ---
  describe("method calls", () => {
    it(".test() regex", () => {
      expect(evaluateExpression("/^[A-Z]/.test(value('x'))", { values: { x: "Hello" } })).toBe(true);
      expect(evaluateExpression("/^[A-Z]/.test(value('x'))", { values: { x: "hello" } })).toBe(false);
    });
    it(".includes() on string", () => {
      expect(evaluateExpression("(value('x') || '').includes('ell')", { values: { x: "hello" } })).toBe(true);
    });
    it(".includes() on array", () => {
      expect(evaluateExpression("(value('x') || []).includes('a')", { values: { x: ["a", "b"] } })).toBe(true);
      expect(evaluateExpression("(value('x') || []).includes('c')", { values: { x: ["a", "b"] } })).toBe(false);
    });
  });

  // --- Parentheses ---
  describe("parentheses", () => {
    it("changes precedence", () => {
      expect(evaluateExpression(
        "(value('a') === 'x' || value('a') === 'y') && value('b') === 'z'",
        { values: { a: "y", b: "z" } },
      )).toBe(true);
    });
  });

  // --- Compositional expressions ---
  describe("compositional expressions", () => {
    it("string expression", () => {
      expect(evaluateExpression("value('x') === 'hello'", { values: { x: "hello" } })).toBe(true);
    });
    it("Expression object with string", () => {
      expect(evaluateExpression(
        { expressions: "value('x') === 'hello'" },
        { values: { x: "hello" } },
      )).toBe(true);
    });
    it("Expression object with array (AND)", () => {
      expect(evaluateExpression(
        { type: "and", expressions: ["value('a') === 1", "value('b') === 2"] },
        { values: { a: 1, b: 2 } },
      )).toBe(true);
      expect(evaluateExpression(
        { type: "and", expressions: ["value('a') === 1", "value('b') === 2"] },
        { values: { a: 1, b: 3 } },
      )).toBe(false);
    });
    it("Expression object with array (OR)", () => {
      expect(evaluateExpression(
        { type: "or", expressions: ["value('a') === 1", "value('b') === 2"] },
        { values: { a: 1, b: 3 } },
      )).toBe(true);
    });
    it("nested Expression objects", () => {
      expect(evaluateExpression(
        {
          type: "or",
          expressions: [
            "value('a') === 1",
            { type: "and", expressions: ["value('b') === 2", "value('c') === 3"] },
          ],
        },
        { values: { a: 0, b: 2, c: 3 } },
      )).toBe(true);
    });
  });

  // --- Error handling ---
  describe("error handling", () => {
    it("invalid expression returns false", () => {
      expect(evaluateExpression("THIS IS NOT VALID ===", { values: {} })).toBe(false);
    });
  });

  // --- Null coalesce pattern ---
  describe("null coalesce pattern", () => {
    it("value('x') || '' returns '' when x is missing", () => {
      expect(evaluateExpression("(value('x') || '').length === 0", { values: {} })).toBe(true);
    });
    it("value('x') || '' returns value when x is present", () => {
      expect(evaluateExpression("(value('x') || '').length > 0", { values: { x: "hello" } })).toBe(true);
    });
  });
});

describe("buildRuleDependencies", () => {
  it("extracts field references from rules", () => {
    const form: Form = {
      fields: [
        { id: "age", meta: { type: "number", label: "Age" } },
        { id: "name", meta: { type: "text", label: "Name" } },
      ],
      layout: [],
      rules: [
        {
          id: "r1",
          when: "value('age') >= 18",
          affects: [{ target: "age", valid: false }],
        },
      ],
    };
    const deps = buildRuleDependencies(form);
    expect(deps.ruleToFields["r1"].has("age")).toBe(true);
    expect(deps.fieldToRules["age"].has("r1")).toBe(true);
  });

  it("handles multiple fields in one rule", () => {
    const form: Form = {
      fields: [
        { id: "a", meta: { type: "text", label: "A" } },
        { id: "b", meta: { type: "text", label: "B" } },
      ],
      layout: [],
      rules: [
        {
          id: "r1",
          when: "value('a') > value('b')",
          affects: [{ target: "a" }],
        },
      ],
    };
    const deps = buildRuleDependencies(form);
    expect(deps.ruleToFields["r1"].has("a")).toBe(true);
    expect(deps.ruleToFields["r1"].has("b")).toBe(true);
  });

  it("initializes fieldToRules for fields with no rules", () => {
    const form: Form = {
      fields: [{ id: "x", meta: { type: "text", label: "X" } }],
      layout: [],
      rules: [],
    };
    const deps = buildRuleDependencies(form);
    expect(deps.fieldToRules["x"]).toBeDefined();
    expect(deps.fieldToRules["x"].size).toBe(0);
  });

  it("handles compositional expressions", () => {
    const form: Form = {
      fields: [
        { id: "a", meta: { type: "text", label: "A" } },
        { id: "b", meta: { type: "text", label: "B" } },
      ],
      layout: [],
      rules: [
        {
          id: "r1",
          when: { type: "or", expressions: ["value('a') === 1", "value('b') === 2"] },
          affects: [{ target: "a" }],
        },
      ],
    };
    const deps = buildRuleDependencies(form);
    expect(deps.ruleToFields["r1"].has("a")).toBe(true);
    expect(deps.ruleToFields["r1"].has("b")).toBe(true);
  });
});

describe("clearExpressionCache", () => {
  it("does not throw", () => {
    expect(() => clearExpressionCache()).not.toThrow();
  });
});
