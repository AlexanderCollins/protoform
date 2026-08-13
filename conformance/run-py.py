"""
Conformance runner — Python engine.
Emits normalized JSON derived-state results for every vector case.
Compare with run-ts.mjs output via diff.mjs — they must be identical.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "packages" / "python"))

from protoform import (  # noqa: E402
    prepare_form,
    evaluate_rules,
    can_progress,
    register_function,
    register_template,
)

# Registered custom function + template — the SAME registration exists in
# run-ts.mjs; the conformance diff proves the mechanism is parity-safe.
# Toy checksum: valid when the digit sum is divisible by 7.
register_function(
    "checksumFails",
    lambda v: bool(v) and sum(int(c) for c in str(v) if c.isdigit()) % 7 != 0,
)
register_template("checksumInvalid", ["fieldId"], "checksumFails(value('${fieldId}'))")

results = []
for file in sorted((HERE / "vectors").glob("*.json")):
    vector = json.loads(file.read_text())
    prepared = prepare_form(vector["schema"])

    resolved = {rule["id"]: rule["when"] for rule in prepared["form"]["rules"]}

    cases = []
    for c in vector["cases"]:
        result = evaluate_rules(prepared, c["values"], c.get("env"))
        derived = result["derived"]
        cases.append({
            "name": c["name"],
            "values": result["values"],
            "visible": sorted(derived["visible"]),
            "valid": sorted(derived["valid"]),
            "required": sorted(derived["required"]),
            "disabled": sorted(derived["disabled"]),
            "read_only": sorted(derived["read_only"]),
            "blocking": sorted(derived["blocking_targets"]),
            "options": dict(sorted(derived["options"].items())),
            "messages": {
                k: [f"{m['type']}:{m['message']}" for m in v]
                for k, v in sorted(derived["messages"].items())
            },
            "complete": sorted(result["progress"]["complete_containers"]),
            "can_progress": can_progress(derived, c["values"]),
        })
    results.append({"vector": vector["name"], "resolved": resolved, "cases": cases})

sys.stdout.write(json.dumps(results, indent=1) + "\n")
