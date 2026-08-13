/**
 * Conformance runner — TypeScript engine.
 * Emits normalized JSON derived-state results for every vector case.
 * Compare with run-py.py output via diff.mjs — they must be identical.
 */
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const core = await import(join(here, "..", "packages", "core", "dist", "index.js"));
const { prepareForm, evaluateRules, canProgress, registerFunction, registerTemplate } = core;

// Registered custom function + template — the SAME registration exists in
// run-py.py; the conformance diff proves the mechanism is parity-safe.
// Toy checksum: valid when the digit sum is divisible by 7.
registerFunction("checksumFails", (v) => {
  if (!v) return false;
  let sum = 0;
  for (const c of String(v)) if (c >= "0" && c <= "9") sum += Number(c);
  return sum % 7 !== 0;
});
registerTemplate("checksumInvalid", {
  params: ["fieldId"],
  expression: "checksumFails(value('${fieldId}'))",
});

const results = [];
const vectorDir = join(here, "vectors");

for (const file of readdirSync(vectorDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const vector = JSON.parse(readFileSync(join(vectorDir, file), "utf8"));
  const prepared = prepareForm(vector.schema);

  // Resolved rule expressions — template expansion must be byte-identical
  const resolved = {};
  for (const rule of prepared.form.rules) resolved[rule.id] = rule.when;

  const cases = [];
  for (const c of vector.cases) {
    const { derived, progress, values } = evaluateRules(prepared, c.values, c.env ?? undefined);
    cases.push({
      name: c.name,
      values,
      visible: [...derived.visible].sort(),
      valid: [...derived.valid].sort(),
      required: [...derived.required].sort(),
      disabled: [...derived.disabled].sort(),
      read_only: [...derived.readOnly].sort(),
      blocking: [...derived.blockingTargets].sort(),
      options: Object.fromEntries(
        Object.entries(derived.options).sort(([a], [b]) => (a < b ? -1 : 1))
      ),
      messages: Object.fromEntries(
        Object.entries(derived.messages)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => [k, v.map((m) => `${m.type}:${m.message}`)])
      ),
      complete: [...progress.completeContainers].sort(),
      can_progress: canProgress(derived, c.values),
    });
  }
  results.push({ vector: vector.name, resolved, cases });
}

process.stdout.write(JSON.stringify(results, null, 1) + "\n");
