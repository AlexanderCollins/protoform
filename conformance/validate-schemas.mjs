/**
 * Validates every conformance vector's schema against the ProtoForm
 * meta-schema (schema/protoform.schema.json). Keeps the meta-schema
 * honest: if the engines accept a shape the meta-schema rejects (or vice
 * versa), this fails CI.
 */
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const metaSchema = JSON.parse(
  readFileSync(join(here, "..", "schema", "protoform.schema.json"), "utf8")
);

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(metaSchema);

let failures = 0;
const vectorDir = join(here, "vectors");
for (const file of readdirSync(vectorDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const vector = JSON.parse(readFileSync(join(vectorDir, file), "utf8"));
  if (validate(vector.schema)) {
    console.log(`✓ ${vector.name}: schema conforms to meta-schema`);
  } else {
    failures++;
    console.log(`✗ ${vector.name}: schema violates meta-schema`);
    for (const err of validate.errors ?? []) {
      console.log(`    ${err.instancePath || "/"} ${err.message}`);
    }
  }
}

if (failures > 0) {
  console.log(`\nMETA-SCHEMA FAILURE: ${failures} vector schema(s) invalid.`);
  process.exit(1);
}
console.log("\nAll vector schemas conform to the meta-schema.");
