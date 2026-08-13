"""
ProtoForm rule engine — Python port of @protoform/core rules.ts + layout.ts.

The TypeScript engine is the structural mirror of this module; the
conformance suite keeps the two behaviorally identical.
"""

from __future__ import annotations

import re
from typing import Any

from .expressions import (
    evaluate_expression,
    evaluate_value_expression,
    extract_field_references,
    format_value,
)
from .templates import resolve_rule_templates


# ---------------------------------------------------------------------------
# Layout utilities
# ---------------------------------------------------------------------------

def _is_container(element: dict) -> bool:
    return "children" in element


def _collect_descendant_fields(container: dict) -> list[str]:
    fields: list[str] = []
    for child in container.get("children", []):
        if _is_container(child):
            fields.extend(_collect_descendant_fields(child))
        else:
            fields.append(child["id"])
    return fields


def build_container_descendants(containers: list[dict]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}

    def traverse(container: dict) -> None:
        result[container["id"]] = _collect_descendant_fields(container)
        for child in container.get("children", []):
            if "children" in child:
                traverse(child)

    for c in containers:
        traverse(c)
    return result


def build_field_to_container(containers: list[dict]) -> dict[str, str]:
    result: dict[str, str] = {}

    def traverse(container: dict) -> None:
        for child in container.get("children", []):
            if _is_container(child):
                traverse(child)
            else:
                result[child["id"]] = container["id"]

    for c in containers:
        traverse(c)
    return result


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if value == "":
        return True
    if isinstance(value, list) and len(value) == 0:
        return True
    if isinstance(value, dict) and len(value) == 0:
        return True
    return False


def is_container_complete(
    container_id: str,
    descendant_fields: list[str],
    values: dict,
    derived: dict,
) -> bool:
    if container_id not in derived["visible"]:
        return True

    for field_id in descendant_fields:
        if field_id not in derived["visible"]:
            continue
        if field_id in derived["disabled"]:
            continue
        if field_id not in derived["valid"]:
            return False
        if field_id in derived["required"]:
            if _is_empty(values.get(field_id)):
                return False
    return True


# ---------------------------------------------------------------------------
# Repeats and computed fields (prepare-time collection)
# ---------------------------------------------------------------------------

def _collect_repeats(form: dict) -> tuple[dict, set[str], dict]:
    repeats: dict[str, dict] = {}
    repeat_fields: set[str] = set()
    container_repeats: dict[str, list[str]] = {}

    def register_repeat(container: dict, parent_id: str | None) -> list[str]:
        meta = container.get("meta") or {}
        fields: list[str] = []
        child_repeats: list[str] = []
        found: list[str] = [container["id"]]
        for child in container.get("children", []):
            if _is_container(child):
                if (child.get("meta") or {}).get("type") != "repeat":
                    raise ValueError(
                        f"Repeat container {container['id']!r} may only contain "
                        "field references or nested repeat containers"
                    )
                child_repeats.append(child["id"])
                found.extend(register_repeat(child, container["id"]))
            else:
                fields.append(child["id"])
                repeat_fields.add(child["id"])
        repeats[container["id"]] = {
            "fields": fields,
            "child_repeats": child_repeats,
            "parent_id": parent_id,
            "min": meta["min"] if isinstance(meta.get("min"), int) else 0,
            "max": meta["max"] if isinstance(meta.get("max"), int) else None,
        }
        container_repeats[container["id"]] = found
        return found

    def walk(container: dict) -> list[str]:
        meta = container.get("meta") or {}
        if meta.get("type") == "repeat":
            return register_repeat(container, None)
        found: list[str] = []
        for child in container.get("children", []):
            if _is_container(child):
                found.extend(walk(child))
        container_repeats[container["id"]] = found
        return found

    for container in form.get("layout", []):
        walk(container)
    return repeats, repeat_fields, container_repeats


def _collect_computed(form: dict, repeat_fields: set[str]) -> tuple[list[str], dict[str, str]]:
    computed_exprs: dict[str, str] = {}
    for field in form.get("fields", []):
        meta = field.get("meta") or {}
        if meta.get("type") != "computed":
            continue
        if field["id"] in repeat_fields:
            raise ValueError(
                f"Computed field {field['id']!r} cannot be a repeat row field"
            )
        expr = meta.get("expr")
        if isinstance(expr, str) and expr.strip():
            computed_exprs[field["id"]] = expr

    # Topological order over computed→computed references; cycles are a
    # schema error and rejected here rather than mis-evaluating later.
    ids = list(computed_exprs.keys())
    id_set = set(ids)
    deps: dict[str, list[str]] = {}
    for fid in ids:
        expr = computed_exprs[fid]
        referenced = set(re.findall(r"value\(\s*['\"]([^'\"]+)['\"]\s*\)", expr))
        for ident in re.findall(r"\b[a-zA-Z_]\w*\b", expr):
            if ident in id_set:
                referenced.add(ident)
        deps[fid] = [r for r in referenced if r in id_set and r != fid]

    order: list[str] = []
    state: dict[str, int] = {}  # 0 unvisited, 1 visiting, 2 done

    def visit(fid: str, chain: list[str]) -> None:
        if state.get(fid) == 2:
            return
        if state.get(fid) == 1:
            raise ValueError("Computed field cycle: " + " -> ".join(chain + [fid]))
        state[fid] = 1
        for dep in deps[fid]:
            visit(dep, chain + [fid])
        state[fid] = 2
        order.append(fid)

    for fid in ids:
        visit(fid, [])

    return order, computed_exprs


# ---------------------------------------------------------------------------
# Rule dependency extraction
# ---------------------------------------------------------------------------

def _extract_fields_from_expr(expr: Any, known_fields: set[str] | None = None) -> set[str]:
    if isinstance(expr, str):
        return extract_field_references(expr, known_fields)
    if isinstance(expr, dict):
        inner = expr.get("expressions", "")
        return _extract_fields_from_expr(inner, known_fields)
    if isinstance(expr, list):
        result: set[str] = set()
        for item in expr:
            result |= _extract_fields_from_expr(item, known_fields)
        return result
    return set()


def build_rule_dependencies(form: dict) -> dict:
    rule_to_fields: dict[str, set[str]] = {}
    field_to_rules: dict[str, set[str]] = {}

    known_fields = {field["id"] for field in form.get("fields", [])}

    for field in form.get("fields", []):
        field_to_rules[field["id"]] = set()

    for rule in form.get("rules", []):
        fields = _extract_fields_from_expr(rule.get("when", ""), known_fields)
        rule_to_fields[rule["id"]] = fields
        for fid in fields:
            if fid not in field_to_rules:
                field_to_rules[fid] = set()
            field_to_rules[fid].add(rule["id"])

    return {"rule_to_fields": rule_to_fields, "field_to_rules": field_to_rules}


# ---------------------------------------------------------------------------
# Expression evaluation (wrapper handling structured expressions)
# ---------------------------------------------------------------------------

def _evaluate_expr(expr: Any, values: dict, env: dict | None) -> bool:
    """Evaluate an expression that may be a string, dict, or list."""
    if isinstance(expr, str):
        return evaluate_expression(expr, values, env)

    if isinstance(expr, dict):
        join = expr.get("type", "and")
        inner = expr.get("expressions", "")

        if isinstance(inner, str):
            return _evaluate_expr(inner, values, env)
        if isinstance(inner, dict):
            return _evaluate_expr(inner, values, env)
        if isinstance(inner, list):
            results = [_evaluate_expr(item, values, env) for item in inner]
            if join == "or":
                return any(results)
            return all(results)

    if isinstance(expr, list):
        return all(_evaluate_expr(item, values, env) for item in expr)

    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_ROW_KEY_RE = re.compile(r"^(.+?)\[(\d+)\]\.(.+)$")


def row_key(repeat_id: str, index: int, field_id: str) -> str:
    return f"{repeat_id}[{index}].{field_id}"


def resolve_value_path(values: dict, target: str) -> Any:
    """Resolve a (possibly row-addressed, possibly nested) target to its
    current value, e.g. "members[0].qualifications[1].qual_name"."""
    m = _ROW_KEY_RE.match(target)
    if not m:
        return values.get(target)
    rows = values.get(m.group(1))
    if not isinstance(rows, list):
        return None
    idx = int(m.group(2))
    if idx >= len(rows) or rows[idx] is None:
        return None
    return resolve_value_path(rows[idx], m.group(3))


def _interpolate_message(message: str, values: dict) -> str:
    def repl(m: re.Match) -> str:
        name = m.group(1)
        if name in values:
            return format_value(values.get(name))
        return m.group(0)

    return re.sub(r"\{([a-zA-Z_]\w*)\}", repl, message)


def prepare_form(form: dict) -> dict:
    """
    One-time preprocessing of a form schema.

    Resolves templates, builds dependency maps, precomputes layout data,
    collects repeat containers, and orders computed fields (rejecting
    cycles).
    """
    resolved_rules = resolve_rule_templates(form.get("rules", []))
    prepared_form = {**form, "rules": resolved_rules}

    repeats, repeat_fields, container_repeats = _collect_repeats(prepared_form)
    computed_order, computed_exprs = _collect_computed(prepared_form, repeat_fields)

    return {
        "form": prepared_form,
        "dependencies": build_rule_dependencies(prepared_form),
        "container_descendants": build_container_descendants(prepared_form.get("layout", [])),
        "field_to_container": build_field_to_container(prepared_form.get("layout", [])),
        "computed_order": computed_order,
        "computed_exprs": computed_exprs,
        "repeats": repeats,
        "repeat_fields": repeat_fields,
        "container_repeats": container_repeats,
    }


def _apply_affect(derived: dict, affect: dict, target: str, message_values: dict) -> None:
    if "visible" in affect:
        if affect["visible"]:
            derived["visible"].add(target)
        else:
            derived["visible"].discard(target)

    if "disabled" in affect:
        if affect["disabled"]:
            derived["disabled"].add(target)
        else:
            derived["disabled"].discard(target)

    if "read_only" in affect:
        if affect["read_only"]:
            derived["read_only"].add(target)
        else:
            derived["read_only"].discard(target)

    if "required" in affect:
        if affect["required"]:
            derived["required"].add(target)
        else:
            derived["required"].discard(target)

    if "valid" in affect:
        if affect["valid"]:
            derived["valid"].add(target)
        else:
            derived["valid"].discard(target)

    if affect.get("blocking"):
        derived["blocking_targets"].add(target)

    if "options" in affect:
        derived["options"][target] = affect["options"]

    if "message" in affect and affect["message"]:
        # Parity with rules.ts: an affect that invalidates a field
        # defaults its message to "error" unless a type is given.
        msg_type = affect.get("type") or (
            "error" if affect.get("valid") is False else "info"
        )
        if target not in derived["messages"]:
            derived["messages"][target] = []
        derived["messages"][target].append({
            "type": msg_type,
            "message": _interpolate_message(affect["message"], message_values),
        })


def evaluate_rules(
    prepared: dict,
    values: dict,
    env: dict | None = None,
    current_container: str | None = None,
) -> dict:
    """
    Evaluate all rules and compute derived state + progress.

    Returns {"derived": ..., "progress": ..., "values": ...} where values
    is the input augmented with computed field results.
    """
    form = prepared["form"]
    repeats: dict = prepared.get("repeats", {})
    repeat_fields: set = prepared.get("repeat_fields", set())
    computed_order: list = prepared.get("computed_order", [])
    computed_exprs: dict = prepared.get("computed_exprs", {})

    # Working copy: repeat arrays normalized, computed fields evaluated in
    # dependency order before anything else runs.
    working_values = dict(values)
    for rid in repeats:
        if not isinstance(working_values.get(rid), list):
            working_values[rid] = []
    for fid in computed_order:
        working_values[fid] = evaluate_value_expression(
            computed_exprs[fid], working_values, env
        )

    # ---- Base derived state ----
    required: set[str] = set()
    visible: set[str] = set()
    disabled: set[str] = set()
    read_only: set[str] = set()
    valid: set[str] = set()
    blocking_targets: set[str] = set()
    messages: dict[str, list[dict]] = {}
    options: dict[str, list] = {}

    field_by_id = {f["id"]: f for f in form.get("fields", [])}

    for field in form.get("fields", []):
        fid = field["id"]
        if fid in repeat_fields:
            continue  # instantiated per row below
        visible.add(fid)
        valid.add(fid)
        meta = field.get("meta", {})
        if meta.get("type") == "computed":
            read_only.add(fid)  # computed values are never editable
            continue  # and never required/disabled by meta
        if meta.get("required"):
            required.add(fid)
        if meta.get("disabled"):
            disabled.add(fid)

    def mark_containers_visible(containers: list[dict]) -> None:
        for container in containers:
            if "children" in container:
                visible.add(container["id"])
                mark_containers_visible(container.get("children", []))

    mark_containers_visible(form.get("layout", []))

    # ---- Repeat instance enumeration ----
    # An "instance" is one row of one repeat, at any nesting depth. Its
    # prefix ("members[0].qualifications[1].") addresses its fields, and
    # its chain is the lexical value scope (globals, then each ancestor
    # row, then the row itself; inner shadows outer).
    _instances_cache: dict[str, list[dict]] = {}

    def get_instances(rid: str) -> list[dict]:
        if rid in _instances_cache:
            return _instances_cache[rid]
        spec = repeats[rid]
        out: list[dict] = []
        if spec["parent_id"] is None:
            rows = working_values[rid]
            for i, row in enumerate(rows):
                out.append({
                    "prefix": f"{rid}[{i}].",
                    "row": row or {},
                    "chain": {**working_values, **(row or {})},
                })
        else:
            for parent in get_instances(spec["parent_id"]):
                rows = parent["row"].get(rid)
                rows = rows if isinstance(rows, list) else []
                for i, row in enumerate(rows):
                    out.append({
                        "prefix": f"{parent['prefix']}{rid}[{i}].",
                        "row": row or {},
                        "chain": {**parent["chain"], **(row or {})},
                    })
        _instances_cache[rid] = out
        return out

    # Row-instance base state (all depths)
    for rid, spec in repeats.items():
        for inst in get_instances(rid):
            for f in spec["fields"]:
                key = inst["prefix"] + f
                visible.add(key)
                valid.add(key)
                template = field_by_id.get(f, {})
                if template.get("meta", {}).get("required"):
                    required.add(key)
                if template.get("meta", {}).get("disabled"):
                    disabled.add(key)

    derived = {
        "required": required,
        "visible": visible,
        "disabled": disabled,
        "read_only": read_only,
        "valid": valid,
        "blocking_targets": blocking_targets,
        "messages": messages,
        "options": options,
    }

    # ---- Rule evaluation (pass 1: truth) ----
    rule_truth: dict[str, bool] = {}
    scoped_truth: dict[str, list[bool]] = {}

    for rule in form.get("rules", []):
        rid_ = rule["id"]
        scope = rule.get("scope")

        if scope and scope in repeats:
            insts = get_instances(scope)
            truths: list[bool] = []
            for i in range(len(insts)):
                parents_ok = True
                for pid in rule.get("required_parent", []) or []:
                    if pid in scoped_truth:
                        ok = i < len(scoped_truth[pid]) and scoped_truth[pid][i] is True
                    else:
                        ok = rule_truth.get(pid, False) is True
                    if not ok:
                        parents_ok = False
                        break
                if not parents_ok:
                    truths.append(False)
                    continue
                try:
                    truths.append(_evaluate_expr(rule.get("when", ""), insts[i]["chain"], env))
                except Exception:
                    truths.append(False)
            scoped_truth[rid_] = truths
            rule_truth[rid_] = any(truths)
            continue

        parents = rule.get("required_parent", [])
        if parents:
            if not all(rule_truth.get(pid, False) for pid in parents):
                rule_truth[rid_] = False
                continue

        try:
            rule_truth[rid_] = _evaluate_expr(rule.get("when", ""), working_values, env)
        except Exception:
            rule_truth[rid_] = False

    # ---- Rule evaluation (pass 2: affects) ----
    for rule in form.get("rules", []):
        scope = rule.get("scope")

        if scope and scope in repeats:
            truths = scoped_truth.get(rule["id"], [])
            insts = get_instances(scope)
            for i, truth in enumerate(truths):
                if not truth:
                    continue
                for affect in rule.get("affects", []):
                    if affect["target"] in repeats[scope]["fields"]:
                        target = insts[i]["prefix"] + affect["target"]
                    else:
                        target = affect["target"]
                    _apply_affect(derived, affect, target, insts[i]["chain"])
            continue

        if not rule_truth.get(rule["id"], False):
            continue
        for affect in rule.get("affects", []):
            _apply_affect(derived, affect, affect["target"], working_values)

    # ---- Visibility cascade ----
    def apply_container_cascade(elements: list[dict], ancestor_hidden: bool) -> None:
        for el in elements:
            if "children" in el:
                hidden = ancestor_hidden or el["id"] not in visible
                if hidden:
                    visible.discard(el["id"])
                apply_container_cascade(el.get("children", []), hidden)
            elif ancestor_hidden:
                visible.discard(el["id"])

    apply_container_cascade(form.get("layout", []), False)

    for rid, spec in repeats.items():
        if rid in visible:
            continue
        for inst in get_instances(rid):
            for f in spec["fields"]:
                visible.discard(inst["prefix"] + f)

    # ---- Completeness ----
    complete_containers: set[str] = set()

    def _instance_arrays(rid: str) -> list[dict]:
        """One repeat's instance-arrays: min/max apply per parent row for
        nested repeats (each parent row's own array must satisfy them)."""
        spec = repeats[rid]
        if spec["parent_id"] is None:
            return [{"rows": working_values[rid], "prefix_base": ""}]
        arrays = []
        for parent in get_instances(spec["parent_id"]):
            rows = parent["row"].get(rid)
            arrays.append({
                "rows": rows if isinstance(rows, list) else [],
                "prefix_base": parent["prefix"],
            })
        return arrays

    def repeat_complete(rid: str) -> bool:
        if rid not in visible:
            return True
        spec = repeats[rid]
        for arr in _instance_arrays(rid):
            rows = arr["rows"]
            if len(rows) < spec["min"]:
                return False
            if spec["max"] is not None and len(rows) > spec["max"]:
                return False
            for i, row in enumerate(rows):
                for f in spec["fields"]:
                    key = f"{arr['prefix_base']}{rid}[{i}].{f}"
                    if key not in visible:
                        continue
                    if key in disabled:
                        continue
                    if key not in valid:
                        return False
                    if key in required and _is_empty((row or {}).get(f)):
                        return False
        return True

    container_repeats: dict = prepared.get("container_repeats", {})
    for cid, descendant_fields in prepared["container_descendants"].items():
        if cid in repeats:
            # container_repeats[cid] lists this repeat plus every nested
            # repeat, so a parent is complete only when its descendants are.
            if all(repeat_complete(r) for r in container_repeats.get(cid, [cid])):
                complete_containers.add(cid)
            continue
        if cid not in visible:
            complete_containers.add(cid)
            continue
        complete = True
        for field_id in descendant_fields:
            if field_id in repeat_fields:
                continue  # row fields checked via repeats
            if field_id not in visible:
                continue
            if field_id in disabled:
                continue
            if field_id not in valid:
                complete = False
                break
            if field_id in required and _is_empty(working_values.get(field_id)):
                complete = False
                break
        if complete:
            for rid in container_repeats.get(cid, []):
                if not repeat_complete(rid):
                    complete = False
                    break
        if complete:
            complete_containers.add(cid)

    progress = {
        "current_container": current_container,
        "complete_containers": complete_containers,
    }

    return {"derived": derived, "progress": progress, "values": working_values}


def can_progress(derived: dict, values: dict) -> bool:
    """Check if the form can progress (no blocking targets prevent it)."""
    for target in derived["blocking_targets"]:
        if target not in derived["visible"]:
            continue
        if target in derived["disabled"]:
            continue
        if target not in derived["valid"]:
            return False
        if _is_empty(resolve_value_path(values, target)):
            return False
    return True


def collect_field_errors(
    form: dict,
    derived: dict,
    values: dict,
    *,
    only_fields: set[str] | None = None,
) -> dict[str, list[str]]:
    """
    Collect validation errors for visible, non-disabled fields, including
    repeat rows (addressed as repeat_id[index].field_id) and row-count
    violations (addressed to the repeat container id).

    Args:
        form: The form schema dict.
        derived: Derived state from evaluate_rules().
        values: Current field values (use the values returned by
            evaluate_rules so computed fields are present).
        only_fields: If provided, only check these field IDs — include a
            repeat container id to include its rows (for per-step
            validation).

    Returns:
        Dict of field_id -> list of error strings. Empty dict means no errors.
    """
    errors: dict[str, list[str]] = {}

    repeats, repeat_fields, _ = _collect_repeats(form)

    def include(fid: str) -> bool:
        return only_fields is None or fid in only_fields

    for field in form.get("fields", []):
        fid = field["id"]
        if fid in repeat_fields:
            continue  # handled per row below
        if not include(fid):
            continue
        if fid not in derived["visible"]:
            continue
        if fid in derived["disabled"]:
            continue

        field_messages = derived["messages"].get(fid, [])
        field_errors = [m["message"] for m in field_messages if m["type"] == "error"]

        if fid not in derived["valid"]:
            if not field_errors:
                field_errors.append("This field is invalid.")

        if fid in derived["required"]:
            if _is_empty(values.get(fid)):
                field_errors.append("This field is required.")

        if field_errors:
            errors[fid] = field_errors

    # Instance walk (nested repeats produce one array per parent row)
    inst_cache: dict[str, list] = {}

    def instances(rid: str) -> list:
        if rid in inst_cache:
            return inst_cache[rid]
        spec = repeats[rid]
        out = []
        if spec["parent_id"] is None:
            rows = values.get(rid)
            rows = rows if isinstance(rows, list) else []
            for i, row in enumerate(rows):
                out.append((f"{rid}[{i}].", row or {}))
        else:
            for pprefix, prow in instances(spec["parent_id"]):
                rows = prow.get(rid)
                rows = rows if isinstance(rows, list) else []
                for i, row in enumerate(rows):
                    out.append((f"{pprefix}{rid}[{i}].", row or {}))
        inst_cache[rid] = out
        return out

    def arrays(rid: str) -> list:
        spec = repeats[rid]
        if spec["parent_id"] is None:
            rows = values.get(rid)
            return [("", rows if isinstance(rows, list) else [])]
        result = []
        for pprefix, prow in instances(spec["parent_id"]):
            rows = prow.get(rid)
            result.append((pprefix, rows if isinstance(rows, list) else []))
        return result

    for rid, spec in repeats.items():
        row_included = only_fields is None or rid in only_fields or any(
            f in only_fields for f in spec["fields"]
        )
        if not row_included:
            continue
        if rid not in derived["visible"]:
            continue

        for prefix_base, rows in arrays(rid):
            bound_key = f"{prefix_base}{rid}" if prefix_base else rid
            if len(rows) < spec["min"]:
                errors.setdefault(bound_key, []).append(
                    f"At least {spec['min']} entries are required."
                )
            if spec["max"] is not None and len(rows) > spec["max"]:
                errors.setdefault(bound_key, []).append(
                    f"At most {spec['max']} entries are allowed."
                )

            for i, row in enumerate(rows):
                for f in spec["fields"]:
                    key = f"{prefix_base}{rid}[{i}].{f}"
                    if key not in derived["visible"]:
                        continue
                    if key in derived["disabled"]:
                        continue
                    field_messages = derived["messages"].get(key, [])
                    field_errors = [m["message"] for m in field_messages if m["type"] == "error"]
                    if key not in derived["valid"]:
                        if not field_errors:
                            field_errors.append("This field is invalid.")
                    if key in derived["required"] and _is_empty((row or {}).get(f)):
                        field_errors.append("This field is required.")
                    if field_errors:
                        errors[key] = field_errors

    return errors


def validate_step(
    prepared: dict,
    values: dict,
    step_id: str,
    env: dict | None = None,
) -> dict:
    """
    Validate only the fields belonging to a specific step/container.

    Evaluates all rules (since rules may depend on fields in other steps),
    but only collects errors for fields within the given container,
    including any repeat rows it contains.

    Returns:
        {"valid": bool, "errors": dict, "step_values": dict}
        step_values contains only the fields belonging to this step
        (computed fields included).
    """
    result = evaluate_rules(prepared, values, env, current_container=step_id)
    derived = result["derived"]
    working_values = result["values"]
    form = prepared["form"]

    step_fields = set(prepared["container_descendants"].get(step_id, []))
    step_fields |= set(prepared.get("container_repeats", {}).get(step_id, []))
    if step_id in prepared.get("repeats", {}):
        step_fields.add(step_id)

    errors = collect_field_errors(form, derived, working_values, only_fields=step_fields)

    step_values = {
        fid: working_values[fid] for fid in step_fields if fid in working_values
    }

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "step_values": step_values,
    }
