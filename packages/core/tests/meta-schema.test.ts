/**
 * The meta-schema (schema/protoform.schema.json) must accept valid schemas
 * and reject malformed ones — it is the typed contract for the document.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import Ajv from "ajv";

const metaSchema = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "schema", "protoform.schema.json"), "utf8")
);
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(metaSchema);

describe("meta-schema", () => {
  it("accepts a minimal valid schema", () => {
    expect(
      validate({
        fields: [{ id: "a", meta: { type: "text", label: "A" } }],
        layout: [{ id: "s", meta: { title: "S" }, children: [{ id: "a" }] }],
        rules: [],
      })
    ).toBe(true);
  });

  it("rejects a field without meta.label", () => {
    expect(
      validate({
        fields: [{ id: "a", meta: { type: "text" } }],
        layout: [],
        rules: [],
      })
    ).toBe(false);
  });

  it("rejects a rule without affects", () => {
    expect(
      validate({
        fields: [],
        layout: [],
        rules: [{ id: "r", when: "true" }],
      })
    ).toBe(false);
  });

  it("rejects an affect with an unknown property", () => {
    expect(
      validate({
        fields: [],
        layout: [],
        rules: [{ id: "r", when: "true", affects: [{ target: "a", visable: true }] }],
      })
    ).toBe(false);
  });

  it("rejects a bad message type", () => {
    expect(
      validate({
        fields: [],
        layout: [],
        rules: [{ id: "r", when: "true", affects: [{ target: "a", message: "m", type: "fatal" }] }],
      })
    ).toBe(false);
  });
});
