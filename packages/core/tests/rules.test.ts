import { describe, it, expect } from "vitest";
import { prepareForm, evaluateRules, canProgress } from "../src/rules";
import type { Form } from "../src/types";

const SIMPLE_FORM: Form = {
  fields: [
    { id: "name", meta: { type: "text", label: "Name", required: true } },
    { id: "email", meta: { type: "email", label: "Email", required: true } },
  ],
  layout: [
    {
      id: "main",
      meta: { title: "Main" },
      children: [
        { id: "name", meta: { type: "text", label: "Name", required: true } },
        { id: "email", meta: { type: "email", label: "Email", required: true } },
      ],
    },
  ],
  rules: [],
};

const VALIDATION_FORM: Form = {
  fields: [
    { id: "age", meta: { type: "number", label: "Age", required: true } },
    { id: "code", meta: { type: "text", label: "Code" } },
  ],
  layout: [
    {
      id: "main",
      meta: { title: "Main" },
      children: [
        { id: "age", meta: { type: "number", label: "Age", required: true } },
        { id: "code", meta: { type: "text", label: "Code" } },
      ],
    },
  ],
  rules: [
    {
      id: "age_min",
      when: "value('age') < 18 && value('age') !== null && value('age') !== ''",
      affects: [
        { target: "age", valid: false, blocking: true, message: "Must be 18+", type: "error" },
      ],
    },
    {
      id: "code_length",
      when: "value('code') !== null && value('code') !== '' && (value('code') || '').length < 6",
      affects: [
        { target: "code", valid: false, message: "Min 6 chars", type: "error" },
      ],
    },
  ],
};

const CHAINED_FORM: Form = {
  fields: [
    { id: "type", meta: { type: "select", label: "Type" } },
    { id: "detail", meta: { type: "text", label: "Detail" } },
  ],
  layout: [
    {
      id: "main",
      meta: { title: "Main" },
      children: [
        { id: "type", meta: { type: "select", label: "Type" } },
        { id: "detail", meta: { type: "text", label: "Detail" } },
      ],
    },
  ],
  rules: [
    {
      id: "show_detail",
      when: "value('type') === 'advanced'",
      affects: [{ target: "detail", visible: true, required: true }],
    },
    {
      id: "hide_detail",
      when: "value('type') !== 'advanced'",
      affects: [{ target: "detail", visible: false }],
    },
  ],
};

describe("prepareForm", () => {
  it("returns all required keys", () => {
    const prepared = prepareForm(SIMPLE_FORM);
    expect(prepared).toHaveProperty("form");
    expect(prepared).toHaveProperty("dependencies");
    expect(prepared).toHaveProperty("containerDescendants");
    expect(prepared).toHaveProperty("fieldToContainer");
  });

  it("builds container descendants", () => {
    const prepared = prepareForm(SIMPLE_FORM);
    expect(new Set(prepared.containerDescendants["main"])).toEqual(new Set(["name", "email"]));
  });

  it("builds field to container", () => {
    const prepared = prepareForm(SIMPLE_FORM);
    expect(prepared.fieldToContainer["name"]).toBe("main");
  });

  it("resolves templates", () => {
    const form: Form = {
      fields: [{ id: "age", meta: { type: "number", label: "Age" } }],
      layout: [{ id: "main", meta: { title: "M" }, children: [
        { id: "age", meta: { type: "number", label: "Age" } },
      ] }],
      rules: [
        { id: "r1", when: "minValue(18)", affects: [{ target: "age", valid: false }] },
      ],
    };
    const prepared = prepareForm(form);
    // The when should be transformed from a template reference
    expect(typeof prepared.form.rules[0].when).toBe("object");
  });
});

describe("evaluateRules", () => {
  describe("base state", () => {
    it("all fields visible", () => {
      const prepared = prepareForm(SIMPLE_FORM);
      const { derived } = evaluateRules(prepared, {});
      expect(derived.visible.has("name")).toBe(true);
      expect(derived.visible.has("email")).toBe(true);
      expect(derived.visible.has("main")).toBe(true);
    });

    it("required from meta", () => {
      const prepared = prepareForm(SIMPLE_FORM);
      const { derived } = evaluateRules(prepared, {});
      expect(derived.required.has("name")).toBe(true);
      expect(derived.required.has("email")).toBe(true);
    });

    it("all fields valid initially", () => {
      const prepared = prepareForm(SIMPLE_FORM);
      const { derived } = evaluateRules(prepared, {});
      expect(derived.valid.has("name")).toBe(true);
      expect(derived.valid.has("email")).toBe(true);
    });

    it("disabled from meta", () => {
      const form: Form = {
        ...SIMPLE_FORM,
        fields: [{ id: "x", meta: { type: "text", label: "X", disabled: true } }],
      };
      const prepared = prepareForm(form);
      const { derived } = evaluateRules(prepared, {});
      expect(derived.disabled.has("x")).toBe(true);
    });
  });

  describe("visibility rules", () => {
    it("hides field when rule fires", () => {
      const prepared = prepareForm(CHAINED_FORM);
      const { derived } = evaluateRules(prepared, { type: "basic" });
      expect(derived.visible.has("detail")).toBe(false);
    });

    it("shows field when rule fires", () => {
      const prepared = prepareForm(CHAINED_FORM);
      const { derived } = evaluateRules(prepared, { type: "advanced" });
      expect(derived.visible.has("detail")).toBe(true);
    });
  });

  describe("validation rules", () => {
    it("marks field invalid", () => {
      const prepared = prepareForm(VALIDATION_FORM);
      const { derived } = evaluateRules(prepared, { age: 10 });
      expect(derived.valid.has("age")).toBe(false);
    });

    it("field remains valid when rule doesn't fire", () => {
      const prepared = prepareForm(VALIDATION_FORM);
      const { derived } = evaluateRules(prepared, { age: 25 });
      expect(derived.valid.has("age")).toBe(true);
    });

    it("adds error message", () => {
      const prepared = prepareForm(VALIDATION_FORM);
      const { derived } = evaluateRules(prepared, { age: 10 });
      const msgs = derived.messages["age"];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe("error");
      expect(msgs[0].message).toBe("Must be 18+");
    });

    it("sets blocking target", () => {
      const prepared = prepareForm(VALIDATION_FORM);
      const { derived } = evaluateRules(prepared, { age: 10 });
      expect(derived.blockingTargets.has("age")).toBe(true);
    });
  });

  describe("required_parent", () => {
    it("skips child when parent is false", () => {
      const form: Form = {
        fields: [
          { id: "a", meta: { type: "text", label: "A" } },
          { id: "b", meta: { type: "text", label: "B" } },
        ],
        layout: [{ id: "main", meta: { title: "M" }, children: [
          { id: "a", meta: { type: "text", label: "A" } },
          { id: "b", meta: { type: "text", label: "B" } },
        ] }],
        rules: [
          { id: "parent", when: "value('a') === 'yes'", affects: [{ target: "b", visible: true }] },
          { id: "child", when: "true", required_parent: ["parent"], affects: [{ target: "b", required: true }] },
        ],
      };
      const prepared = prepareForm(form);
      const { derived } = evaluateRules(prepared, { a: "no" });
      expect(derived.required.has("b")).toBe(false);
    });

    it("applies child when parent is true", () => {
      const form: Form = {
        fields: [
          { id: "a", meta: { type: "text", label: "A" } },
          { id: "b", meta: { type: "text", label: "B" } },
        ],
        layout: [{ id: "main", meta: { title: "M" }, children: [
          { id: "a", meta: { type: "text", label: "A" } },
          { id: "b", meta: { type: "text", label: "B" } },
        ] }],
        rules: [
          { id: "parent", when: "value('a') === 'yes'", affects: [{ target: "b", visible: true }] },
          { id: "child", when: "true", required_parent: ["parent"], affects: [{ target: "b", required: true }] },
        ],
      };
      const prepared = prepareForm(form);
      const { derived } = evaluateRules(prepared, { a: "yes" });
      expect(derived.required.has("b")).toBe(true);
    });
  });

  describe("later rules override earlier", () => {
    it("visibility", () => {
      const form: Form = {
        fields: [{ id: "x", meta: { type: "text", label: "X" } }],
        layout: [{ id: "main", meta: { title: "M" }, children: [
          { id: "x", meta: { type: "text", label: "X" } },
        ] }],
        rules: [
          { id: "r1", when: "true", affects: [{ target: "x", visible: false }] },
          { id: "r2", when: "true", affects: [{ target: "x", visible: true }] },
        ],
      };
      const prepared = prepareForm(form);
      const { derived } = evaluateRules(prepared, {});
      expect(derived.visible.has("x")).toBe(true);
    });
  });

  describe("container completeness", () => {
    it("complete when all required fields filled", () => {
      const prepared = prepareForm(SIMPLE_FORM);
      const { progress } = evaluateRules(prepared, { name: "Alex", email: "a@b.com" });
      expect(progress.completeContainers.has("main")).toBe(true);
    });

    it("incomplete when required field missing", () => {
      const prepared = prepareForm(SIMPLE_FORM);
      const { progress } = evaluateRules(prepared, { name: "Alex" });
      expect(progress.completeContainers.has("main")).toBe(false);
    });

    it("hidden fields don't block completeness", () => {
      const prepared = prepareForm(CHAINED_FORM);
      const { progress } = evaluateRules(prepared, { type: "basic" });
      // "detail" is hidden, so main should be complete
      expect(progress.completeContainers.has("main")).toBe(true);
    });
  });

  describe("progress", () => {
    it("currentContainer from param", () => {
      const prepared = prepareForm(SIMPLE_FORM);
      const { progress } = evaluateRules(prepared, {}, undefined, "main");
      expect(progress.currentContainer).toBe("main");
    });

    it("currentContainer defaults to null", () => {
      const prepared = prepareForm(SIMPLE_FORM);
      const { progress } = evaluateRules(prepared, {});
      expect(progress.currentContainer).toBeNull();
    });
  });

  describe("read_only affect", () => {
    it("sets readOnly", () => {
      const form: Form = {
        fields: [{ id: "x", meta: { type: "text", label: "X" } }],
        layout: [{ id: "main", meta: { title: "M" }, children: [
          { id: "x", meta: { type: "text", label: "X" } },
        ] }],
        rules: [
          { id: "r1", when: "true", affects: [{ target: "x", read_only: true }] },
        ],
      };
      const prepared = prepareForm(form);
      const { derived } = evaluateRules(prepared, {});
      expect(derived.readOnly.has("x")).toBe(true);
    });
  });

  describe("env context", () => {
    it("passes env to expressions", () => {
      const form: Form = {
        fields: [{ id: "x", meta: { type: "text", label: "X" } }],
        layout: [{ id: "main", meta: { title: "M" }, children: [
          { id: "x", meta: { type: "text", label: "X" } },
        ] }],
        rules: [
          { id: "r1", when: "env('mode') === 'admin'", affects: [{ target: "x", visible: false }] },
        ],
      };
      const prepared = prepareForm(form);
      const { derived } = evaluateRules(prepared, {}, { mode: "admin" });
      expect(derived.visible.has("x")).toBe(false);
    });
  });
});

describe("canProgress", () => {
  it("true when no blocking targets", () => {
    const prepared = prepareForm(SIMPLE_FORM);
    const { derived } = evaluateRules(prepared, {});
    expect(canProgress(derived, {})).toBe(true);
  });

  it("false when blocking target is invalid", () => {
    const prepared = prepareForm(VALIDATION_FORM);
    const { derived } = evaluateRules(prepared, { age: 10 });
    expect(canProgress(derived, { age: 10 })).toBe(false);
  });

  it("true when blocking target is valid", () => {
    const prepared = prepareForm(VALIDATION_FORM);
    const { derived } = evaluateRules(prepared, { age: 25 });
    expect(canProgress(derived, { age: 25 })).toBe(true);
  });

  it("hidden blocking target is ignored", () => {
    const form: Form = {
      fields: [{ id: "x", meta: { type: "text", label: "X" } }],
      layout: [{ id: "main", meta: { title: "M" }, children: [
        { id: "x", meta: { type: "text", label: "X" } },
      ] }],
      rules: [
        { id: "r1", when: "true", affects: [{ target: "x", visible: false }] },
        { id: "r2", when: "true", affects: [{ target: "x", blocking: true, valid: false }] },
      ],
    };
    const prepared = prepareForm(form);
    const { derived } = evaluateRules(prepared, {});
    expect(canProgress(derived, {})).toBe(true);
  });

  it("empty array blocks progress", () => {
    const prepared = prepareForm(VALIDATION_FORM);
    const { derived } = evaluateRules(prepared, { age: 10 });
    // age is blocking; test with empty array
    expect(canProgress(derived, { age: [] })).toBe(false);
  });
});
