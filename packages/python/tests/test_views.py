"""Tests for the DRF views, including the validate() hook."""

import pytest
from unittest.mock import MagicMock, patch

# Mock DRF before importing views
import sys
from types import ModuleType

# Create mock DRF modules
rest_framework = ModuleType("rest_framework")
rest_framework_views = ModuleType("rest_framework.views")
rest_framework_response = ModuleType("rest_framework.response")
rest_framework_status = ModuleType("rest_framework.status")


class MockAPIView:
    pass


class MockResponse:
    def __init__(self, data=None, status=200, content_type=None):
        self.data = data
        self.status_code = status
        self.content_type = content_type


rest_framework_views.APIView = MockAPIView
rest_framework_response.Response = MockResponse
rest_framework_status.HTTP_400_BAD_REQUEST = 400
rest_framework.views = rest_framework_views
rest_framework.response = rest_framework_response
rest_framework.status = rest_framework_status

sys.modules["rest_framework"] = rest_framework
sys.modules["rest_framework.views"] = rest_framework_views
sys.modules["rest_framework.response"] = rest_framework_response
sys.modules["rest_framework.status"] = rest_framework_status

from protoform.views import ProtoFormView


# ---------------------------------------------------------------------------
# Test schema
# ---------------------------------------------------------------------------

TEST_SCHEMA = {
    "fields": [
        {"id": "name", "meta": {"type": "text", "label": "Name", "required": True}},
        {"id": "email", "meta": {"type": "email", "label": "Email", "required": True}},
        {"id": "age", "meta": {"type": "number", "label": "Age"}},
    ],
    "layout": [
        {
            "id": "step1",
            "meta": {"title": "Personal"},
            "children": [
                {"id": "name", "meta": {"type": "text", "label": "Name", "required": True}},
                {"id": "age", "meta": {"type": "number", "label": "Age"}},
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
            "affects": [
                {"target": "age", "valid": False, "blocking": True, "message": "Must be 18+", "type": "error"},
            ],
        },
    ],
}


def make_request(data=None, method="POST"):
    req = MagicMock()
    req.data = data or {}
    req.method = method
    return req


class TestView(ProtoFormView):
    schema = TEST_SCHEMA

    def save(self, grouped_values, request):
        self._saved = grouped_values


class TestViewWithValidate(ProtoFormView):
    schema = TEST_SCHEMA

    def validate(self, values, errors, *, step_id=None):
        email = values.get("email", "")
        if email == "taken@example.com":
            errors.setdefault("email", []).append("This email is already taken.")

    def save(self, grouped_values, request):
        self._saved = grouped_values


# ---------------------------------------------------------------------------
# GET
# ---------------------------------------------------------------------------

class TestGet:
    def test_returns_schema(self):
        view = TestView()
        response = view.get(make_request())
        assert response.data == TEST_SCHEMA

    def test_raises_without_schema(self):
        view = ProtoFormView()
        with pytest.raises(NotImplementedError):
            view.get(make_request())


# ---------------------------------------------------------------------------
# PATCH (step validation)
# ---------------------------------------------------------------------------

class TestPatch:
    def test_missing_step_returns_400(self):
        view = TestView()
        request = make_request({"values": {"name": "Alex"}})
        response = view.patch(request)
        assert response.status_code == 400
        assert "__all__" in response.data["errors"]

    def test_unknown_step_returns_400(self):
        view = TestView()
        request = make_request({"step": "nonexistent", "values": {}})
        response = view.patch(request)
        assert response.status_code == 400
        assert "Unknown step" in response.data["errors"]["__all__"][0]

    def test_valid_step(self):
        view = TestView()
        request = make_request({"step": "step1", "values": {"name": "Alex", "age": 25}})
        response = view.patch(request)
        assert response.data == {"status": "ok", "step": "step1", "values": {}}

    def test_invalid_step_returns_errors(self):
        view = TestView()
        request = make_request({"step": "step1", "values": {"age": 10}})
        response = view.patch(request)
        assert response.status_code == 400
        assert "age" in response.data["errors"]

    def test_missing_required_fields(self):
        view = TestView()
        request = make_request({"step": "step1", "values": {}})
        response = view.patch(request)
        assert response.status_code == 400
        assert "name" in response.data["errors"]

    def test_validate_hook_called(self):
        view = TestViewWithValidate()
        request = make_request({
            "step": "step2",
            "values": {"name": "Alex", "age": 25, "email": "taken@example.com"},
        })
        response = view.patch(request)
        assert response.status_code == 400
        assert "email" in response.data["errors"]
        assert "This email is already taken." in response.data["errors"]["email"]

    def test_validate_hook_not_called_on_rule_error(self):
        """validate() still runs even if rule engine has errors."""
        view = TestViewWithValidate()
        request = make_request({
            "step": "step1",
            "values": {"name": "", "age": 10, "email": "taken@example.com"},
        })
        response = view.patch(request)
        assert response.status_code == 400
        # Rule errors should be present
        assert "age" in response.data["errors"] or "name" in response.data["errors"]

    def test_save_step_called_on_success(self):
        view = TestView()
        view.save_step = MagicMock()
        request = make_request({"step": "step1", "values": {"name": "Alex", "age": 25}})
        view.patch(request)
        view.save_step.assert_called_once()
        call_args = view.save_step.call_args
        assert call_args[0][0] == "step1"  # step_id


# ---------------------------------------------------------------------------
# POST (full validation)
# ---------------------------------------------------------------------------

class TestPost:
    def test_valid_submission(self):
        view = TestView()
        request = make_request({"name": "Alex", "email": "a@b.com", "age": 25})
        response = view.post(request)
        assert response.data == {"status": "ok", "values": {}}

    def test_missing_required(self):
        view = TestView()
        request = make_request({})
        response = view.post(request)
        assert response.status_code == 400
        assert "name" in response.data["errors"]
        assert "email" in response.data["errors"]

    def test_validate_hook_adds_error(self):
        view = TestViewWithValidate()
        request = make_request({"name": "Alex", "email": "taken@example.com", "age": 25})
        response = view.post(request)
        assert response.status_code == 400
        assert "email" in response.data["errors"]
        assert "This email is already taken." in response.data["errors"]["email"]

    def test_validate_hook_passes_when_no_error(self):
        view = TestViewWithValidate()
        request = make_request({"name": "Alex", "email": "ok@example.com", "age": 25})
        response = view.post(request)
        assert response.data == {"status": "ok", "values": {}}

    def test_validate_hook_merges_with_rule_errors(self):
        """Both rule engine errors and validate() errors should appear."""
        view = TestViewWithValidate()
        request = make_request({"name": "", "email": "taken@example.com", "age": 10})
        response = view.post(request)
        assert response.status_code == 400
        errors = response.data["errors"]
        # Rule engine: age < 18 error
        assert "age" in errors
        # validate() hook: email taken error
        assert "email" in errors
        assert "This email is already taken." in errors["email"]

    def test_save_called_on_success(self):
        view = TestView()
        request = make_request({"name": "Alex", "email": "a@b.com"})
        response = view.post(request)
        assert response.data == {"status": "ok", "values": {}}
        assert "__default__" in view._saved

    def test_save_not_called_on_error(self):
        view = TestView()
        view._saved = None
        request = make_request({})
        view.post(request)
        assert view._saved is None

    def test_save_not_implemented_raises(self):
        view = ProtoFormView()
        view.schema = {
            "fields": [],
            "layout": [{"id": "m", "meta": {"title": "M"}, "children": []}],
            "rules": [],
        }
        request = make_request({})
        with pytest.raises(NotImplementedError):
            view.post(request)

    def test_blocking_target_fails(self):
        view = TestView()
        request = make_request({"name": "Alex", "email": "a@b.com", "age": 10})
        response = view.post(request)
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Mapping integration
# ---------------------------------------------------------------------------

class TestViewWithMapping(ProtoFormView):
    schema = TEST_SCHEMA
    mapping = {
        "name": "myapp.Person",
        "email": "myapp.Person",
        "age": ("myapp.Person", "user_age"),
    }

    def save(self, grouped_values, request):
        self._saved = grouped_values

    def save_step(self, step_id, grouped_values, request):
        self._step_saved = grouped_values


class TestMappingIntegration:
    def test_post_groups_by_resource(self):
        view = TestViewWithMapping()
        request = make_request({"name": "Alex", "email": "a@b.com", "age": 25})
        view.post(request)
        assert "myapp.Person" in view._saved
        assert view._saved["myapp.Person"]["name"] == "Alex"
        assert view._saved["myapp.Person"]["user_age"] == 25

    def test_patch_groups_step_values(self):
        view = TestViewWithMapping()
        request = make_request({"step": "step1", "values": {"name": "Alex", "age": 25}})
        view.patch(request)
        assert "myapp.Person" in view._step_saved


# ---------------------------------------------------------------------------
# validate() hook edge cases
# ---------------------------------------------------------------------------

class TestValidateHookEdgeCases:
    def test_validate_receives_step_id_on_patch(self):
        received = {}

        class View(ProtoFormView):
            schema = TEST_SCHEMA

            def validate(self, values, errors, *, step_id=None):
                received["step_id"] = step_id

            def save(self, grouped_values, request):
                pass

        view = View()
        request = make_request({"step": "step1", "values": {"name": "Alex", "age": 25}})
        view.patch(request)
        assert received["step_id"] == "step1"

    def test_validate_receives_none_step_id_on_post(self):
        received = {}

        class View(ProtoFormView):
            schema = TEST_SCHEMA

            def validate(self, values, errors, *, step_id=None):
                received["step_id"] = step_id

            def save(self, grouped_values, request):
                pass

        view = View()
        request = make_request({"name": "Alex", "email": "a@b.com"})
        view.post(request)
        assert received["step_id"] is None

    def test_validate_can_add_multiple_errors_per_field(self):
        class View(ProtoFormView):
            schema = TEST_SCHEMA

            def validate(self, values, errors, *, step_id=None):
                errors.setdefault("email", []).append("Error 1")
                errors.setdefault("email", []).append("Error 2")

            def save(self, grouped_values, request):
                pass

        view = View()
        request = make_request({"name": "Alex", "email": "a@b.com"})
        response = view.post(request)
        assert response.status_code == 400
        assert len(response.data["errors"]["email"]) == 2

    def test_validate_can_add_form_level_error(self):
        class View(ProtoFormView):
            schema = TEST_SCHEMA

            def validate(self, values, errors, *, step_id=None):
                errors.setdefault("__all__", []).append("Something went wrong.")

            def save(self, grouped_values, request):
                pass

        view = View()
        request = make_request({"name": "Alex", "email": "a@b.com"})
        response = view.post(request)
        assert response.status_code == 400
        assert "__all__" in response.data["errors"]

    def test_default_validate_is_noop(self):
        """The default validate() should not add any errors."""
        view = TestView()
        request = make_request({"name": "Alex", "email": "a@b.com"})
        response = view.post(request)
        assert response.data == {"status": "ok", "values": {}}

    def test_get_env(self):
        class View(ProtoFormView):
            schema = TEST_SCHEMA

            def get_env(self, request):
                return {"role": "admin"}

            def save(self, grouped_values, request):
                pass

        view = View()
        request = make_request({"name": "Alex", "email": "a@b.com"})
        response = view.post(request)
        assert response.data == {"status": "ok", "values": {}}
