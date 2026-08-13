/**
 * Engine-level tests for repeaters and computed fields — schema error
 * paths and behaviors the conformance vectors can't express (prepare-time
 * throws), plus row-addressed progression.
 */
import { describe, it, expect } from "vitest";
import {
  prepareForm,
  evaluateRules,
  canProgress,
  rowKey,
  parseRowKey,
  resolveValuePath,
} from "../src/index";
import type { Form } from "../src/index";

describe("computed fields", () => {
  it("rejects dependency cycles at prepare time", () => {
    const form: Form = {
      fields: [
        { id: "a", meta: { type: "computed", label: "A", expr: "value('b') + 1" } as any },
        { id: "b", meta: { type: "computed", label: "B", expr: "value('a') + 1" } as any },
      ],
      layout: [],
      rules: [],
    };
    expect(() => prepareForm(form)).toThrow(/cycle/i);
  });

  it("computed values are read-only and excluded from required", () => {
    const form: Form = {
      fields: [
        { id: "x", meta: { type: "number", label: "X" } },
        { id: "double", meta: { type: "computed", label: "2x", expr: "value('x') * 2", required: true } as any },
      ],
      layout: [],
      rules: [],
    };
    const prepared = prepareForm(form);
    const { derived, values } = evaluateRules(prepared, { x: 21 });
    expect(values.double).toBe(42);
    expect(derived.readOnly.has("double")).toBe(true);
    expect(derived.required.has("double")).toBe(false);
  });

  it("rules can read computed values", () => {
    const form: Form = {
      fields: [
        { id: "x", meta: { type: "number", label: "X" } },
        { id: "double", meta: { type: "computed", label: "2x", expr: "value('x') * 2" } as any },
      ],
      layout: [],
      rules: [
        { id: "r", when: "value('double') > 10", affects: [{ target: "x", valid: false }] },
      ],
    };
    const prepared = prepareForm(form);
    expect(evaluateRules(prepared, { x: 6 }).derived.valid.has("x")).toBe(false);
    expect(evaluateRules(prepared, { x: 4 }).derived.valid.has("x")).toBe(true);
  });
});

describe("repeaters", () => {
  const FORM: Form = {
    fields: [
      { id: "name", meta: { type: "text", label: "Name", required: true } },
      { id: "phone", meta: { type: "text", label: "Phone" } },
    ],
    layout: [
      {
        id: "contacts",
        meta: { title: "Contacts", type: "repeat", min: 1, max: 2 } as any,
        children: [{ id: "name" } as any, { id: "phone" } as any],
      },
    ],
    rules: [
      {
        id: "phone-blocking",
        scope: "contacts",
        when: "isEmpty(phone)",
        affects: [{ target: "phone", valid: false, blocking: true }],
      } as any,
    ],
  };

  it("rejects nested containers inside a repeat", () => {
    const bad: Form = {
      fields: [],
      layout: [
        {
          id: "r",
          meta: { title: "R", type: "repeat" } as any,
          children: [{ id: "inner", meta: { title: "I" }, children: [] } as any],
        },
      ],
      rules: [],
    };
    expect(() => prepareForm(bad)).toThrow(/field references/);
  });

  it("row-addressed blocking gates progression", () => {
    const prepared = prepareForm(FORM);
    const values = { contacts: [{ name: "Sam" }] };
    const { derived, values: working } = evaluateRules(prepared, values);
    expect(derived.blockingTargets.has("contacts[0].phone")).toBe(true);
    expect(canProgress(derived, working)).toBe(false);

    const ok = { contacts: [{ name: "Sam", phone: "0400" }] };
    const result = evaluateRules(prepared, ok);
    expect(canProgress(result.derived, result.values)).toBe(true);
  });

  it("row key helpers round-trip", () => {
    const key = rowKey("contacts", 1, "phone");
    expect(key).toBe("contacts[1].phone");
    expect(parseRowKey(key)).toEqual({ repeatId: "contacts", index: 1, fieldId: "phone" });
    expect(parseRowKey("plain_field")).toBeNull();
    expect(
      resolveValuePath({ contacts: [{}, { phone: "0400" }] }, key)
    ).toBe("0400");
  });

  it("min/max bound completeness", () => {
    const prepared = prepareForm(FORM);
    const complete = (values: any) =>
      evaluateRules(prepared, values).progress.completeContainers.has("contacts");
    expect(complete({ contacts: [] })).toBe(false); // below min
    expect(complete({ contacts: [{ name: "A", phone: "1" }] })).toBe(true);
    expect(
      complete({
        contacts: [
          { name: "A", phone: "1" },
          { name: "B", phone: "2" },
          { name: "C", phone: "3" },
        ],
      })
    ).toBe(false); // above max
  });
});

describe("nested repeaters", () => {
  const NESTED: Form = {
    fields: [
      { id: "team_name", meta: { type: "text", label: "Team", required: true } },
      { id: "member_name", meta: { type: "text", label: "Member", required: true } },
    ],
    layout: [
      {
        id: "teams",
        meta: { title: "Teams", type: "repeat", min: 1 } as any,
        children: [
          { id: "team_name" } as any,
          {
            id: "members",
            meta: { title: "Members", type: "repeat", min: 1, max: 2 } as any,
            children: [{ id: "member_name" } as any],
          } as any,
        ],
      },
    ],
    rules: [],
  };

  it("registers nesting links at prepare time", () => {
    const prepared = prepareForm(NESTED);
    expect(prepared.repeats.teams.childRepeats).toEqual(["members"]);
    expect(prepared.repeats.members.parentId).toBe("teams");
    expect(prepared.containerRepeats.teams).toEqual(["teams", "members"]);
  });

  it("derives state under nested addresses", () => {
    const prepared = prepareForm(NESTED);
    const { derived } = evaluateRules(prepared, {
      teams: [{ team_name: "A", members: [{ member_name: "Sam" }, {}] }],
    });
    expect(derived.visible.has("teams[0].members[0].member_name")).toBe(true);
    expect(derived.required.has("teams[0].members[1].member_name")).toBe(true);
  });

  it("min/max apply per parent row", () => {
    const prepared = prepareForm(NESTED);
    const complete = (values: any) =>
      evaluateRules(prepared, values).progress.completeContainers.has("teams");
    // Second team has no members: its own array violates min
    expect(
      complete({
        teams: [
          { team_name: "A", members: [{ member_name: "Sam" }] },
          { team_name: "B", members: [] },
        ],
      })
    ).toBe(false);
    expect(
      complete({
        teams: [
          { team_name: "A", members: [{ member_name: "Sam" }] },
          { team_name: "B", members: [{ member_name: "Ada" }] },
        ],
      })
    ).toBe(true);
  });

  it("resolveValuePath recurses through nesting", () => {
    const values = { teams: [{ members: [{}, { member_name: "Ada" }] }] };
    expect(resolveValuePath(values, "teams[0].members[1].member_name")).toBe("Ada");
  });

  it("still rejects non-repeat containers inside a repeat", () => {
    const bad: Form = {
      fields: [],
      layout: [
        {
          id: "r",
          meta: { title: "R", type: "repeat" } as any,
          children: [{ id: "inner", meta: { title: "I" }, children: [] } as any],
        },
      ],
      rules: [],
    };
    expect(() => prepareForm(bad)).toThrow(/field references or nested repeat/);
  });
});

describe("aggregates over plain arrays (multiselect values)", () => {
  const FORM: Form = {
    fields: [
      { id: "interests", meta: { type: "multiselect", label: "Interests", required: true } as any },
      { id: "marker", meta: { type: "text", label: "Marker" } },
      { id: "sum_marker", meta: { type: "text", label: "Sum marker" } },
    ],
    layout: [{ id: "main", meta: { title: "M" }, children: [{ id: "interests" } as any, { id: "marker" } as any, { id: "sum_marker" } as any] }],
    rules: [
      { id: "min-two", when: "count('interests') < 2", affects: [{ target: "interests", valid: false }] },
      { id: "sum-skips-scalars", when: "sum('interests', 'qty') === 0", affects: [{ target: "sum_marker", visible: false }] },
      { id: "has-other", when: "value('interests').includes('other')", affects: [{ target: "marker", required: true }] },
    ],
  };

  it("count() reads a multiselect's array length", () => {
    const prepared = prepareForm(FORM);
    expect(evaluateRules(prepared, { interests: ["a"] }).derived.valid.has("interests")).toBe(false);
    expect(evaluateRules(prepared, { interests: ["a", "b"] }).derived.valid.has("interests")).toBe(true);
  });

  it("sum() over scalar rows returns 0 instead of failing", () => {
    const prepared = prepareForm(FORM);
    expect(evaluateRules(prepared, { interests: ["a", "b"] }).derived.visible.has("sum_marker")).toBe(false);
  });

  it("includes() and required-empty treat [] as empty", () => {
    const prepared = prepareForm(FORM);
    const incomplete = evaluateRules(prepared, { interests: ["other", "x"] });
    expect(incomplete.derived.required.has("marker")).toBe(true);
    expect(incomplete.progress.completeContainers.has("main")).toBe(false); // marker required + empty
    const complete = evaluateRules(prepared, { interests: ["other", "x"], marker: "noted" });
    expect(complete.progress.completeContainers.has("main")).toBe(true);
  });
});
