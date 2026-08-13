"""Comprehensive tests for the ProtoForm rule engine."""

import pytest
from protoform.engine import (
    prepare_form,
    evaluate_rules,
    can_progress,
    collect_field_errors,
    validate_step,
    build_container_descendants,
    build_field_to_container,
    is_container_complete,
    _is_empty,
    _is_container,
)


# ---------------------------------------------------------------------------
# Test schemas
# ---------------------------------------------------------------------------

SIMPLE_SCHEMA = {
    "fields": [
        {"id": "name", "meta": {"type": "text", "label": "Name", "required": True}},
        {"id": "email", "meta": {"type": "email", "label": "Email", "required": True}},
    ],
    "layout": [
        {
            "id": "main",
            "meta": {"title": "Main"},
            "children": [
                {"id": "name", "meta": {"type": "text", "label": "Name", "required": True}},
                {"id": "email", "meta": {"type": "email", "label": "Email", "required": True}},
            ],
        }
    ],
    "rules": [],
}

MULTI_STEP_SCHEMA = {
    "fields": [
        {"id": "name", "meta": {"type": "text", "label": "Name", "required": True}},
        {"id": "age", "meta": {"type": "number", "label": "Age", "required": True}},
        {"id": "email", "meta": {"type": "email", "label": "Email", "required": True}},
    ],
    "layout": [
        {
            "id": "step1",
            "meta": {"title": "Personal"},
            "children": [
                {"id": "name", "meta": {"type": "text", "label": "Name", "required": True}},
                {"id": "age", "meta": {"type": "number", "label": "Age", "required": True}},
            ],
        },
        {
            "id": "step2",
            "meta": {"title": "Contact"},
            "children": [
                {"id": "email", "meta": {"type": "email", "label": "Email", "required": True}},
            ],
        },
    ],
    "rules": [
        {
            "id": "age_min",
            "when": "value('age') < 18 && value('age') !== null && value('age') !== ''",
            "affects": [{"target": "age", "valid": False, "blocking": True, "message": "Must be 18+", "type": "error"}],
        },
    ],
}

NESTED_CONTAINER_SCHEMA = {
    "fields": [
        {"id": "f1", "meta": {"type": "text", "label": "F1"}},
        {"id": "f2", "meta": {"type": "text", "label": "F2"}},
        {"id": "f3", "meta": {"type": "text", "label": "F3"}},
    ],
    "layout": [
        {
            "id": "outer",
            "meta": {"title": "Outer", "type": "section"},
            "children": [
                {"id": "f1", "meta": {"type": "text", "label": "F1"}},
                {
                    "id": "inner",
                    "meta": {"title": "Inner", "type": "card"},
                    "children": [
                        {"id": "f2", "meta": {"type": "text", "label": "F2"}},
                        {"id": "f3", "meta": {"type": "text", "label": "F3"}},
                    ],
                },
            ],
        }
    ],
    "rules": [],
}

VISIBILITY_SCHEMA = {
    "fields": [
        {"id": "toggle", "meta": {"type": "checkbox", "label": "Show extra"}},
        {"id": "extra", "meta": {"type": "text", "label": "Extra", "required": True}},
        {"id": "disabled_field", "meta": {"type": "text", "label": "Disabled", "disabled": True}},
    ],
    "layout": [
        {
            "id": "main",
            "meta": {"title": "Main"},
            "children": [
                {"id": "toggle", "meta": {"type": "checkbox", "label": "Show extra"}},
                {"id": "extra", "meta": {"type": "text", "label": "Extra", "required": True}},
                {"id": "disabled_field", "meta": {"type": "text", "label": "Disabled", "disabled": True}},
            ],
        }
    ],
    "rules": [
        {
            "id": "show_extra",
            "when": "value('toggle') === true",
            "affects": [{"target": "extra", "visible": True}],
        },
        {
            "id": "hide_extra",
            "when": "value('toggle') !== true",
            "affects": [{"target": "extra", "visible": False}],
        },
    ],
}

BLOCKING_SCHEMA = {
    "fields": [
        {"id": "code", "meta": {"type": "text", "label": "Code", "required": True}},
    ],
    "layout": [
        {
            "id": "main",
            "meta": {"title": "Main"},
            "children": [
                {"id": "code", "meta": {"type": "text", "label": "Code", "required": True}},
            ],
        }
    ],
    "rules": [
        {
            "id": "code_format",
            "when": "value('code') !== null && value('code') !== '' && value('code').length < 6",
            "affects": [
                {"target": "code", "valid": False, "blocking": True, "message": "Min 6 chars", "type": "error"},
            ],
        },
    ],
}

CHAINED_RULES_SCHEMA = {
    "fields": [
        {"id": "type", "meta": {"type": "select", "label": "Type"}},
        {"id": "detail", "meta": {"type": "text", "label": "Detail"}},
        {"id": "sub_detail", "meta": {"type": "text", "label": "Sub Detail"}},
    ],
    "layout": [
        {
            "id": "main",
            "meta": {"title": "Main"},
            "children": [
                {"id": "type", "meta": {"type": "select", "label": "Type"}},
                {"id": "detail", "meta": {"type": "text", "label": "Detail"}},
                {"id": "sub_detail", "meta": {"type": "text", "label": "Sub Detail"}},
            ],
        }
    ],
    "rules": [
        {
            "id": "show_detail",
            "when": "value('type') === 'advanced'",
            "affects": [{"target": "detail", "visible": True, "required": True}],
        },
        {
            "id": "hide_detail",
            "when": "value('type') !== 'advanced'",
            "affects": [{"target": "detail", "visible": False}],
        },
        {
            "id": "show_sub_detail",
            "when": "value('detail') !== null && value('detail') !== ''",
            "required_parent": ["show_detail"],
            "affects": [{"target": "sub_detail", "visible": True, "required": True}],
        },
    ],
}

MESSAGE_SCHEMA = {
    "fields": [
        {"id": "pw", "meta": {"type": "password", "label": "Password"}},
    ],
    "layout": [
        {
            "id": "main",
            "meta": {"title": "Main"},
            "children": [
                {"id": "pw", "meta": {"type": "password", "label": "Password"}},
            ],
        }
    ],
    "rules": [
        {
            "id": "pw_short",
            "when": "value('pw') !== null && value('pw') !== '' && value('pw').length < 8",
            "affects": [
                {"target": "pw", "valid": False, "message": "Too short", "type": "error"},
            ],
        },
        {
            "id": "pw_hint",
            "when": "value('pw') === null || value('pw') === ''",
            "affects": [
                {"target": "pw", "message": "Use 8+ characters", "type": "info"},
            ],
        },
    ],
}


# ---------------------------------------------------------------------------
# _is_empty
# ---------------------------------------------------------------------------

class TestIsEmpty:
    def test_none(self):
        assert _is_empty(None) is True

    def test_empty_string(self):
        assert _is_empty("") is True

    def test_empty_list(self):
        assert _is_empty([]) is True

    def test_empty_dict(self):
        assert _is_empty({}) is True

    def test_non_empty_string(self):
        assert _is_empty("hello") is False

    def test_non_empty_list(self):
        assert _is_empty([1]) is False

    def test_zero(self):
        assert _is_empty(0) is False

    def test_false(self):
        assert _is_empty(False) is False


# ---------------------------------------------------------------------------
# _is_container
# ---------------------------------------------------------------------------

class TestIsContainer:
    def test_container_with_children(self):
        assert _is_container({"id": "c1", "children": [], "meta": {"title": "T"}}) is True

    def test_field_without_children(self):
        assert _is_container({"id": "f1", "meta": {"type": "text", "label": "F"}}) is False

    def test_container_with_type_in_meta(self):
        """Containers with meta.type should still be identified as containers."""
        assert _is_container({
            "id": "c1",
            "children": [],
            "meta": {"title": "T", "type": "section"},
        }) is True


# ---------------------------------------------------------------------------
# Layout utilities
# ---------------------------------------------------------------------------

class TestBuildContainerDescendants:
    def test_simple_flat(self):
        result = build_container_descendants(SIMPLE_SCHEMA["layout"])
        assert set(result["main"]) == {"name", "email"}

    def test_multi_step(self):
        result = build_container_descendants(MULTI_STEP_SCHEMA["layout"])
        assert set(result["step1"]) == {"name", "age"}
        assert set(result["step2"]) == {"email"}

    def test_nested_containers(self):
        result = build_container_descendants(NESTED_CONTAINER_SCHEMA["layout"])
        assert set(result["outer"]) == {"f1", "f2", "f3"}
        assert set(result["inner"]) == {"f2", "f3"}

    def test_empty_layout(self):
        result = build_container_descendants([])
        assert result == {}


class TestBuildFieldToContainer:
    def test_simple(self):
        result = build_field_to_container(SIMPLE_SCHEMA["layout"])
        assert result["name"] == "main"
        assert result["email"] == "main"

    def test_multi_step(self):
        result = build_field_to_container(MULTI_STEP_SCHEMA["layout"])
        assert result["name"] == "step1"
        assert result["email"] == "step2"

    def test_nested_maps_to_inner_container(self):
        result = build_field_to_container(NESTED_CONTAINER_SCHEMA["layout"])
        assert result["f1"] == "outer"
        assert result["f2"] == "inner"
        assert result["f3"] == "inner"


# ---------------------------------------------------------------------------
# prepare_form
# ---------------------------------------------------------------------------

class TestPrepareForm:
    def test_returns_all_keys(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        assert set(prepared.keys()) == {
            "form", "dependencies", "container_descendants", "field_to_container",
            "computed_order", "computed_exprs", "repeats", "repeat_fields",
            "container_repeats",
        }

    def test_resolves_templates(self):
        schema = {
            "fields": [{"id": "age", "meta": {"type": "number", "label": "Age"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "age", "meta": {"type": "number", "label": "Age"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "minValue(18)", "affects": [{"target": "age", "valid": False}]},
            ],
        }
        prepared = prepare_form(schema)
        # The when should be resolved to an expression dict
        rule = prepared["form"]["rules"][0]
        assert isinstance(rule["when"], dict)

    def test_builds_dependencies(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        deps = prepared["dependencies"]
        assert "rule_to_fields" in deps
        assert "field_to_rules" in deps
        assert "age" in deps["rule_to_fields"]["age_min"]

    def test_empty_schema(self):
        schema = {"fields": [], "layout": [], "rules": []}
        prepared = prepare_form(schema)
        assert prepared["container_descendants"] == {}
        assert prepared["field_to_container"] == {}


# ---------------------------------------------------------------------------
# evaluate_rules
# ---------------------------------------------------------------------------

class TestEvaluateRules:
    def test_base_state_all_visible(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {})
        derived = result["derived"]
        assert "name" in derived["visible"]
        assert "email" in derived["visible"]
        assert "main" in derived["visible"]

    def test_base_state_required_from_meta(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {})
        derived = result["derived"]
        assert "name" in derived["required"]
        assert "email" in derived["required"]

    def test_base_state_disabled_from_meta(self):
        prepared = prepare_form(VISIBILITY_SCHEMA)
        result = evaluate_rules(prepared, {})
        assert "disabled_field" in result["derived"]["disabled"]

    def test_base_state_all_valid(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {})
        assert "name" in result["derived"]["valid"]
        assert "email" in result["derived"]["valid"]

    def test_visibility_toggle_hide(self):
        prepared = prepare_form(VISIBILITY_SCHEMA)
        result = evaluate_rules(prepared, {"toggle": False})
        assert "extra" not in result["derived"]["visible"]

    def test_visibility_toggle_show(self):
        prepared = prepare_form(VISIBILITY_SCHEMA)
        result = evaluate_rules(prepared, {"toggle": True})
        assert "extra" in result["derived"]["visible"]

    def test_rule_sets_invalid(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {"age": 15})
        assert "age" not in result["derived"]["valid"]

    def test_rule_sets_blocking(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {"age": 15})
        assert "age" in result["derived"]["blocking_targets"]

    def test_messages_accumulate(self):
        prepared = prepare_form(MESSAGE_SCHEMA)
        result = evaluate_rules(prepared, {"pw": "ab"})
        msgs = result["derived"]["messages"]["pw"]
        assert len(msgs) == 1
        assert msgs[0]["type"] == "error"
        assert msgs[0]["message"] == "Too short"

    def test_info_messages(self):
        prepared = prepare_form(MESSAGE_SCHEMA)
        result = evaluate_rules(prepared, {})
        msgs = result["derived"]["messages"]["pw"]
        assert len(msgs) == 1
        assert msgs[0]["type"] == "info"

    def test_required_parent_gates_child(self):
        prepared = prepare_form(CHAINED_RULES_SCHEMA)
        # type is not "advanced", so show_detail is false, so show_sub_detail should be skipped
        result = evaluate_rules(prepared, {"type": "basic", "detail": "stuff"})
        assert "sub_detail" not in result["derived"]["required"]

    def test_required_parent_allows_child(self):
        prepared = prepare_form(CHAINED_RULES_SCHEMA)
        result = evaluate_rules(prepared, {"type": "advanced", "detail": "stuff"})
        assert "sub_detail" in result["derived"]["required"]

    def test_container_completeness_complete(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {"name": "Alex", "email": "a@b.com"})
        assert "main" in result["progress"]["complete_containers"]

    def test_container_completeness_incomplete(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {"name": "Alex"})
        assert "main" not in result["progress"]["complete_containers"]

    def test_hidden_field_doesnt_block_completeness(self):
        prepared = prepare_form(VISIBILITY_SCHEMA)
        result = evaluate_rules(prepared, {"toggle": False})
        # "extra" is required but hidden, so it shouldn't block completeness
        assert "main" in result["progress"]["complete_containers"]

    def test_disabled_field_doesnt_block_completeness(self):
        prepared = prepare_form(VISIBILITY_SCHEMA)
        result = evaluate_rules(prepared, {"toggle": False})
        # "disabled_field" is disabled, so it shouldn't block completeness
        assert "main" in result["progress"]["complete_containers"]

    def test_env_context(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "env('mode') === 'admin'",
                 "affects": [{"target": "x", "visible": False}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {}, env={"mode": "admin"})
        assert "x" not in result["derived"]["visible"]

    def test_current_container_passed_through(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {}, current_container="step1")
        assert result["progress"]["current_container"] == "step1"

    def test_current_container_defaults_to_none(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {})
        assert result["progress"]["current_container"] is None

    def test_read_only_affect(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "true",
                 "affects": [{"target": "x", "read_only": True}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {})
        assert "x" in result["derived"]["read_only"]

    def test_disable_affect(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "true",
                 "affects": [{"target": "x", "disabled": True}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {})
        assert "x" in result["derived"]["disabled"]

    def test_require_affect(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "true",
                 "affects": [{"target": "x", "required": True}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {})
        assert "x" in result["derived"]["required"]

    def test_later_rules_override_earlier(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "true", "affects": [{"target": "x", "visible": False}]},
                {"id": "r2", "when": "true", "affects": [{"target": "x", "visible": True}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {})
        assert "x" in result["derived"]["visible"]

    def test_invalid_expression_treated_as_false(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "THIS IS NOT VALID ===", "affects": [{"target": "x", "visible": False}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {})
        # Invalid expression should be treated as false, so x stays visible
        assert "x" in result["derived"]["visible"]


# ---------------------------------------------------------------------------
# can_progress
# ---------------------------------------------------------------------------

class TestCanProgress:
    def test_no_blocking_targets(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {})
        assert can_progress(result["derived"], {}) is True

    def test_blocking_target_invalid(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {"age": 10})
        assert can_progress(result["derived"], {"age": 10}) is False

    def test_blocking_target_valid(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {"age": 25})
        assert can_progress(result["derived"], {"age": 25}) is True

    def test_blocking_target_empty_value(self):
        """A blocking target with an empty value should block progress."""
        prepared = prepare_form(BLOCKING_SCHEMA)
        result = evaluate_rules(prepared, {"code": "abc"})
        # code is blocking (short code triggers the rule)
        assert "code" in result["derived"]["blocking_targets"]
        # Now test with empty value — the target is still in blocking_targets
        assert can_progress(result["derived"], {"code": ""}) is False

    def test_blocking_not_triggered_when_rule_doesnt_fire(self):
        prepared = prepare_form(BLOCKING_SCHEMA)
        result = evaluate_rules(prepared, {})
        # Rule doesn't fire for empty code, so blocking_targets is empty
        assert can_progress(result["derived"], {}) is True

    def test_hidden_blocking_target_ignored(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "true", "affects": [{"target": "x", "visible": False}]},
                {"id": "r2", "when": "true", "affects": [{"target": "x", "blocking": True, "valid": False}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {})
        # x is hidden, so even though it's blocking and invalid, canProgress should be True
        assert can_progress(result["derived"], {}) is True

    def test_disabled_blocking_target_ignored(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "true", "affects": [{"target": "x", "disabled": True}]},
                {"id": "r2", "when": "true", "affects": [{"target": "x", "blocking": True, "valid": False}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {})
        assert can_progress(result["derived"], {}) is True

    def test_blocking_target_empty_list(self):
        """Empty list should count as empty for blocking targets."""
        prepared = prepare_form(BLOCKING_SCHEMA)
        result = evaluate_rules(prepared, {"code": "validcode"})
        # Manually add blocking target to test the empty list case
        result["derived"]["blocking_targets"].add("code")
        assert can_progress(result["derived"], {"code": []}) is False

    def test_blocking_target_empty_dict(self):
        """Empty dict should count as empty for blocking targets."""
        prepared = prepare_form(BLOCKING_SCHEMA)
        result = evaluate_rules(prepared, {"code": "validcode"})
        result["derived"]["blocking_targets"].add("code")
        assert can_progress(result["derived"], {"code": {}}) is False


# ---------------------------------------------------------------------------
# collect_field_errors
# ---------------------------------------------------------------------------

class TestCollectFieldErrors:
    def test_no_errors_when_valid(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {"name": "Alex", "email": "a@b.com"})
        errors = collect_field_errors(prepared["form"], result["derived"], {"name": "Alex", "email": "a@b.com"})
        assert errors == {}

    def test_required_empty_error(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {})
        errors = collect_field_errors(prepared["form"], result["derived"], {})
        assert "name" in errors
        assert "This field is required." in errors["name"]

    def test_rule_error_message(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {"age": 10})
        errors = collect_field_errors(prepared["form"], result["derived"], {"age": 10})
        assert "age" in errors
        assert "Must be 18+" in errors["age"]

    def test_invalid_without_message_gets_default(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "true", "affects": [{"target": "x", "valid": False}]},
            ],
        }
        prepared = prepare_form(schema)
        result = evaluate_rules(prepared, {})
        errors = collect_field_errors(prepared["form"], result["derived"], {})
        assert "This field is invalid." in errors["x"]

    def test_hidden_fields_excluded(self):
        prepared = prepare_form(VISIBILITY_SCHEMA)
        result = evaluate_rules(prepared, {"toggle": False})
        errors = collect_field_errors(prepared["form"], result["derived"], {})
        assert "extra" not in errors

    def test_disabled_fields_excluded(self):
        prepared = prepare_form(VISIBILITY_SCHEMA)
        result = evaluate_rules(prepared, {})
        errors = collect_field_errors(prepared["form"], result["derived"], {})
        assert "disabled_field" not in errors

    def test_only_fields_filter(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {})
        errors = collect_field_errors(
            prepared["form"], result["derived"], {},
            only_fields={"email"},
        )
        assert "email" in errors
        assert "name" not in errors
        assert "age" not in errors

    def test_required_empty_list(self):
        """Empty list should trigger required error."""
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {"name": []})
        errors = collect_field_errors(prepared["form"], result["derived"], {"name": []})
        assert "name" in errors
        assert "This field is required." in errors["name"]

    def test_required_empty_dict(self):
        """Empty dict should trigger required error."""
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {"name": {}})
        errors = collect_field_errors(prepared["form"], result["derived"], {"name": {}})
        assert "name" in errors
        assert "This field is required." in errors["name"]


# ---------------------------------------------------------------------------
# validate_step
# ---------------------------------------------------------------------------

class TestValidateStep:
    def test_valid_step(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = validate_step(prepared, {"name": "Alex", "age": 25}, "step1")
        assert result["valid"] is True
        assert result["errors"] == {}
        assert set(result["step_values"].keys()) == {"name", "age"}

    def test_invalid_step(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = validate_step(prepared, {"name": "Alex", "age": 10}, "step1")
        assert result["valid"] is False
        assert "age" in result["errors"]

    def test_step_only_checks_own_fields(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = validate_step(prepared, {"name": "Alex", "age": 25}, "step1")
        # Step1 shouldn't report errors for step2's email field
        assert "email" not in result["errors"]

    def test_step_values_only_contains_step_fields(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = validate_step(
            prepared,
            {"name": "Alex", "age": 25, "email": "a@b.com"},
            "step1",
        )
        assert "email" not in result["step_values"]

    def test_missing_required_in_step(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = validate_step(prepared, {}, "step1")
        assert result["valid"] is False
        assert "name" in result["errors"]
        assert "age" in result["errors"]

    def test_with_env(self):
        schema = {
            "fields": [{"id": "x", "meta": {"type": "text", "label": "X"}}],
            "layout": [{"id": "s1", "meta": {"title": "S"}, "children": [
                {"id": "x", "meta": {"type": "text", "label": "X"}},
            ]}],
            "rules": [
                {"id": "r1", "when": "env('strict') === true",
                 "affects": [{"target": "x", "required": True}]},
            ],
        }
        prepared = prepare_form(schema)
        result = validate_step(prepared, {}, "s1", env={"strict": True})
        assert result["valid"] is False
        assert "x" in result["errors"]


# ---------------------------------------------------------------------------
# is_container_complete
# ---------------------------------------------------------------------------

class TestIsContainerComplete:
    def test_complete_when_all_required_filled(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {"name": "A", "email": "b"})
        assert is_container_complete(
            "main", prepared["container_descendants"]["main"],
            {"name": "A", "email": "b"}, result["derived"],
        ) is True

    def test_incomplete_when_required_missing(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {})
        assert is_container_complete(
            "main", prepared["container_descendants"]["main"],
            {}, result["derived"],
        ) is False

    def test_hidden_container_always_complete(self):
        prepared = prepare_form(SIMPLE_SCHEMA)
        result = evaluate_rules(prepared, {})
        result["derived"]["visible"].discard("main")
        assert is_container_complete(
            "main", prepared["container_descendants"]["main"],
            {}, result["derived"],
        ) is True

    def test_invalid_field_blocks_completeness(self):
        prepared = prepare_form(MULTI_STEP_SCHEMA)
        result = evaluate_rules(prepared, {"name": "A", "age": 10})
        assert is_container_complete(
            "step1", prepared["container_descendants"]["step1"],
            {"name": "A", "age": 10}, result["derived"],
        ) is False


# ---------------------------------------------------------------------------
# Nested container with meta.type (regression test for discrimination fix)
# ---------------------------------------------------------------------------

class TestNestedContainerWithMetaType:
    """Ensure containers with meta.type are not misidentified as fields."""

    def test_nested_container_descendants(self):
        prepared = prepare_form(NESTED_CONTAINER_SCHEMA)
        # outer should have all 3 fields
        assert set(prepared["container_descendants"]["outer"]) == {"f1", "f2", "f3"}
        # inner should have f2, f3
        assert set(prepared["container_descendants"]["inner"]) == {"f2", "f3"}

    def test_nested_field_to_container(self):
        prepared = prepare_form(NESTED_CONTAINER_SCHEMA)
        assert prepared["field_to_container"]["f1"] == "outer"
        assert prepared["field_to_container"]["f2"] == "inner"
        assert prepared["field_to_container"]["f3"] == "inner"

    def test_nested_containers_visible(self):
        prepared = prepare_form(NESTED_CONTAINER_SCHEMA)
        result = evaluate_rules(prepared, {})
        assert "outer" in result["derived"]["visible"]
        assert "inner" in result["derived"]["visible"]


# ---------------------------------------------------------------------------
# Custom expression functions + templates (registration)
# ---------------------------------------------------------------------------

class TestCustomFunctions:
    def setup_method(self):
        from protoform import register_function, register_template
        # A toy checksum: valid when the digit sum is divisible by 7
        register_function(
            "checksumFails",
            lambda v: bool(v) and sum(int(c) for c in str(v) if c.isdigit()) % 7 != 0,
        )
        register_template("checksumInvalid", ["fieldId"], "checksumFails(value('${fieldId}'))")

    def teardown_method(self):
        from protoform import unregister_function, unregister_template
        unregister_function("checksumFails")
        unregister_template("checksumInvalid")

    def _schema(self):
        return {
            "fields": [{"id": "code", "meta": {"type": "text", "label": "Code"}}],
            "layout": [{"id": "main", "meta": {"title": "M"}, "children": [{"id": "code"}]}],
            "rules": [
                {"id": "r1", "when": "checksumInvalid",
                 "affects": [{"target": "code", "valid": False, "message": "Invalid code", "type": "error"}]},
            ],
        }

    def test_valid_checksum(self):
        prepared = prepare_form(self._schema())
        result = evaluate_rules(prepared, {"code": "7000"})  # digit sum 7
        assert "code" in result["derived"]["valid"]

    def test_invalid_checksum(self):
        prepared = prepare_form(self._schema())
        result = evaluate_rules(prepared, {"code": "1234"})  # digit sum 10
        assert "code" not in result["derived"]["valid"]

    def test_empty_value_not_flagged(self):
        prepared = prepare_form(self._schema())
        result = evaluate_rules(prepared, {})
        assert "code" in result["derived"]["valid"]

    def test_unregistered_function_fails_closed(self):
        from protoform import evaluate_expression
        assert evaluate_expression("noSuchFunction(value('x'))", {"x": 1}) is False
