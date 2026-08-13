"""
TS/Python parity tests — locks in behavior added/fixed during the 2026-08
protocol review. Each test here mirrors semantics the TS engine already had
(or that both engines gained simultaneously):

- the `matches` template resolves with the pattern as the .test() receiver
- /regex/ literals parse (spec §3 syntax)
- isEmpty() works as an expression function
- bare identifiers resolve to field values
- string-vs-string ordering comparisons are lexicographic (ISO date rules)
- unknown characters raise at tokenize time (expression -> False, not garbage)
- template args may contain commas inside quotes
- affect messages default to "error" when valid is False
- bare identifiers register rule dependencies
"""

import pytest

from protoform import (
    prepare_form,
    evaluate_rules,
    evaluate_expression,
    collect_field_errors,
    resolve_rule_templates,
)
from protoform.engine import build_rule_dependencies
from protoform.expressions import tokenize
from protoform.templates import parse_template_reference


class TestMatchesTemplate:
    def _form(self, pattern="^[A-Z]{2,4}$"):
        return {
            "fields": [{"id": "code", "meta": {"type": "text", "label": "Code"}}],
            "layout": [],
            "rules": [
                {
                    "id": "code-format",
                    "when": f"matches('{pattern}')",
                    "affects": [
                        {"target": "code", "valid": False, "message": "Bad code"}
                    ],
                }
            ],
        }

    def test_resolves_identically_to_ts(self):
        resolved = resolve_rule_templates(self._form()["rules"])
        expr = resolved[0]["when"]["expressions"]
        # Byte-identical to the TS template output
        assert expr == "/^[A-Z]{2,4}$/.test(value('code') || '')"

    def test_fires_when_value_matches(self):
        prepared = prepare_form(self._form())
        result = evaluate_rules(prepared, {"code": "ABC"})
        assert "code" not in result["derived"]["valid"]

    def test_does_not_fire_when_value_does_not_match(self):
        prepared = prepare_form(self._form())
        result = evaluate_rules(prepared, {"code": "abc"})
        assert "code" in result["derived"]["valid"]


class TestRegexLiterals:
    def test_spec_syntax_parses_and_evaluates(self):
        assert evaluate_expression("/^[A-Z]/.test(value('code'))", {"code": "Hello"}) is True
        assert evaluate_expression("/^[A-Z]/.test(value('code'))", {"code": "hello"}) is False

    def test_escaped_slash_in_pattern(self):
        assert evaluate_expression("/a\\/b/.test(value('x'))", {"x": "a/b"}) is True

    def test_none_target_is_false(self):
        assert evaluate_expression("/^A/.test(value('missing'))", {}) is False


class TestIsEmptyFunction:
    @pytest.mark.parametrize(
        "value,expected",
        [(None, True), ("", True), ([], True), ({}, True),
         (0, False), (False, False), ("a", False), ([0], False), ({"a": 1}, False)],
    )
    def test_is_empty_call(self, value, expected):
        assert evaluate_expression("isEmpty(value('x'))", {"x": value}) is expected

    def test_is_empty_on_bare_identifier(self):
        assert evaluate_expression("isEmpty(first_name)", {"first_name": ""}) is True
        assert evaluate_expression("isEmpty(first_name)", {"first_name": "Alex"}) is False


class TestBareIdentifiers:
    def test_bare_identifier_resolves_to_field_value(self):
        assert evaluate_expression("age >= 18", {"age": 21}) is True
        assert evaluate_expression("age >= 18", {"age": 15}) is False

    def test_negated_bare_identifier(self):
        assert evaluate_expression("!accept_terms", {"accept_terms": False}) is True
        assert evaluate_expression("!accept_terms", {"accept_terms": True}) is False

    def test_unknown_identifier_is_none(self):
        assert evaluate_expression("missing === null", {}) is True


class TestStringComparison:
    def test_iso_date_strings_compare_lexicographically(self):
        values = {"start": "2026-01-01", "end": "2026-02-01"}
        assert evaluate_expression("value('end') >= value('start')", values) is True
        assert evaluate_expression("value('end') < value('start')", values) is False

    def test_numeric_comparison_still_numeric(self):
        # 10 > 9 numerically even though '10' < '9' lexicographically
        assert evaluate_expression("value('a') > value('b')", {"a": 10, "b": 9}) is True


class TestArrayLiterals:
    def test_spec_includes_example_parses(self):
        # Spec §3 example — previously unparseable in Python
        expr = "(value('tags') || []).includes('vip')"
        assert evaluate_expression(expr, {"tags": ["vip", "au"]}) is True
        assert evaluate_expression(expr, {"tags": ["au"]}) is False
        assert evaluate_expression(expr, {}) is False

    def test_includes_template_end_to_end(self):
        form = {
            "fields": [{"id": "tags", "meta": {"type": "select", "label": "Tags"}}],
            "layout": [],
            "rules": [
                {"id": "vip", "when": "includes('vip')",
                 "affects": [{"target": "tags", "valid": False}]},
            ],
        }
        prepared = prepare_form(form)
        assert "tags" not in evaluate_rules(prepared, {"tags": ["vip"]})["derived"]["valid"]
        assert "tags" in evaluate_rules(prepared, {"tags": ["basic"]})["derived"]["valid"]

    def test_min_length_template_with_null_value(self):
        form = {
            "fields": [{"id": "name", "meta": {"type": "text", "label": "Name"}}],
            "layout": [],
            "rules": [
                {"id": "len", "when": "minLength(2)",
                 "affects": [{"target": "name", "valid": False}]},
            ],
        }
        prepared = prepare_form(form)
        # (value || '').length < 2 — null coalesces to '' whose length is 0
        assert "name" not in evaluate_rules(prepared, {"name": None})["derived"]["valid"]
        assert "name" in evaluate_rules(prepared, {"name": "Al"})["derived"]["valid"]


class TestTokenizerStrictness:
    def test_unknown_character_raises(self):
        with pytest.raises(ValueError):
            tokenize("value('a') @ 5")

    def test_expression_with_unknown_character_evaluates_false(self):
        assert evaluate_expression("value('a') @ 5", {"a": 1}) is False


class TestTemplateArgSplitting:
    def test_comma_inside_quoted_pattern(self):
        template_id, params = parse_template_reference("matches('^[A-Z]{2,4}$')")
        assert template_id == "matches"
        assert params["pattern"] == "^[A-Z]{2,4}$"

    def test_comma_inside_quoted_value(self):
        _, params = parse_template_reference("fieldEquals('a,b')")
        assert params["value"] == "a,b"

    def test_backslash_pattern_survives_resolution(self):
        # Regression: re.sub-based replacement crashed on backslashes
        from protoform import resolve_rule_templates
        resolved = resolve_rule_templates([
            {"id": "r", "when": "matches('^\\d{4}$')",
             "affects": [{"target": "code", "valid": False}]},
        ])
        assert resolved[0]["when"]["expressions"] == "/^\\d{4}$/.test(value('code') || '')"
        prepared = prepare_form({
            "fields": [{"id": "code", "meta": {"type": "text", "label": "Code"}}],
            "layout": [],
            "rules": [{"id": "r", "when": "matches('^\\d{4}$')",
                       "affects": [{"target": "code", "valid": False}]}],
        })
        assert "code" not in evaluate_rules(prepared, {"code": "1234"})["derived"]["valid"]
        assert "code" in evaluate_rules(prepared, {"code": "12a4"})["derived"]["valid"]

    def test_unquoted_args_still_split(self):
        _, params = parse_template_reference("between(0, 150)")
        assert params["min"] == 0
        assert params["max"] == 150


class TestMessageTypeParity:
    def test_invalidating_message_defaults_to_error(self):
        form = {
            "fields": [{"id": "reg_code", "meta": {"type": "text", "label": "Registration code"}}],
            "layout": [],
            "rules": [
                {
                    "id": "code-check",
                    "when": "value('reg_code') === 'bad'",
                    # No explicit type — TS defaults to "error" because valid is False
                    "affects": [{"target": "reg_code", "valid": False, "message": "Invalid code"}],
                }
            ],
        }
        prepared = prepare_form(form)
        result = evaluate_rules(prepared, {"reg_code": "bad"})
        msgs = result["derived"]["messages"]["reg_code"]
        assert msgs == [{"type": "error", "message": "Invalid code"}]

        errors = collect_field_errors(prepared["form"], result["derived"], {"reg_code": "bad"})
        assert errors["reg_code"] == ["Invalid code"]

    def test_message_without_valid_still_defaults_to_info(self):
        form = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [],
            "rules": [
                {
                    "id": "note",
                    "when": "value('x') === 'y'",
                    "affects": [{"target": "x", "message": "Just so you know"}],
                }
            ],
        }
        prepared = prepare_form(form)
        result = evaluate_rules(prepared, {"x": "y"})
        assert result["derived"]["messages"]["x"][0]["type"] == "info"


class TestCompoundTemplateNameExpressions:
    """Regression: expressions that merely START with a template name used to
    be claimed by the template parser, which then threw and poisoned
    prepare_form for the whole schema."""

    def test_reference_detection_requires_full_string_match(self):
        from protoform.templates import is_template_reference
        assert is_template_reference("isEmpty(first_name)") is True
        assert is_template_reference("matches('^(A|B)$')") is True  # parens in pattern
        assert is_template_reference("isEmpty(other) && value('p') === 'x'") is False
        assert is_template_reference("isEmpty(a) || isEmpty(b)") is False

    def test_compound_isempty_rule_prepares_and_evaluates(self):
        form = {
            "fields": [
                {"id": "request_type", "meta": {"type": "select", "label": "Purpose"}},
                {"id": "other_purpose", "meta": {"type": "text", "label": "Other"}},
            ],
            "layout": [],
            "rules": [
                {"id": "req_other",
                 "when": "isEmpty(other_purpose) && value('request_type') === 'other'",
                 "affects": [{"target": "other_purpose", "valid": False, "message": "Please specify"}]},
            ],
        }
        prepared = prepare_form(form)  # must not raise
        result = evaluate_rules(prepared, {"request_type": "other"})
        assert "other_purpose" not in result["derived"]["valid"]
        result = evaluate_rules(prepared, {"request_type": "standard"})
        assert "other_purpose" in result["derived"]["valid"]

    def test_isempty_template_agrees_with_builtin_on_empty_array(self):
        # The isEmpty template now delegates to the builtin, so [] counts as
        # empty — consistent with spec §7 and container completeness.
        form = {
            "fields": [{"id": "tags", "meta": {"type": "select", "label": "Tags"}}],
            "layout": [],
            "rules": [
                {"id": "req_tags", "when": "isEmpty",
                 "affects": [{"target": "tags", "valid": False, "message": "Pick one"}]},
            ],
        }
        prepared = prepare_form(form)
        assert "tags" not in evaluate_rules(prepared, {"tags": []})["derived"]["valid"]
        assert "tags" in evaluate_rules(prepared, {"tags": ["vip"]})["derived"]["valid"]


class TestContainerVisibilityCascade:
    def _form(self):
        return {
            "fields": [
                {"id": "entity_type", "meta": {"type": "select", "label": "Entity"}},
                {"id": "reg_code", "meta": {"type": "text", "label": "Registration code", "required": True}},
            ],
            "layout": [
                {"id": "step1", "meta": {"title": "Basics"},
                 "children": [{"id": "entity_type"}]},
                {"id": "company_step", "meta": {"title": "Company"},
                 "children": [{"id": "reg_code"}]},
            ],
            "rules": [
                {"id": "hide-company-step",
                 "when": "value('entity_type') !== 'company'",
                 "affects": [{"target": "company_step", "visible": False}]},
            ],
        }

    def test_hidden_container_hides_descendants(self):
        prepared = prepare_form(self._form())
        result = evaluate_rules(prepared, {"entity_type": "individual"})
        assert "company_step" not in result["derived"]["visible"]
        assert "reg_code" not in result["derived"]["visible"]

    def test_hidden_section_required_fields_do_not_error(self):
        prepared = prepare_form(self._form())
        values = {"entity_type": "individual"}
        result = evaluate_rules(prepared, values)
        errors = collect_field_errors(prepared["form"], result["derived"], values)
        assert "reg_code" not in errors

    def test_visible_container_restores_validation(self):
        prepared = prepare_form(self._form())
        values = {"entity_type": "company"}
        result = evaluate_rules(prepared, values)
        assert "reg_code" in result["derived"]["visible"]
        errors = collect_field_errors(prepared["form"], result["derived"], values)
        assert errors["reg_code"] == ["This field is required."]


class TestBareIdentifierDependencies:
    def test_bare_identifiers_register_dependencies(self):
        form = {
            "fields": [
                {"id": "first_name", "meta": {"type": "text", "label": "First"}},
                {"id": "age", "meta": {"type": "number", "label": "Age"}},
                {"id": "country", "meta": {"type": "text", "label": "Country"}},
            ],
            "layout": [],
            "rules": [
                {"id": "r1", "when": "isEmpty(first_name)",
                 "affects": [{"target": "first_name", "valid": False}]},
                {"id": "r2", "when": "age >= 18 && value('country') === 'AU'",
                 "affects": [{"target": "age", "valid": False}]},
            ],
        }
        deps = build_rule_dependencies(form)
        assert "first_name" in deps["rule_to_fields"]["r1"]
        assert "age" in deps["rule_to_fields"]["r2"]
        assert "country" in deps["rule_to_fields"]["r2"]
        assert "r1" in deps["field_to_rules"]["first_name"]

    def test_non_field_identifiers_not_registered(self):
        form = {
            "fields": [{"id": "age", "meta": {"type": "number", "label": "Age"}}],
            "layout": [],
            "rules": [
                {"id": "r1", "when": "env('mode') === 'x' && age > 1",
                 "affects": [{"target": "age", "valid": False}]},
            ],
        }
        deps = build_rule_dependencies(form)
        assert deps["rule_to_fields"]["r1"] == {"age"}


class TestComputedFields:
    def test_cycle_rejected_at_prepare(self):
        form = {
            "fields": [
                {"id": "a", "meta": {"type": "computed", "label": "A", "expr": "value('b') + 1"}},
                {"id": "b", "meta": {"type": "computed", "label": "B", "expr": "value('a') + 1"}},
            ],
            "layout": [], "rules": [],
        }
        with pytest.raises(ValueError, match="cycle"):
            prepare_form(form)

    def test_computed_read_only_and_not_required(self):
        form = {
            "fields": [
                {"id": "x", "meta": {"type": "number", "label": "X"}},
                {"id": "double", "meta": {"type": "computed", "label": "2x",
                                          "expr": "value('x') * 2", "required": True}},
            ],
            "layout": [], "rules": [],
        }
        prepared = prepare_form(form)
        result = evaluate_rules(prepared, {"x": 21})
        assert result["values"]["double"] == 42
        assert "double" in result["derived"]["read_only"]
        assert "double" not in result["derived"]["required"]

    def test_validate_step_uses_computed_values(self):
        form = {
            "fields": [
                {"id": "x", "meta": {"type": "number", "label": "X"}},
                {"id": "double", "meta": {"type": "computed", "label": "2x", "expr": "value('x') * 2"}},
            ],
            "layout": [{"id": "s1", "meta": {"title": "S"},
                        "children": [{"id": "x"}, {"id": "double"}]}],
            "rules": [{"id": "cap", "when": "value('double') > 10",
                       "affects": [{"target": "x", "valid": False, "message": "Too big: {double}"}]}],
        }
        from protoform import validate_step
        prepared = prepare_form(form)
        result = validate_step(prepared, {"x": 6}, "s1")
        assert result["valid"] is False
        assert result["errors"]["x"] == ["Too big: 12"]
        assert result["step_values"]["double"] == 12


class TestRepeaters:
    def _form(self):
        return {
            "fields": [
                {"id": "name", "meta": {"type": "text", "label": "Name", "required": True}},
                {"id": "phone", "meta": {"type": "text", "label": "Phone"}},
            ],
            "layout": [
                {"id": "contacts",
                 "meta": {"title": "Contacts", "type": "repeat", "min": 1, "max": 2},
                 "children": [{"id": "name"}, {"id": "phone"}]},
            ],
            "rules": [],
        }

    def test_nested_container_rejected(self):
        bad = {
            "fields": [],
            "layout": [{"id": "r", "meta": {"title": "R", "type": "repeat"},
                        "children": [{"id": "inner", "meta": {"title": "I"}, "children": []}]}],
            "rules": [],
        }
        with pytest.raises(ValueError, match="field references"):
            prepare_form(bad)

    def test_row_errors_and_min_rows(self):
        prepared = prepare_form(self._form())
        result = evaluate_rules(prepared, {"contacts": []})
        errors = collect_field_errors(prepared["form"], result["derived"], result["values"])
        assert errors["contacts"] == ["At least 1 entries are required."]

        result = evaluate_rules(prepared, {"contacts": [{"phone": "0400"}]})
        errors = collect_field_errors(prepared["form"], result["derived"], result["values"])
        assert errors["contacts[0].name"] == ["This field is required."]

    def test_validate_step_scopes_to_repeat(self):
        from protoform import validate_step
        prepared = prepare_form(self._form())
        result = validate_step(prepared, {"contacts": [{"phone": "0400"}]}, "contacts")
        assert result["valid"] is False
        assert "contacts[0].name" in result["errors"]


class TestNestedRepeaters:
    def _form(self):
        return {
            "fields": [
                {"id": "team_name", "meta": {"type": "text", "label": "Team", "required": True}},
                {"id": "member_name", "meta": {"type": "text", "label": "Member", "required": True}},
            ],
            "layout": [
                {"id": "teams", "meta": {"title": "Teams", "type": "repeat", "min": 1},
                 "children": [
                     {"id": "team_name"},
                     {"id": "members",
                      "meta": {"title": "Members", "type": "repeat", "min": 1, "max": 2},
                      "children": [{"id": "member_name"}]},
                 ]},
            ],
            "rules": [],
        }

    def test_nested_error_addressing(self):
        prepared = prepare_form(self._form())
        values = {"teams": [{"team_name": "A", "members": [{}]}]}
        result = evaluate_rules(prepared, values)
        errors = collect_field_errors(prepared["form"], result["derived"], result["values"])
        assert errors["teams[0].members[0].member_name"] == ["This field is required."]

    def test_per_parent_row_min_violation_key(self):
        prepared = prepare_form(self._form())
        values = {"teams": [
            {"team_name": "A", "members": [{"member_name": "Sam"}]},
            {"team_name": "B", "members": []},
        ]}
        result = evaluate_rules(prepared, values)
        errors = collect_field_errors(prepared["form"], result["derived"], result["values"])
        assert errors["teams[1].members"] == ["At least 1 entries are required."]

    def test_validate_step_covers_nested(self):
        from protoform import validate_step
        prepared = prepare_form(self._form())
        result = validate_step(prepared, {"teams": [{"team_name": "A", "members": [{}]}]}, "teams")
        assert result["valid"] is False
        assert "teams[0].members[0].member_name" in result["errors"]


class TestResponseValues:
    def test_response_values_defaults_to_computed(self):
        import protoform.views as views_mod
        form = {
            "fields": [
                {"id": "qty", "meta": {"type": "number", "label": "Qty"}},
                {"id": "total", "meta": {"type": "computed", "label": "T", "expr": "value('qty') * 5"}},
            ],
            "layout": [{"id": "s1", "meta": {"title": "S"}, "children": [{"id": "qty"}, {"id": "total"}]}],
            "rules": [],
        }
        view = views_mod.ProtoFormView()
        prepared = prepare_form(form)
        result = evaluate_rules(prepared, {"qty": 4})
        out = view.response_values(result["values"], prepared, step_id=None)
        assert out == {"total": 20}
