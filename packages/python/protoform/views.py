"""
Optional DRF views for ProtoForm.

Requires djangorestframework to be installed.
"""

from __future__ import annotations

from typing import Any

from .engine import (
    prepare_form,
    evaluate_rules,
    can_progress,
    collect_field_errors,
    validate_step,
)
from .mapping import group_values_by_resource

try:
    from rest_framework.views import APIView
    from rest_framework.response import Response
    from rest_framework import status
except ImportError:
    raise ImportError(
        "protoform-engine views require djangorestframework. "
        "Install it with: pip install protoform-engine[drf]"
    )


PROBLEM_TYPE_VALIDATION = "urn:protoform:validation"


def validation_problem(errors: dict) -> Response:
    """RFC 9457 problem+json response carrying the field error map as the
    conventional `errors` extension member (spec §10)."""
    return Response(
        {
            "type": PROBLEM_TYPE_VALIDATION,
            "title": "Validation failed",
            "status": 400,
            "errors": errors,
        },
        status=status.HTTP_400_BAD_REQUEST,
        content_type="application/problem+json",
    )


class ProtoFormView(APIView):
    """
    Base view for serving and validating ProtoForm schemas.

    Handles three HTTP methods:

        GET   — Return the form schema as JSON.
        PATCH — Validate a single step and call save_step().
        POST  — Validate the entire form and call save().

    Subclass and override:
        - schema: The form schema dict
        - mapping: Optional field-to-resource mapping
        - save(): Called with grouped values on valid final submission
        - save_step(): Called with step values on valid step completion
    """

    schema: dict | None = None
    mapping: dict | None = None

    def get_schema(self) -> dict:
        if self.schema is None:
            raise NotImplementedError("Set 'schema' or override get_schema()")
        return self.schema

    def get_mapping(self) -> dict | None:
        return self.mapping

    def get_env(self, request: Any) -> dict | None:
        """Override to provide environment context for expression evaluation."""
        return None

    def get(self, request: Any) -> Response:
        """Return the form schema as JSON."""
        return Response(self.get_schema())

    def patch(self, request: Any) -> Response:
        """
        Validate a single step and call save_step() if valid.

        Expected request body:
            {"step": "container_id", "values": {field_id: value, ...}}

        The values dict should contain ALL accumulated values (not just this
        step's), since rules may reference fields from other steps. The engine
        validates only the fields belonging to the specified step.
        """
        schema = self.get_schema()
        step_id = request.data.get("step")
        values = request.data.get("values", {})

        if not step_id:
            return validation_problem({"__all__": ["Missing 'step' in request body."]})

        prepared = prepare_form(schema)

        if step_id not in prepared["container_descendants"]:
            return validation_problem({"__all__": [f"Unknown step: {step_id}"]})

        env = self.get_env(request)
        result = validate_step(prepared, values, step_id, env)

        errors = result["errors"]
        self.validate(values, errors, step_id=step_id)

        if errors:
            return validation_problem(errors)

        # Group step values by resource if mapping provided
        mapping = self.get_mapping()
        if mapping:
            step_mapping = {k: v for k, v in mapping.items() if k in result["step_values"]}
            grouped = group_values_by_resource(result["step_values"], step_mapping)
        else:
            grouped = {"__default__": result["step_values"]}

        self.save_step(step_id, grouped, request)

        return Response({
            "status": "ok",
            "step": step_id,
            "values": self.response_values(result["step_values"], prepared, step_id=step_id),
        })

    def post(self, request: Any) -> Response:
        """Validate submitted values and call save() if valid."""
        schema = self.get_schema()
        values = request.data

        prepared = prepare_form(schema)
        env = self.get_env(request)
        result = evaluate_rules(prepared, values, env)
        derived = result["derived"]
        form = prepared["form"]
        # Values augmented with computed field results
        working_values = result["values"]

        errors = collect_field_errors(form, derived, working_values)

        if not can_progress(derived, working_values):
            if not errors:
                errors["__all__"] = ["Form cannot be submitted in its current state."]

        self.validate(working_values, errors, step_id=None)

        if errors:
            return validation_problem(errors)

        # Group values by resource if mapping provided
        mapping = self.get_mapping()
        if mapping:
            grouped = group_values_by_resource(working_values, mapping)
        else:
            grouped = {"__default__": working_values}

        self.save(grouped, request)

        return Response({
            "status": "ok",
            "values": self.response_values(working_values, prepared, step_id=None),
        })

    def response_values(
        self,
        values: dict,
        prepared: dict,
        *,
        step_id: str | None = None,
    ) -> dict:
        """Values returned to the client on success (spec §10). Defaults to
        the computed fields, which are server-authoritative. Override to add
        asynchronous results the client should merge."""
        return {
            fid: values[fid]
            for fid in prepared.get("computed_order", [])
            if fid in values
        }

    def validate(
        self,
        values: dict,
        errors: dict[str, list[str]],
        *,
        step_id: str | None = None,
    ) -> None:
        """
        Override to add custom server-side validation errors.

        Called after rule engine validation in both patch() and post().
        Mutate the errors dict in place to add errors:

            errors.setdefault("email", []).append("This email is already taken.")

        Args:
            values: The submitted form values.
            errors: Mutable dict of field_id to error messages. May already
                contain errors from rule engine validation.
            step_id: The step being validated (patch), or None (post).
        """
        pass

    def save(self, grouped_values: dict, request: Any) -> None:
        """
        Override to persist form data on final submission.

        Args:
            grouped_values: Values grouped by resource (if mapping provided)
                or {'__default__': all_values} if no mapping.
            request: The DRF request object.
        """
        raise NotImplementedError("Override save() to persist form data")

    def save_step(self, step_id: str, grouped_values: dict, request: Any) -> None:
        """
        Override to persist partial form data when a step completes.

        Args:
            step_id: The container ID of the completed step.
            grouped_values: This step's values grouped by resource
                (if mapping provided) or {'__default__': step_values}.
            request: The DRF request object.
        """
        pass  # no-op by default — partial saves are opt-in
