"""Tests for the template system."""

import pytest
from protoform.templates import (
    RULE_TEMPLATES,
    resolve_template,
    is_template_reference,
    parse_template_reference,
    resolve_expression_string,
    resolve_rule_templates,
)


class TestRuleTemplatesRegistry:
    def test_has_16_templates(self):
        assert len(RULE_TEMPLATES) == 15

    def test_all_templates_have_params_and_expression(self):
        for name, tpl in RULE_TEMPLATES.items():
            assert "params" in tpl, f"{name} missing params"
            assert "expression" in tpl, f"{name} missing expression"
            assert isinstance(tpl["params"], list), f"{name} params not a list"

    def test_expected_templates_exist(self):
        expected = [
            "minValue", "maxValue", "between", "fieldEquals", "fieldNotEquals",
            "isEmpty", "isNotEmpty", "fieldsEqual", "fieldGreaterThan",
            "fieldLessThan", "matches", "minLength", "maxLength",
            "includes", "notIncludes",
        ]
        for name in expected:
            assert name in RULE_TEMPLATES, f"Missing template: {name}"


class TestResolveTemplate:
    def test_minValue(self):
        result = resolve_template("minValue", {"fieldId": "age", "minValue": 18})
        assert "value('age')" in result
        assert "18" in result

    def test_maxValue(self):
        result = resolve_template("maxValue", {"fieldId": "age", "maxValue": 100})
        assert "value('age') > 100" in result

    def test_between(self):
        result = resolve_template("between", {"fieldId": "age", "min": 0, "max": 150})
        assert "value('age') < 0" in result
        assert "value('age') > 150" in result

    def test_fieldEquals(self):
        result = resolve_template("fieldEquals", {"fieldId": "country", "value": "AU"})
        assert result == "value('country') === 'AU'"

    def test_fieldNotEquals(self):
        result = resolve_template("fieldNotEquals", {"fieldId": "country", "value": "AU"})
        assert result == "value('country') !== 'AU'"

    def test_isEmpty(self):
        result = resolve_template("isEmpty", {"fieldId": "name"})
        assert result == "isEmpty(value('name'))"

    def test_isNotEmpty(self):
        result = resolve_template("isNotEmpty", {"fieldId": "name"})
        assert result == "!isEmpty(value('name'))"

    def test_fieldsEqual(self):
        result = resolve_template("fieldsEqual", {"fieldId1": "pw", "fieldId2": "pw_confirm"})
        assert result == "value('pw') === value('pw_confirm')"

    def test_registered_custom_template(self):
        from protoform import register_template, unregister_template
        register_template("checksumInvalid", ["fieldId"], "checksumFails(value('${fieldId}'))")
        try:
            result = resolve_template("checksumInvalid", {"fieldId": "code"})
            assert result == "checksumFails(value('code'))"
        finally:
            unregister_template("checksumInvalid")

    def test_unknown_template_raises(self):
        with pytest.raises(ValueError, match="Unknown template"):
            resolve_template("nonexistent", {})

    def test_missing_param_raises(self):
        with pytest.raises(ValueError, match="Missing parameter"):
            resolve_template("minValue", {"fieldId": "age"})  # missing minValue


class TestIsTemplateReference:
    def test_bare_template_name(self):
        assert is_template_reference("isEmpty") is True

    def test_template_call(self):
        assert is_template_reference("minValue(18)") is True

    def test_not_a_template(self):
        assert is_template_reference("value('x') > 5") is False

    def test_unknown_function_call(self):
        assert is_template_reference("notATemplate(1)") is False


class TestParseTemplateReference:
    def test_bare_name(self):
        tid, params = parse_template_reference("isEmpty")
        assert tid == "isEmpty"
        assert params == {}

    def test_with_numeric_arg(self):
        tid, params = parse_template_reference("minValue(18)")
        assert tid == "minValue"
        assert params["minValue"] == 18

    def test_with_string_arg(self):
        tid, params = parse_template_reference("fieldEquals('AU')")
        assert tid == "fieldEquals"
        assert params["value"] == "AU"

    def test_with_multiple_args(self):
        tid, params = parse_template_reference("between(0, 150)")
        assert tid == "between"
        assert params["min"] == 0
        assert params["max"] == 150

    def test_auto_infer_skips_fieldId(self):
        # When fewer args than params and first param is fieldId, it's skipped
        tid, params = parse_template_reference("minValue(18)")
        assert "fieldId" not in params
        assert params["minValue"] == 18

    def test_two_field_template(self):
        tid, params = parse_template_reference("fieldsEqual(password, confirmPassword)")
        assert tid == "fieldsEqual"
        assert params["fieldId1"] == "password"
        assert params["fieldId2"] == "confirmPassword"

    def test_invalid_syntax_raises(self):
        with pytest.raises(ValueError, match="Invalid template reference"):
            parse_template_reference("not a template at all")

    def test_unknown_template_raises(self):
        with pytest.raises(ValueError, match="Unknown template"):
            parse_template_reference("fakeTemplate(1)")

    def test_float_arg(self):
        tid, params = parse_template_reference("minValue(3.14)")
        assert params["minValue"] == 3.14


class TestResolveExpressionString:
    def test_non_template_passthrough(self):
        result = resolve_expression_string("value('x') > 5", {"id": "r1", "affects": []})
        assert result == "value('x') > 5"

    def test_template_with_inferred_fieldId(self):
        rule = {"id": "r1", "affects": [{"target": "age"}]}
        result = resolve_expression_string("minValue(18)", rule)
        assert "value('age')" in result

    def test_template_without_affects_raises(self):
        rule = {"id": "r1", "affects": []}
        with pytest.raises(ValueError, match="requires fieldId"):
            resolve_expression_string("isEmpty", rule)


class TestResolveRuleTemplates:
    def test_resolves_string_when(self):
        rules = [
            {
                "id": "r1",
                "when": "minValue(18)",
                "affects": [{"target": "age", "valid": False}],
            }
        ]
        resolved = resolve_rule_templates(rules)
        assert isinstance(resolved[0]["when"], dict)
        assert "expressions" in resolved[0]["when"]

    def test_resolves_dict_when(self):
        rules = [
            {
                "id": "r1",
                "when": {"type": "and", "expressions": ["minValue(18)"]},
                "affects": [{"target": "age", "valid": False}],
            }
        ]
        resolved = resolve_rule_templates(rules)
        # The inner expression should be resolved
        inner = resolved[0]["when"]["expressions"]
        assert isinstance(inner, list)
        assert "value('age')" in inner[0]

    def test_preserves_non_template_expression(self):
        rules = [
            {
                "id": "r1",
                "when": "value('x') > 5",
                "affects": [{"target": "x"}],
            }
        ]
        resolved = resolve_rule_templates(rules)
        expr = resolved[0]["when"]["expressions"]
        assert expr == "value('x') > 5"

    def test_preserves_rule_fields(self):
        rules = [
            {
                "id": "r1",
                "when": "true",
                "affects": [{"target": "x"}],
                "required_parent": ["r0"],
            }
        ]
        resolved = resolve_rule_templates(rules)
        assert resolved[0]["id"] == "r1"
        assert resolved[0]["required_parent"] == ["r0"]
        assert resolved[0]["affects"] == [{"target": "x"}]
