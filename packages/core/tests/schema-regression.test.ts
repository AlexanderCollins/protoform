/**
 * Schema regression tests — backwards compatibility.
 *
 * These tests define "real-world" schema shapes that exist in production
 * of a production consumer and assert that prepareForm + evaluateRules continue to
 * produce expected output. If a core change breaks one of these tests,
 * it means a production schema would break.
 *
 * RULES:
 * - Never remove a test from this file without confirming no production
 *   schemas rely on that pattern.
 * - When adding new schema patterns, add a test here first.
 */
import { describe, it, expect } from "vitest";
import {
  prepareForm,
  evaluateRules,
  isContainerComplete,
  buildContainerDescendants,
  buildFieldToContainer,
  computeCompleteContainers,
} from "../src/index";
import type { Form, DerivedState, FormProgress } from "../src/index";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function evalForm(schema: Form, values: Record<string, any> = {}) {
  const prepared = prepareForm(schema);
  const { derived, progress } = evaluateRules(prepared, values, {}, null);
  return { prepared, derived, progress };
}

// ---------------------------------------------------------------------------
// Schema shapes from production
// ---------------------------------------------------------------------------

/** Standard multi-step form with text/select/checkbox fields */
const STANDARD_MULTI_STEP: Form = {
  fields: [
    { id: "full_name", meta: { type: "text", label: "Full Name", required: true, properties: { placeholder: "Enter name" } } },
    { id: "email", meta: { type: "email", label: "Email", required: true, properties: {} } },
    { id: "age", meta: { type: "number", label: "Age", required: false, properties: {} } },
    { id: "agree", meta: { type: "checkbox", label: "I agree to terms", required: true, properties: {} } },
    { id: "plan", meta: { type: "select", label: "Plan", required: true, properties: { options: ["basic", "premium"] } } },
  ],
  layout: [
    { id: "personal", meta: { title: "Personal Details" }, children: [{ id: "full_name" }, { id: "email" }, { id: "age" }] },
    { id: "agreement", meta: { title: "Agreement" }, children: [{ id: "agree" }, { id: "plan" }] },
  ],
  rules: [
    { id: "r1", when: "value('age') < 18", affects: [{ target: "age", valid: false, message: "Must be 18 or older" }] },
  ],
};

/** Schema with integration step (empty children, meta.type = "integration") */
const WITH_INTEGRATION_STEP: Form = {
  fields: [
    { id: "name", meta: { type: "text", label: "Name", required: true, properties: {} } },
    { id: "__integration_placeholder_step_idv", meta: { type: "hidden", label: "", properties: {} } },
  ],
  layout: [
    { id: "personal", meta: { title: "Personal" }, children: [{ id: "name" }] },
    {
      id: "step_idv",
      meta: {
        title: "Identity Verification",
        type: "integration",
        integration_id: "abc-123",
        delivery_mode: "iframe",
        description: "Complete identity verification",
      },
      children: [{ id: "__integration_placeholder_step_idv" }],
    },
  ],
  rules: [],
};

/** Schema with conditional visibility rules */
const WITH_VISIBILITY_RULES: Form = {
  fields: [
    { id: "has_partner", meta: { type: "checkbox", label: "Do you have a partner?", required: false, properties: {} } },
    { id: "partner_name", meta: { type: "text", label: "Partner Name", required: false, properties: {} } },
    { id: "income", meta: { type: "number", label: "Income", required: true, properties: {} } },
  ],
  layout: [
    { id: "step1", meta: { title: "Details" }, children: [{ id: "has_partner" }, { id: "partner_name" }, { id: "income" }] },
  ],
  rules: [
    { id: "r_show_partner", when: "value('has_partner') === true", affects: [{ target: "partner_name", visible: true }] },
    { id: "r_hide_partner", when: "value('has_partner') !== true", affects: [{ target: "partner_name", visible: false }] },
  ],
};

/** Schema with field.meta.properties.integration (field-level lookup) */
const WITH_FIELD_INTEGRATION: Form = {
  fields: [
    {
      id: "address",
      meta: {
        type: "text",
        label: "Address",
        required: true,
        properties: {
          placeholder: "Start typing...",
          integration: {
            integration_id: "google-places-uuid",
            trigger: "debounce",
            debounce_ms: 300,
            result_mapping: { suburb: "suburb", postcode: "postcode", state: "state" },
          },
        },
      },
    },
    { id: "suburb", meta: { type: "text", label: "Suburb", required: false, properties: {} } },
    { id: "postcode", meta: { type: "text", label: "Postcode", required: false, properties: {} } },
    { id: "state", meta: { type: "text", label: "State", required: false, properties: {} } },
  ],
  layout: [
    { id: "address_step", meta: { title: "Address" }, children: [{ id: "address" }, { id: "suburb" }, { id: "postcode" }, { id: "state" }] },
  ],
  rules: [],
};

/** Minimal single-field schema — the simplest valid form */
const MINIMAL_SCHEMA: Form = {
  fields: [{ id: "q1", meta: { type: "text", label: "Question", required: false, properties: {} } }],
  layout: [{ id: "page", meta: { title: "Page" }, children: [{ id: "q1" }] }],
  rules: [],
};

/** Empty schema — no fields, no layout */
const EMPTY_SCHEMA: Form = { fields: [], layout: [], rules: [] };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Schema regression — standard multi-step", () => {
  it("prepareForm succeeds", () => {
    const { prepared } = evalForm(STANDARD_MULTI_STEP);
    expect(prepared.form).toBeDefined();
    expect(prepared.form.fields.length).toBe(5);
    expect(prepared.form.layout.length).toBe(2);
  });

  it("container descendants are correct", () => {
    const { prepared } = evalForm(STANDARD_MULTI_STEP);
    expect(prepared.containerDescendants["personal"]).toEqual(["full_name", "email", "age"]);
    expect(prepared.containerDescendants["agreement"]).toEqual(["agree", "plan"]);
  });

  it("all fields visible by default", () => {
    const { derived } = evalForm(STANDARD_MULTI_STEP);
    for (const fid of ["full_name", "email", "age", "agree", "plan"]) {
      expect(derived.visible.has(fid)).toBe(true);
    }
  });

  it("required fields are required", () => {
    const { derived } = evalForm(STANDARD_MULTI_STEP);
    expect(derived.required.has("full_name")).toBe(true);
    expect(derived.required.has("email")).toBe(true);
    expect(derived.required.has("age")).toBe(false);
    expect(derived.required.has("agree")).toBe(true);
  });

  it("validation rule fires correctly", () => {
    const { derived } = evalForm(STANDARD_MULTI_STEP, { age: 15 });
    expect(derived.valid.has("age")).toBe(false);
    const ageMessages = derived.messages["age"] || [];
    expect(ageMessages.some((m: any) => m.message === "Must be 18 or older")).toBe(true);
  });

  it("validation rule passes when condition met", () => {
    const { derived } = evalForm(STANDARD_MULTI_STEP, { age: 25 });
    expect(derived.valid.has("age")).toBe(true);
  });

  it("step incomplete when required fields empty", () => {
    const { prepared, derived, progress } = evalForm(STANDARD_MULTI_STEP, {});
    expect(progress.completeContainers.has("personal")).toBe(false);
  });

  it("step complete when required fields filled", () => {
    const { progress } = evalForm(STANDARD_MULTI_STEP, {
      full_name: "Alice",
      email: "alice@test.com",
    });
    expect(progress.completeContainers.has("personal")).toBe(true);
  });
});

describe("Schema regression — integration step", () => {
  it("prepareForm handles integration step with placeholder field", () => {
    const { prepared } = evalForm(WITH_INTEGRATION_STEP);
    expect(prepared.form.layout.length).toBe(2);
    expect(prepared.form.fields.length).toBe(2);
  });

  it("integration step meta is preserved", () => {
    const { prepared } = evalForm(WITH_INTEGRATION_STEP);
    const idvStep = prepared.form.layout.find((s) => s.id === "step_idv");
    expect(idvStep).toBeDefined();
    expect(idvStep!.meta.type).toBe("integration");
    expect(idvStep!.meta.integration_id).toBe("abc-123");
    expect(idvStep!.meta.delivery_mode).toBe("iframe");
  });

  it("integration placeholder field is a hidden type", () => {
    const { prepared } = evalForm(WITH_INTEGRATION_STEP);
    const ph = prepared.form.fields.find((f) => f.id === "__integration_placeholder_step_idv");
    expect(ph).toBeDefined();
    expect(ph!.meta.type).toBe("hidden");
  });

  it("integration step is complete (placeholder has no required constraint)", () => {
    const { progress } = evalForm(WITH_INTEGRATION_STEP, { name: "Bob" });
    // The integration step has only a hidden placeholder — should be "complete"
    expect(progress.completeContainers.has("step_idv")).toBe(true);
  });
});

describe("Schema regression — visibility rules", () => {
  it("partner_name is hidden when has_partner is falsy", () => {
    const { derived } = evalForm(WITH_VISIBILITY_RULES, {});
    expect(derived.visible.has("partner_name")).toBe(false);
  });

  it("partner_name is visible when has_partner is true", () => {
    const { derived } = evalForm(WITH_VISIBILITY_RULES, { has_partner: true });
    expect(derived.visible.has("partner_name")).toBe(true);
  });

  it("hidden fields don't block step completion", () => {
    const { progress } = evalForm(WITH_VISIBILITY_RULES, { income: 50000 });
    // partner_name is hidden and not required — step should be complete
    expect(progress.completeContainers.has("step1")).toBe(true);
  });
});

describe("Schema regression — field-level integration meta", () => {
  it("preserves integration properties in field meta", () => {
    const { prepared } = evalForm(WITH_FIELD_INTEGRATION);
    const addr = prepared.form.fields.find((f) => f.id === "address");
    expect(addr!.meta.properties.integration).toBeDefined();
    expect(addr!.meta.properties.integration.integration_id).toBe("google-places-uuid");
    expect(addr!.meta.properties.integration.trigger).toBe("debounce");
    expect(addr!.meta.properties.integration.result_mapping).toEqual({
      suburb: "suburb",
      postcode: "postcode",
      state: "state",
    });
  });

  it("address step is incomplete when address not filled", () => {
    const { progress } = evalForm(WITH_FIELD_INTEGRATION, {});
    expect(progress.completeContainers.has("address_step")).toBe(false);
  });

  it("address step is complete when address filled", () => {
    const { progress } = evalForm(WITH_FIELD_INTEGRATION, { address: "123 Main St" });
    expect(progress.completeContainers.has("address_step")).toBe(true);
  });
});

describe("Schema regression — edge cases", () => {
  it("minimal single-field schema works", () => {
    const { prepared, derived } = evalForm(MINIMAL_SCHEMA);
    expect(prepared.form.fields.length).toBe(1);
    expect(derived.visible.has("q1")).toBe(true);
  });

  it("empty schema doesn't crash", () => {
    const { prepared } = evalForm(EMPTY_SCHEMA);
    expect(prepared.form.fields.length).toBe(0);
    expect(prepared.form.layout.length).toBe(0);
  });

  it("unknown meta properties are preserved (forward compat)", () => {
    const schema: Form = {
      fields: [{
        id: "f1",
        meta: {
          type: "text",
          label: "F1",
          required: false,
          properties: { custom_thing: "hello", nested: { deep: true } },
        },
      }],
      layout: [{ id: "s", meta: { title: "S" }, children: [{ id: "f1" }] }],
      rules: [],
    };
    const { prepared } = evalForm(schema);
    expect(prepared.form.fields[0].meta.properties.custom_thing).toBe("hello");
    expect(prepared.form.fields[0].meta.properties.nested).toEqual({ deep: true });
  });

  it("container meta with unknown keys is preserved (forward compat)", () => {
    const schema: Form = {
      fields: [{ id: "f1", meta: { type: "text", label: "F1", required: false, properties: {} } }],
      layout: [{
        id: "s",
        meta: { title: "S", type: "integration", integration_id: "xyz", custom_field: 42 } as any,
        children: [{ id: "f1" }],
      }],
      rules: [],
    };
    const { prepared } = evalForm(schema);
    expect((prepared.form.layout[0].meta as any).custom_field).toBe(42);
  });
});
