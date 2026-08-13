import { describe, it, expect } from "vitest";
import {
  buildContainerDescendants,
  buildFieldToContainer,
  isContainerComplete,
  computeCompleteContainers,
  findContainer,
  findField,
} from "../src/layout";
import type { Container, Form, DerivedState, FieldKey, ElementKey } from "../src/types";

function makeDerived(overrides: Partial<DerivedState> = {}): DerivedState {
  return {
    required: new Set<FieldKey>(),
    visible: new Set<ElementKey>(),
    disabled: new Set<ElementKey>(),
    readOnly: new Set<FieldKey>(),
    valid: new Set<ElementKey>(),
    blockingTargets: new Set<ElementKey>(),
    messages: {},
    ...overrides,
  };
}

const FLAT_LAYOUT: Container[] = [
  {
    id: "main",
    meta: { title: "Main" },
    children: [
      { id: "f1", meta: { type: "text", label: "F1" } },
      { id: "f2", meta: { type: "text", label: "F2" } },
    ],
  },
];

const MULTI_STEP_LAYOUT: Container[] = [
  {
    id: "step1",
    meta: { title: "Step 1" },
    children: [
      { id: "name", meta: { type: "text", label: "Name" } },
    ],
  },
  {
    id: "step2",
    meta: { title: "Step 2" },
    children: [
      { id: "email", meta: { type: "email", label: "Email" } },
    ],
  },
];

const NESTED_LAYOUT: Container[] = [
  {
    id: "outer",
    meta: { title: "Outer", type: "section" },
    children: [
      { id: "f1", meta: { type: "text", label: "F1" } },
      {
        id: "inner",
        meta: { title: "Inner", type: "card" },
        children: [
          { id: "f2", meta: { type: "text", label: "F2" } },
          { id: "f3", meta: { type: "text", label: "F3" } },
        ],
      },
    ],
  },
];

describe("buildContainerDescendants", () => {
  it("flat layout", () => {
    const result = buildContainerDescendants(FLAT_LAYOUT);
    expect(new Set(result["main"])).toEqual(new Set(["f1", "f2"]));
  });

  it("multi-step layout", () => {
    const result = buildContainerDescendants(MULTI_STEP_LAYOUT);
    expect(result["step1"]).toEqual(["name"]);
    expect(result["step2"]).toEqual(["email"]);
  });

  it("nested layout — outer has all fields", () => {
    const result = buildContainerDescendants(NESTED_LAYOUT);
    expect(new Set(result["outer"])).toEqual(new Set(["f1", "f2", "f3"]));
  });

  it("nested layout — inner has its own fields", () => {
    const result = buildContainerDescendants(NESTED_LAYOUT);
    expect(new Set(result["inner"])).toEqual(new Set(["f2", "f3"]));
  });

  it("nested container with meta.type is correctly identified as container", () => {
    // This tests the fix for the field/container discrimination bug
    const result = buildContainerDescendants(NESTED_LAYOUT);
    // "inner" should NOT appear as a field in outer's descendants
    expect(result["outer"]).not.toContain("inner");
  });

  it("empty layout", () => {
    expect(buildContainerDescendants([])).toEqual({});
  });
});

describe("buildFieldToContainer", () => {
  it("flat layout", () => {
    const result = buildFieldToContainer(FLAT_LAYOUT);
    expect(result["f1"]).toBe("main");
    expect(result["f2"]).toBe("main");
  });

  it("multi-step", () => {
    const result = buildFieldToContainer(MULTI_STEP_LAYOUT);
    expect(result["name"]).toBe("step1");
    expect(result["email"]).toBe("step2");
  });

  it("nested — maps to immediate parent container", () => {
    const result = buildFieldToContainer(NESTED_LAYOUT);
    expect(result["f1"]).toBe("outer");
    expect(result["f2"]).toBe("inner");
    expect(result["f3"]).toBe("inner");
  });
});

describe("isContainerComplete", () => {
  it("complete when all required fields filled and valid", () => {
    const derived = makeDerived({
      visible: new Set(["main", "f1", "f2"]),
      valid: new Set(["f1", "f2"]),
      required: new Set(["f1"]),
    });
    expect(isContainerComplete("main", ["f1", "f2"], { f1: "hello" }, derived)).toBe(true);
  });

  it("incomplete when required field empty", () => {
    const derived = makeDerived({
      visible: new Set(["main", "f1"]),
      valid: new Set(["f1"]),
      required: new Set(["f1"]),
    });
    expect(isContainerComplete("main", ["f1"], {}, derived)).toBe(false);
  });

  it("incomplete when field invalid", () => {
    const derived = makeDerived({
      visible: new Set(["main", "f1"]),
      valid: new Set(), // f1 not valid
    });
    expect(isContainerComplete("main", ["f1"], { f1: "val" }, derived)).toBe(false);
  });

  it("hidden container is always complete", () => {
    const derived = makeDerived({
      visible: new Set(), // container not visible
    });
    expect(isContainerComplete("main", ["f1"], {}, derived)).toBe(true);
  });

  it("hidden fields are skipped", () => {
    const derived = makeDerived({
      visible: new Set(["main"]), // container visible, but f1 not
      valid: new Set(),
      required: new Set(["f1"]),
    });
    expect(isContainerComplete("main", ["f1"], {}, derived)).toBe(true);
  });

  it("disabled fields are skipped", () => {
    const derived = makeDerived({
      visible: new Set(["main", "f1"]),
      disabled: new Set(["f1"]),
      valid: new Set(),
      required: new Set(["f1"]),
    });
    expect(isContainerComplete("main", ["f1"], {}, derived)).toBe(true);
  });

  it("empty array counts as empty", () => {
    const derived = makeDerived({
      visible: new Set(["main", "f1"]),
      valid: new Set(["f1"]),
      required: new Set(["f1"]),
    });
    expect(isContainerComplete("main", ["f1"], { f1: [] }, derived)).toBe(false);
  });

  it("empty object counts as empty", () => {
    const derived = makeDerived({
      visible: new Set(["main", "f1"]),
      valid: new Set(["f1"]),
      required: new Set(["f1"]),
    });
    expect(isContainerComplete("main", ["f1"], { f1: {} }, derived)).toBe(false);
  });
});

describe("computeCompleteContainers", () => {
  it("marks complete containers", () => {
    const descendants = { main: ["f1"] };
    const derived = makeDerived({
      visible: new Set(["main", "f1"]),
      valid: new Set(["f1"]),
      required: new Set(["f1"]),
    });
    const result = computeCompleteContainers(descendants, { f1: "val" }, derived);
    expect(result.has("main")).toBe(true);
  });

  it("does not mark incomplete containers", () => {
    const descendants = { main: ["f1"] };
    const derived = makeDerived({
      visible: new Set(["main", "f1"]),
      valid: new Set(["f1"]),
      required: new Set(["f1"]),
    });
    const result = computeCompleteContainers(descendants, {}, derived);
    expect(result.has("main")).toBe(false);
  });
});

describe("findContainer", () => {
  it("finds top-level container", () => {
    expect(findContainer(FLAT_LAYOUT, "main")?.id).toBe("main");
  });

  it("finds nested container", () => {
    expect(findContainer(NESTED_LAYOUT, "inner")?.id).toBe("inner");
  });

  it("returns undefined for missing", () => {
    expect(findContainer(FLAT_LAYOUT, "nonexistent")).toBeUndefined();
  });
});

describe("findField", () => {
  const form: Form = {
    fields: [
      { id: "f1", meta: { type: "text", label: "F1" } },
      { id: "f2", meta: { type: "text", label: "F2" } },
    ],
    layout: [],
    rules: [],
  };

  it("finds field by id", () => {
    expect(findField(form, "f1")?.id).toBe("f1");
  });

  it("returns undefined for missing", () => {
    expect(findField(form, "nonexistent")).toBeUndefined();
  });
});
