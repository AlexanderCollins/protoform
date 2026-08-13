"""
Field-to-resource mapping for Django model persistence.
"""

from __future__ import annotations

from typing import Any


def group_values_by_resource(
    values: dict[str, Any],
    mapping: dict[str, str | tuple[str, str]],
) -> dict[str, dict[str, Any]]:
    """
    Group form values by their target Django resource (model).

    Args:
        values: Form field values, e.g. {'first_name': 'Alex', 'company_number': '123'}
        mapping: Field-to-resource mapping. Each key is a field_id, value is either:
            - 'app.Model' (field name matches field_id)
            - ('app.Model', 'model_field_name') (explicit model field name)

    Returns:
        Grouped values, e.g. {
            'myapp.Person': {'first_name': 'Alex'},
            'myapp.Company': {'registration_number': '123'}
        }
    """
    grouped: dict[str, dict[str, Any]] = {}

    for field_id, value in values.items():
        if field_id not in mapping:
            continue

        target = mapping[field_id]

        if isinstance(target, tuple):
            resource, model_field = target
        else:
            resource = target
            model_field = field_id

        if resource not in grouped:
            grouped[resource] = {}

        grouped[resource][model_field] = value

    return grouped


def resolve_resources(grouped: dict[str, dict[str, Any]]) -> dict[Any, dict[str, Any]]:
    """
    Resolve 'app.Model' strings to Django model classes via apps.get_model().

    Args:
        grouped: Output from group_values_by_resource()

    Returns:
        Same structure but with model class keys instead of strings.

    Raises:
        LookupError: If a model cannot be found.
    """
    from django.apps import apps

    resolved: dict[Any, dict[str, Any]] = {}
    for resource_str, fields in grouped.items():
        model = apps.get_model(resource_str)
        resolved[model] = fields
    return resolved
