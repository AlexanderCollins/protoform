/**
 * Deep-compares the two engine outputs. Exit 0 = identical (parity holds),
 * exit 1 = divergence, with a per-vector/case report of what differs.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const ts = JSON.parse(readFileSync(join(here, ".out-ts.json"), "utf8"));
const py = JSON.parse(readFileSync(join(here, ".out-py.json"), "utf8"));

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return deepEqual(ka, kb) && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

let failures = 0;
const tsByName = Object.fromEntries(ts.map((v) => [v.vector, v]));
const pyByName = Object.fromEntries(py.map((v) => [v.vector, v]));
const names = [...new Set([...Object.keys(tsByName), ...Object.keys(pyByName)])];

for (const name of names) {
  const tv = tsByName[name];
  const pv = pyByName[name];
  if (!tv || !pv) {
    console.log(`✗ ${name}: present in only one engine's output`);
    failures++;
    continue;
  }
  if (!deepEqual(tv.resolved, pv.resolved)) {
    console.log(`✗ ${name}: resolved template expansion differs`);
    for (const id of Object.keys(tv.resolved)) {
      if (!deepEqual(tv.resolved[id], pv.resolved[id])) {
        console.log(`    rule ${id}:\n      TS: ${JSON.stringify(tv.resolved[id])}\n      PY: ${JSON.stringify(pv.resolved[id])}`);
      }
    }
    failures++;
  }
  const pyCases = Object.fromEntries(pv.cases.map((c) => [c.name, c]));
  for (const tc of tv.cases) {
    const pc = pyCases[tc.name];
    if (!pc || !deepEqual(tc, pc)) {
      failures++;
      console.log(`✗ ${name} / ${tc.name}: derived state differs`);
      for (const key of Object.keys(tc)) {
        if (!pc || !deepEqual(tc[key], pc[key])) {
          console.log(`    ${key}:\n      TS: ${JSON.stringify(tc[key])}\n      PY: ${JSON.stringify(pc?.[key])}`);
        }
      }
    } else {
      console.log(`✓ ${name} / ${tc.name}`);
    }
  }
}

if (failures > 0) {
  console.log(`\nPARITY FAILURE: ${failures} divergence(s) between engines.`);
  process.exit(1);
}
console.log("\nParity holds: TypeScript and Python engines produced identical output.");
