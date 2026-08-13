"""
Built-in rule templates — Python port of @protoform/core templates.
"""

from __future__ import annotations

import re
from typing import Any


RULE_TEMPLATES: dict[str, dict] = {
    "minValue": {
        "params": ["fieldId", "minValue"],
        "expression": "value('${fieldId}') < ${minValue} && value('${fieldId}') !== null && value('${fieldId}') !== ''",
    },
    "maxValue": {
        "params": ["fieldId", "maxValue"],
        "expression": "value('${fieldId}') > ${maxValue}",
    },
    "between": {
        "params": ["fieldId", "min", "max"],
        "expression": "(value('${fieldId}') < ${min} || value('${fieldId}') > ${max}) && value('${fieldId}') !== null",
    },
    "fieldEquals": {
        "params": ["fieldId", "value"],
        "expression": "value('${fieldId}') === '${value}'",
    },
    "fieldNotEquals": {
        "params": ["fieldId", "value"],
        "expression": "value('${fieldId}') !== '${value}'",
    },
    "isEmpty": {
        "params": ["fieldId"],
        "expression": "isEmpty(value('${fieldId}'))",
    },
    "isNotEmpty": {
        "params": ["fieldId"],
        "expression": "!isEmpty(value('${fieldId}'))",
    },
    "fieldsEqual": {
        "params": ["fieldId1", "fieldId2"],
        "expression": "value('${fieldId1}') === value('${fieldId2}')",
    },
    "fieldGreaterThan": {
        "params": ["fieldId1", "fieldId2"],
        "expression": "value('${fieldId1}') > value('${fieldId2}')",
    },
    "fieldLessThan": {
        "params": ["fieldId1", "fieldId2"],
        "expression": "value('${fieldId1}') < value('${fieldId2}')",
    },
    "matches": {
        "params": ["fieldId", "pattern"],
        "expression": "/${pattern}/.test(value('${fieldId}') || '')",
    },
    "minLength": {
        "params": ["fieldId", "minLength"],
        "expression": "(value('${fieldId}') || '').length < ${minLength}",
    },
    "maxLength": {
        "params": ["fieldId", "maxLength"],
        "expression": "(value('${fieldId}') || '').length > ${maxLength}",
    },
    "includes": {
        "params": ["fieldId", "value"],
        "expression": "(value('${fieldId}') || []).includes('${value}')",
    },
    "notIncludes": {
        "params": ["fieldId", "value"],
        "expression": "!(value('${fieldId}') || []).includes('${value}')",
    },
}

import re as _re_name


def register_template(name: str, params: list[str], expression: str) -> None:
    """Register a custom rule template — a named, parameterized expression
    generator. Hosts add domain-specific shorthands (typically delegating to
    a function added via register_function). Register the same template in
    every engine that prepares the schema."""
    if not _re_name.match(r"^[a-zA-Z_]\w*$", name):
        raise ValueError(f"Invalid template name: {name}")
    RULE_TEMPLATES[name] = {"params": list(params), "expression": expression}


def unregister_template(name: str) -> None:
    RULE_TEMPLATES.pop(name, None)


def resolve_template(template_id: str, params: dict[str, Any]) -> str:
    """Resolve a template by substituting parameter values into the expression."""
    tpl = RULE_TEMPLATES.get(template_id)
    if tpl is None:
        raise ValueError(f"Unknown template: {template_id}")

    expression = tpl["expression"]
    for param_name in tpl["params"]:
        if param_name not in params:
            raise ValueError(f"Missing parameter '{param_name}' for template '{template_id}'")

    for key, val in params.items():
        # Literal replacement — regex-based substitution corrupts params
        # containing backslashes (e.g. matches('^\d{4}$')).
        expression = expression.replace("${" + key + "}", str(val))

    return expression


def is_template_reference(expr_string: str) -> bool:
    """Check if an expression string is a template reference.

    A template reference is exactly ``name`` or ``name(args)`` — the paren
    opened after the name must close at the END of the string. Compound
    expressions that merely start with a template name (e.g.
    ``isEmpty(x) && value('y') === 'z'``) are plain expressions.
    """
    if expr_string in RULE_TEMPLATES:
        return True
    match = re.match(r"^(\w+)\(", expr_string)
    if not match or match.group(1) not in RULE_TEMPLATES:
        return False

    depth = 0
    quote: str | None = None
    for i in range(len(match.group(1)), len(expr_string)):
        ch = expr_string[i]
        if quote:
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i == len(expr_string) - 1
    return False


def _split_template_args(params_str: str) -> list[str]:
    """Split template args on commas, ignoring commas inside quoted strings
    (e.g. matches('^[A-Z]{2,4}$') is a single argument)."""
    args: list[str] = []
    current = ""
    quote: str | None = None
    for ch in params_str:
        if quote:
            current += ch
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
            current += ch
        elif ch == ",":
            args.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        args.append(current.strip())
    return args


def parse_template_reference(expr_string: str) -> tuple[str, dict[str, Any]]:
    """Parse 'templateName(arg1, arg2)' into (template_id, params)."""
    if expr_string in RULE_TEMPLATES:
        return expr_string, {}

    match = re.match(r"^(\w+)\((.*)\)$", expr_string)
    if not match:
        raise ValueError(f"Invalid template reference: {expr_string}")

    template_id = match.group(1)
    params_str = match.group(2).strip()

    tpl = RULE_TEMPLATES.get(template_id)
    if tpl is None:
        raise ValueError(f"Unknown template: {template_id}")

    params: dict[str, Any] = {}
    if params_str:
        param_values = _split_template_args(params_str)

        # Auto-infer fieldId
        should_auto_infer = (
            tpl["params"][0] == "fieldId"
            and len(param_values) < len(tpl["params"])
        )

        value_index = 0
        for i, param_name in enumerate(tpl["params"]):
            if should_auto_infer and param_name == "fieldId":
                continue
            if value_index < len(param_values):
                raw = param_values[value_index]
                # Try numeric
                if re.match(r"^-?\d+(\.\d+)?$", raw):
                    params[param_name] = float(raw) if "." in raw else int(raw)
                elif (raw.startswith("'") and raw.endswith("'")) or (raw.startswith('"') and raw.endswith('"')):
                    params[param_name] = raw[1:-1]
                else:
                    params[param_name] = raw
                value_index += 1

    return template_id, params


def resolve_expression_string(expr_string: str, rule: dict) -> str:
    """Resolve a single expression string (may be a template reference)."""
    if not is_template_reference(expr_string):
        return expr_string

    template_id, params = parse_template_reference(expr_string)
    tpl = RULE_TEMPLATES[template_id]

    if "fieldId" in tpl["params"] and "fieldId" not in params:
        affects = rule.get("affects", [])
        if affects:
            params["fieldId"] = affects[0].get("target", "")
        else:
            raise ValueError(
                f"Rule '{rule.get('id')}' uses template '{template_id}' which requires fieldId"
            )

    return resolve_template(template_id, params)


def _resolve_expr(expr: Any, rule: dict) -> Any:
    """Recursively resolve template references in an expression tree."""
    if isinstance(expr, str):
        return resolve_expression_string(expr, rule)

    if isinstance(expr, list):
        return [_resolve_expr(e, rule) for e in expr]

    if isinstance(expr, dict) and "expressions" in expr:
        return {**expr, "expressions": _resolve_expr(expr["expressions"], rule)}

    return expr


def resolve_rule_templates(rules: list[dict]) -> list[dict]:
    """Resolve all template references in a list of rules."""
    resolved = []
    for rule in rules:
        when = rule.get("when", "")
        if isinstance(when, str):
            when = {"expressions": when}
        resolved.append({**rule, "when": _resolve_expr(when, rule)})
    return resolved
