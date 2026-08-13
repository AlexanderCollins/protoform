/**
 * Rendering-feature tests (SSR via renderToString, matching ProtoForm.test.tsx):
 * - `hidden` field type renders no UI but keeps its value in state
 * - devMode renders debug strips (and shows hidden-by-rule fields dimmed)
 * - useFormErrors reports rule errors, required-empty, and external errors
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProtoForm, useFormErrors, useFieldState, MultiStepWizard, useProtoForm as useProtoFormForTest } from "../src/index";
import type { Form } from "@protoform/core";

const HIDDEN_SCHEMA: Form = {
  fields: [
    { id: "visible_text", meta: { type: "text", label: "Visible Text" } },
    { id: "ghost", meta: { type: "hidden", label: "Ghost" } },
  ],
  layout: [
    {
      id: "s1",
      meta: { title: "Step" },
      children: [{ id: "visible_text" }, { id: "ghost" }] as any,
    },
  ],
  rules: [],
};

describe("hidden field type", () => {
  it("renders no UI for hidden fields", () => {
    const html = renderToString(<ProtoForm schema={HIDDEN_SCHEMA} />);
    expect(html).toContain("Visible Text");
    expect(html).not.toContain("Ghost");
    expect(html).not.toContain('id="ghost"');
  });

  it("renders a dev strip for hidden fields in devMode", () => {
    const html = renderToString(<ProtoForm schema={HIDDEN_SCHEMA} devMode />);
    expect(html).toContain("ghost");
  });
});

describe("devMode", () => {
  const RULE_SCHEMA: Form = {
    fields: [
      { id: "role", meta: { type: "text", label: "Role" } },
      { id: "admin_code", meta: { type: "text", label: "Admin Code" } },
    ],
    layout: [
      {
        id: "s1",
        meta: { title: "Step" },
        children: [{ id: "role" }, { id: "admin_code" }] as any,
      },
    ],
    rules: [
      {
        id: "hide-admin",
        when: "value('role') !== 'admin'",
        affects: [{ target: "admin_code", visible: false }],
      },
    ],
  };

  it("renders field and container strips with ids", () => {
    const html = renderToString(<ProtoForm schema={RULE_SCHEMA} devMode />);
    expect(html).toContain("<code>role</code>");
    expect(html).toContain("<code>s1</code>");
  });

  it("still renders rule-hidden fields (dimmed) in devMode", () => {
    const html = renderToString(<ProtoForm schema={RULE_SCHEMA} devMode />);
    // admin_code is hidden by the rule, but its dev strip is present
    expect(html).toContain("<code>admin_code</code>");
    // ...while without devMode it is fully absent
    const plain = renderToString(<ProtoForm schema={RULE_SCHEMA} />);
    expect(plain).not.toContain("admin_code");
  });
});

describe("useFormErrors", () => {
  const ERROR_SCHEMA: Form = {
    fields: [
      { id: "name", meta: { type: "text", label: "Name", required: true } },
      { id: "reg_code", meta: { type: "text", label: "Registration code" } },
    ],
    layout: [
      {
        id: "s1",
        meta: { title: "Step" },
        children: [{ id: "name" }, { id: "reg_code" }] as any,
      },
    ],
    rules: [
      {
        id: "code-check",
        when: "value('reg_code') === 'bad'",
        affects: [{ target: "reg_code", valid: false, message: "Invalid code" }],
      },
    ],
  };

  function captureErrors(props: { initialValues?: Record<string, any> }) {
    let captured: Record<string, string[]> = {};
    const Probe = () => {
      captured = useFormErrors();
      return null;
    };
    renderToString(
      <ProtoForm schema={ERROR_SCHEMA} initialValues={props.initialValues}>
        <Probe />
      </ProtoForm>
    );
    return captured;
  }

  it("reports required-empty and rule errors regardless of touch state", () => {
    const errors = captureErrors({ initialValues: { reg_code: "bad" } });
    expect(errors["name"]).toEqual(["This field is required."]);
    expect(errors["reg_code"]).toEqual(["Invalid code"]);
  });

  it("is empty for a valid form", () => {
    const errors = captureErrors({ initialValues: { name: "Alex", reg_code: "good" } });
    expect(errors).toEqual({});
  });
});

describe("repeat containers", () => {
  const REPEAT_SCHEMA: Form = {
    fields: [
      { id: "contact_name", meta: { type: "text", label: "Contact name", required: true } },
      { id: "contact_phone", meta: { type: "text", label: "Contact phone" } },
    ],
    layout: [
      {
        id: "contacts",
        meta: { title: "Emergency contacts", type: "repeat", min: 1, max: 3, item_label: "Contact {index}" } as any,
        children: [{ id: "contact_name" }, { id: "contact_phone" }] as any,
      },
    ],
    rules: [],
  };

  it("seeds min rows and renders row-addressed fields", () => {
    const html = renderToString(<ProtoForm schema={REPEAT_SCHEMA} />);
    expect(html).toContain("Emergency contacts");
    expect(html).toContain("Contact 1");
    expect(html).toContain("contacts[0].contact_name");
    expect(html).toContain("Add");
  });

  it("renders one block per existing row", () => {
    const html = renderToString(
      <ProtoForm
        schema={REPEAT_SCHEMA}
        initialValues={{ contacts: [{ contact_name: "Sam" }, { contact_name: "Ada" }] }}
      />
    );
    expect(html).toContain("Contact 1");
    expect(html).toContain("Contact 2");
    expect(html).toContain("contacts[1].contact_name");
    // Remove buttons appear when rows exceed min
    expect(html).toContain("Remove");
  });
});

describe("computed fields render read-only", () => {
  const COMPUTED_SCHEMA: Form = {
    fields: [
      { id: "qty", meta: { type: "number", label: "Qty" } },
      { id: "total", meta: { type: "computed", label: "Total", expr: "value('qty') * 5" } as any },
    ],
    layout: [
      { id: "s1", meta: { title: "Step" }, children: [{ id: "qty" }, { id: "total" }] as any },
    ],
    rules: [],
  };

  it("computes and renders the value", () => {
    const html = renderToString(
      <ProtoForm schema={COMPUTED_SCHEMA} initialValues={{ qty: 4 }} />
    );
    expect(html).toContain("Total");
    expect(html).toContain("20");
  });
});

describe("overrides and wrappers inside repeat rows", () => {
  const ASSET_SCHEMA: Form = {
    fields: [
      { id: "sku", meta: { type: "text", label: "SKU" } },
      { id: "asset_name", meta: { type: "text", label: "Name" } },
      { id: "image_url", meta: { type: "hidden", label: "" } },
    ],
    layout: [
      {
        id: "assets",
        meta: { title: "Assets", type: "repeat", min: 1 } as any,
        children: [{ id: "sku" }, { id: "asset_name" }, { id: "image_url" }] as any,
      },
    ],
    rules: [],
  };

  it("a template-id override mounts in every row and knows its row", () => {
    const SkuLookup = ({ id }: { id: string }) => (
      <div data-lookup-for={id}>lookup:{id}</div>
    );
    const html = renderToString(
      <ProtoForm
        schema={ASSET_SCHEMA}
        fields={{ sku: SkuLookup }}
        initialValues={{ assets: [{}, {}] }}
      />
    );
    expect(html).toContain('data-lookup-for="assets[0].sku"');
    expect(html).toContain('data-lookup-for="assets[1].sku"');
  });

  it("a hidden row field with an override renders API-provided images", () => {
    const Thumb = ({ id }: { id: string }) => {
      const { value } = useFieldState(id);
      return value ? <img src={value} alt="" /> : null;
    };
    const html = renderToString(
      <ProtoForm
        schema={ASSET_SCHEMA}
        fields={{ image_url: Thumb }}
        initialValues={{
          assets: [{ asset_name: "Crane", image_url: "https://cdn.example/crane.jpg" }],
        }}
      />
    );
    expect(html).toContain('src="https://cdn.example/crane.jpg"');
  });

  it("an exact row-id override beats the template override", () => {
    const A = ({ id }: { id: string }) => <span data-generic={id} />;
    const B = ({ id }: { id: string }) => <span data-special={id} />;
    const html = renderToString(
      <ProtoForm
        schema={ASSET_SCHEMA}
        fields={{ sku: A, "assets[1].sku": B } as any}
        initialValues={{ assets: [{}, {}] }}
      />
    );
    expect(html).toContain('data-generic="assets[0].sku"');
    expect(html).toContain('data-special="assets[1].sku"');
  });
});

describe("MultiStepWizard", () => {
  const WIZARD_SCHEMA: Form = {
    fields: [
      { id: "a1", meta: { type: "text", label: "A one", required: true } },
      { id: "b1", meta: { type: "text", label: "B one" } },
    ],
    layout: [
      { id: "step_a", meta: { title: "About" }, children: [{ id: "a1" }] as any },
      { id: "step_b", meta: { title: "Details" }, children: [{ id: "b1" }] as any },
    ],
    rules: [],
  };

  it("renders the stepper, the first step only, and Next", () => {
    const html = renderToString(
      <ProtoForm schema={WIZARD_SCHEMA} autoLayout={false} showSubmitButton={false}>
        <MultiStepWizard />
      </ProtoForm>
    ).replace(/<!-- -->/g, "");
    expect(html).toContain("data-wizard-stepper");
    expect(html).toContain("1. About");
    expect(html).toContain("2. Details");
    expect(html).toContain('id="a1"');
    expect(html).not.toContain('id="b1"'); // second step not rendered yet
    expect(html).toContain("Next");
    expect(html).not.toContain(">Submit<");
  });

  it("forward steps are disabled until prior steps complete", () => {
    const html = renderToString(
      <ProtoForm schema={WIZARD_SCHEMA} autoLayout={false} showSubmitButton={false}>
        <MultiStepWizard />
      </ProtoForm>
    ).replace(/<!-- -->/g, "");
    // Step 2 button rendered disabled (a1 required and empty)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>2\. Details/);
  });

  it("adapter progress style falls back to built-in when adapter lacks renderStepper", () => {
    const html = renderToString(
      <ProtoForm schema={WIZARD_SCHEMA} autoLayout={false} showSubmitButton={false}>
        <MultiStepWizard progressStyle="adapter" />
      </ProtoForm>
    );
    expect(html).toContain("data-wizard-stepper");
  });

  it("skips rule-hidden steps", () => {
    const schema: Form = {
      ...WIZARD_SCHEMA,
      rules: [
        { id: "hide-b", when: "true", affects: [{ target: "step_b", visible: false }] },
      ],
    };
    const html = renderToString(
      <ProtoForm schema={schema} autoLayout={false} showSubmitButton={false}>
        <MultiStepWizard />
      </ProtoForm>
    );
    expect(html).not.toContain("Details");
    expect(html).toContain(">Submit<"); // single visible step is also the last
  });
});

describe("rule-driven dynamic options", () => {
  const OPTIONS_SCHEMA: Form = {
    fields: [
      { id: "country", meta: { type: "select", label: "Country",
          properties: { options: [{ label: "Australia", value: "AU" }, { label: "New Zealand", value: "NZ" }] } } },
      { id: "region", meta: { type: "select", label: "Region",
          properties: { options: [{ label: "Pick a country", value: "" }] } } },
    ],
    layout: [
      { id: "s1", meta: { title: "Where" }, children: [{ id: "country" }, { id: "region" }] as any },
    ],
    rules: [
      { id: "au-regions", when: "value('country') === 'AU'",
        affects: [{ target: "region", options: [
          { label: "New South Wales", value: "nsw" }, { label: "Victoria", value: "vic" } ] } as any] },
    ],
  };

  // Minimal adapter that renders selects — proves adapters receive the
  // rule-patched options through the normal field.meta.properties path.
  const selectAdapter = {
    renderField: ({ id, field, value }: any) =>
      field.meta.type === "select" ? (
        <select id={id} value={value ?? ""} readOnly>
          {(field.meta.properties?.options ?? []).map((o: any) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : null,
    renderContainer: ({ children }: any) => <div>{children}</div>,
    renderForm: ({ children }: any) => <form>{children}</form>,
  };

  it("swaps the select's options when the rule holds", () => {
    const html = renderToString(
      <ProtoForm schema={OPTIONS_SCHEMA} adapter={selectAdapter as any} initialValues={{ country: "AU" }} />
    );
    expect(html).toContain("New South Wales");
    expect(html).not.toContain("Pick a country");
  });

  it("falls back to schema options when no rule matches", () => {
    const html = renderToString(<ProtoForm schema={OPTIONS_SCHEMA} adapter={selectAdapter as any} />);
    expect(html).toContain("Pick a country");
    expect(html).not.toContain("New South Wales");
  });
});

describe("nested repeat rendering", () => {
  const NESTED_SCHEMA: Form = {
    fields: [
      { id: "team_name", meta: { type: "text", label: "Team name", required: true } },
      { id: "member_name", meta: { type: "text", label: "Member name", required: true } },
    ],
    layout: [
      {
        id: "teams",
        meta: { title: "Teams", type: "repeat", min: 1, item_label: "Team {index}" } as any,
        children: [
          { id: "team_name" },
          { id: "members", meta: { title: "Members", type: "repeat", min: 1, item_label: "Member {index}" },
            children: [{ id: "member_name" }] },
        ] as any,
      },
    ],
    rules: [],
  };

  it("seeds nested minimums and renders nested row addresses", () => {
    const html = renderToString(<ProtoForm schema={NESTED_SCHEMA} />);
    expect(html).toContain('data-repeat-path="teams"');
    expect(html).toContain('data-repeat-path="teams[0].members"');
    expect(html).toContain('id="teams[0].members[0].member_name"');
  });

  it("renders provided nested rows", () => {
    const html = renderToString(
      <ProtoForm
        schema={NESTED_SCHEMA}
        initialValues={{
          teams: [{ team_name: "Alpha", members: [{ member_name: "Sam" }, { member_name: "Ada" }] }],
        }}
      />
    );
    expect(html).toContain('id="teams[0].members[1].member_name"');
    expect(html).toContain('value="Ada"');
  });
});

describe("warning messages render distinctly", () => {
  it("warning is shown and not treated as an error by useFormErrors", () => {
    const schema: Form = {
      fields: [{ id: "age", meta: { type: "number", label: "Age" } }],
      layout: [{ id: "s1", meta: { title: "S" }, children: [{ id: "age" }] as any }],
      rules: [
        { id: "warn", when: "value('age') < 18",
          affects: [{ target: "age", message: "Guardian required", type: "warning" } as any] },
      ],
    };
    let captured: Record<string, string[]> = {};
    const Probe = () => {
      captured = useFormErrors();
      return null;
    };
    const html = renderToString(
      <ProtoForm schema={schema} initialValues={{ age: 16 }} showErrorsOnTouch={false}>
        {({ Container }) => (
          <>
            <Container id="s1" />
            <Probe />
          </>
        )}
      </ProtoForm>
    );
    expect(html).toContain("Guardian required"); // rendered by fallback chrome
    expect(captured).toEqual({}); // never collected as an error
  });
});

describe("applyServerValues", () => {
  it("merges values without touching fields", () => {
    let ctx: any;
    const Probe = () => {
      ctx = useProtoFormForTest();
      return null;
    };
    renderToString(
      <ProtoForm
        schema={{
          fields: [{ id: "a", meta: { type: "text", label: "A" } }],
          layout: [{ id: "s1", meta: { title: "S" }, children: [{ id: "a" }] as any }],
          rules: [],
        }}
      >
        <Probe />
      </ProtoForm>
    );
    expect(typeof ctx.applyServerValues).toBe("function");
    expect(ctx.state.touchedFields.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Field types (spec v1.5): passthrough input types, radio, multiselect,
// options_url search affordances. SSR-rendered through the unstyled adapter.
// ---------------------------------------------------------------------------
import unstyledAdapter from "../../adapter-unstyled/src/index";
import { buildOptionsUrl } from "../src/index";

const TYPES_SCHEMA: Form = {
  fields: [
    { id: "phone", meta: { type: "tel", label: "Phone" } },
    { id: "website", meta: { type: "url", label: "Website" } },
    { id: "start_time", meta: { type: "time", label: "Start" } },
    { id: "starts_at", meta: { type: "datetime", label: "Starts at" } },
    { id: "satisfaction", meta: { type: "range", label: "Satisfaction", properties: { min: 0, max: 10, step: 1 } } },
    { id: "pref", meta: { type: "radio", label: "Preference", properties: { options: [
      { label: "Alpha", value: "a" }, { label: "Beta", value: "b" } ] } } },
    { id: "interests", meta: { type: "multiselect", label: "Interests", properties: { searchable: true, options: [
      { label: "Sports", value: "sports" }, { label: "Music", value: "music" } ] } } },
    { id: "city", meta: { type: "select", label: "City", properties: {
      options_url: "https://api.example.test/cities?q={q}" } } },
  ],
  layout: [
    { id: "s1", meta: { title: "Types" },
      children: [
        { id: "phone" }, { id: "website" }, { id: "start_time" }, { id: "starts_at" },
        { id: "satisfaction" }, { id: "pref" }, { id: "interests" }, { id: "city" },
      ] as any },
  ],
  rules: [],
};

describe("field types (spec v1.5)", () => {
  const render = (initialValues = {}) =>
    renderToString(
      <ProtoForm schema={TYPES_SCHEMA} adapter={unstyledAdapter} initialValues={initialValues} />
    ).replace(/<!-- -->/g, "");

  it("renders passthrough HTML input types", () => {
    const html = render();
    expect(html).toContain('type="tel"');
    expect(html).toContain('type="url"');
    expect(html).toContain('type="time"');
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('type="range"');
  });

  it("renders radio as a real radio group with the value checked", () => {
    const html = render({ pref: "b" });
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('type="radio"');
    expect(html).toContain("Alpha");
    const beta = /type="radio"[^>]*checked=""[^>]*value="b"/.test(html);
    expect(beta).toBe(true);
  });

  it("renders multiselect as checkboxes with array values checked", () => {
    const html = render({ interests: ["music"] });
    expect(html).toContain('data-field-type="multiselect"');
    const music = /type="checkbox"[^>]*checked=""[^>]*value="music"/.test(html);
    const sports = /type="checkbox"[^>]*checked=""[^>]*value="sports"/.test(html);
    expect(music).toBe(true);
    expect(sports).toBe(false);
  });

  it("renders a search box for searchable multiselect and options_url selects", () => {
    const html = render();
    const searchBoxes = html.match(/data-options-search/g) ?? [];
    expect(searchBoxes.length).toBe(2); // multiselect (local) + city (remote)
  });

  it("substitutes and encodes {q} in options_url templates", () => {
    expect(buildOptionsUrl("https://x.test/opts?q={q}", "a b&c")).toBe(
      "https://x.test/opts?q=a%20b%26c"
    );
    expect(buildOptionsUrl("https://x.test/static", "ignored")).toBe(
      "https://x.test/static"
    );
  });
});
