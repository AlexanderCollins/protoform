# protoform-engine

Server-side ProtoForm rule engine. Python port of `@protoform/core` with
identical evaluation semantics.

The engine itself (`protoform.engine`, `expressions`, `templates`, `mapping`)
is **pure Python with zero dependencies**, usable from FastAPI, Flask,
Celery workers, or any Python service. Django and DRF are optional layers.

## Installation

```bash
pip install protoform-engine          # engine only, no framework required
pip install protoform-engine[django]  # + apps.get_model resolution for mapping
pip install protoform-engine[drf]     # + ProtoFormView (GET/PATCH/POST)
```

Requires Python 3.10+. The `django` extra requires Django 4.2+.

## Core API

```python
from protoform import prepare_form, evaluate_rules, can_progress, validate_step, collect_field_errors
```

### `prepare_form(schema: dict) -> dict`

One-time preprocessing. Resolves rule templates, builds dependency maps, precomputes layout data. Returns a prepared dict with keys `form`, `dependencies`, `container_descendants`, `field_to_container`.

### `evaluate_rules(prepared, values, env=None, current_container=None) -> dict`

Evaluate all rules and compute derived state.

- `prepared` -- output of `prepare_form()`
- `values` -- `dict` of field_id to current value
- `env` -- optional `dict` accessible via `env('key')` in expressions
- `current_container` -- optional container id for progress tracking

Returns `{"derived": {...}, "progress": {...}, "values": {...}}`. The `derived` dict contains sets `required`, `visible`, `disabled`, `read_only`, `valid`, `blocking_targets` and a `messages` dict. `values` is the input augmented with computed field results; pass it (not the raw input) to `collect_field_errors` and `can_progress`.

Repeat rows appear in derived state and errors as row-addressed keys
(`contacts[0].phone`); helpers `row_key`, `resolve_value_path`, and
`evaluate_value_expression` are exported. See spec sections 12 and 13 for
repeater and computed-field semantics.

### `can_progress(derived, values) -> bool`

Returns `False` if any visible, non-disabled blocking target is invalid or empty.

### `validate_step(prepared, values, step_id, env=None) -> dict`

Validate only the fields belonging to a specific step/container. Evaluates all rules (since rules may reference fields across steps) but collects errors only for fields within the given container.

Returns `{"valid": bool, "errors": dict, "step_values": dict}`.

### `collect_field_errors(form, derived, values, *, only_fields=None) -> dict`

Collect validation errors for visible, non-disabled fields. Pass `only_fields` as a set of field IDs to restrict which fields are checked (used by `validate_step`).

```python
prepared = prepare_form(schema)
result = evaluate_rules(prepared, values, env={"role": "admin"})
ok = can_progress(result["derived"], values)

# Per-step validation
step_result = validate_step(prepared, values, "personal_info")
if step_result["valid"]:
    print("Step OK, values:", step_result["step_values"])
```

## Persistence and resume

The package deliberately has no models. To support save-and-resume, store
the values dict, the current step id, and a pin to the schema version per
submission, in your own models. Resume by loading stored values back into
the client's `initialValues`; all derived state recomputes from values.
Asynchronous results (webhooks, callbacks) merge into the stored values as
ordinary fields, usually `hidden` status/result fields that rules react
to. `save_step` and `save` on `ProtoFormView` are the persistence hooks.

## Expression Parser

Safe recursive-descent parser. No `eval`/`exec`. Parses ProtoForm expressions into an AST, then evaluates.

| Construct | Example |
|---|---|
| Field lookup | `value('email')` |
| Bare field identifiers | `age >= 18` (equivalent to `value('age') >= 18`) |
| Environment | `env('role')` |
| Empty check | `isEmpty(value('x'))`, true for `None`, `""`, `[]`, `{}` |
| Comparisons | `=== !== > < >= <=` |
| Logic | `&& \|\| !` |
| Literals | `'string'`, `42`, `true`, `false`, `null`, `undefined`, `[]`, `['a', 'b']` |
| Regex literals | `/^[A-Z]/.test(value('code'))` (no flags) |
| Member access | `value('name').length` |
| Method calls | `.test()`, `.includes()` |
| Grouping | `(expr)` |

JS-like short-circuit semantics: `&&` returns the first falsy value, `||` the first truthy. String-vs-string ordering comparisons are lexicographic (as in JS), so ISO date-string rules like `value('end') >= value('start')` behave identically in both engines. Unknown characters raise at tokenize time, and any expression that fails to parse or evaluate is `False`.

```python
from protoform import evaluate_expression
evaluate_expression("value('age') >= 18", {"age": 21})  # True
```

## Templates

Same 15 built-in templates as the TS engine: `minValue`, `maxValue`, `between`, `fieldEquals`, `fieldNotEquals`, `isEmpty`, `isNotEmpty`, `fieldsEqual`, `fieldGreaterThan`, `fieldLessThan`, `matches`, `minLength`, `maxLength`, `includes`, `notIncludes`. Hosts add domain-specific validators with `register_function` / `register_template` (see spec §5). Remember to register the equivalent function in every engine that evaluates the schema.

### `resolve_template(template_id, params) -> str`

Substitute parameters into a template expression.

```python
from protoform import resolve_template
resolve_template("minValue", {"fieldId": "age", "minValue": 18})
# "value('age') < 18 && value('age') !== null && value('age') !== ''"
```

### `resolve_rule_templates(rules) -> list[dict]`

Resolve all template references in a list of rule dicts. Called automatically by `prepare_form()`.

## Mapping

```python
from protoform import group_values_by_resource, resolve_resources
```

### `group_values_by_resource(values, mapping) -> dict`

Group form values by target Django model.

Mapping config format:
- `{'field_id': 'app.Model'}` -- model field name matches field_id
- `{'field_id': ('app.Model', 'model_field')}` -- explicit model field name

```python
grouped = group_values_by_resource(
    {"first_name": "Alex", "company_number": "51824753556"},
    {"first_name": "myapp.Person", "company_number": ("myapp.Company", "registration_number")},
)
# {"myapp.Person": {"first_name": "Alex"}, "myapp.Company": {"registration_number": "51824753556"}}
```

### `resolve_resources(grouped) -> dict`

Resolve `'app.Model'` strings to model classes via `apps.get_model()`. Raises `LookupError` if not found.

## DRF View

Requires `pip install protoform-engine[drf]`.

```python
from protoform.views import ProtoFormView

class ProtoFormView(APIView):
    schema = None       # Form schema dict
    mapping = None      # Optional field-to-resource mapping
    def get_schema(self) -> dict: ...
    def get_mapping(self) -> dict | None: ...
    def get_env(self, request) -> dict | None: ...
    def save(self, grouped_values: dict, request) -> None: ...
    def save_step(self, step_id: str, grouped_values: dict, request) -> None: ...
```

### `validate()`

Override to add custom server-side validation errors that the rule engine cannot express. Runs after rule engine validation in both `patch()` and `post()`.

```python
def validate(self, values: dict, errors: dict[str, list[str]], *, step_id: str | None = None) -> None:
```

Mutate the `errors` dict in place. It may already contain errors from rule engine validation. `step_id` is the container being validated (for `patch()`) or `None` (for `post()`).

```python
class OnboardingFormView(ProtoFormView):
    schema = ONBOARDING_SCHEMA

    def validate(self, values, errors, *, step_id=None):
        # Uniqueness check
        if User.objects.filter(email=values.get("email")).exists():
            errors.setdefault("email", []).append("This email is already taken.")

        # External API verification
        code = values.get("company_number")
        if code and not registry_client.verify(code):
            errors.setdefault("company_number", []).append("Number could not be verified with the registry.")
```

Errors from `validate()` are merged with rule engine errors and returned as an RFC 9457 problem+json response whose `errors` member holds the field map (spec §10). Success responses include `values` (computed fields by default; override `response_values()` to add asynchronous results). The frontend can display them on the correct fields using `setExternalErrors()`.

**GET** returns schema JSON.

**PATCH** validates a single step for multi-step forms. Request body: `{"step": "container_id", "values": {...}}`. The `values` dict should contain all accumulated values (not just this step's), since rules may reference fields across steps. The engine validates only the fields belonging to the specified step. On success, groups the step's values by resource and calls `save_step()`. Returns `400` with `{"errors": {...}}` on validation failure.

**POST** validates the entire form. It returns `400` with `{"errors": {...}}` on failure, otherwise it groups values by resource and calls `save()`.

Without a mapping, both `save()` and `save_step()` receive `{"__default__": values}`. `save_step()` is a no-op by default. Override it to enable partial saves.

## Example

```python
# schema.py
CONTACT_SCHEMA = {
    "fields": [
        {"id": "name",  "meta": {"type": "text", "required": True}},
        {"id": "email", "meta": {"type": "email", "required": True}},
        {"id": "company", "meta": {"type": "text"}},
        {"id": "role",  "meta": {"type": "select"}},
    ],
    "rules": [{
        "id": "require_role_if_company",
        "when": "isNotEmpty",
        "affects": [{"target": "role", "required": True}],
    }],
    "layout": [{
        "id": "main",
        "children": [
            {"id": "name",  "meta": {"type": "text"}},
            {"id": "email", "meta": {"type": "email"}},
            {"id": "company", "meta": {"type": "text"}},
            {"id": "role",  "meta": {"type": "select"}},
        ],
    }],
}

CONTACT_MAPPING = {
    "name": "contacts.Contact",
    "email": "contacts.Contact",
    "company": ("contacts.Contact", "company_name"),
    "role": "contacts.Contact",
}

# views.py
from protoform.views import ProtoFormView
from .schema import CONTACT_SCHEMA, CONTACT_MAPPING

class ContactFormView(ProtoFormView):
    schema = CONTACT_SCHEMA
    mapping = CONTACT_MAPPING

    def get_env(self, request):
        return {"role": request.user.role} if request.user.is_authenticated else None

    def save(self, grouped_values, request):
        from contacts.models import Contact
        fields = grouped_values.get("contacts.Contact", {})
        Contact.objects.create(**fields, created_by=request.user)

# urls.py
from django.urls import path
from .views import ContactFormView

urlpatterns = [
    path("api/contact-form/", ContactFormView.as_view()),
]
```

### Multi-Step with Partial Saves

```python
class OnboardingFormView(ProtoFormView):
    schema = ONBOARDING_SCHEMA
    mapping = ONBOARDING_MAPPING

    def save_step(self, step_id, grouped_values, request):
        # Persist partial data however you want (session, cache, database)
        submission = Submission.objects.get_or_create(
            session_id=request.session.session_key,
        )[0]
        for resource, fields in grouped_values.items():
            submission.data.setdefault(resource, {}).update(fields)
        submission.completed_steps.append(step_id)
        submission.save()

    def save(self, grouped_values, request):
        # Final submission, all steps validated
        for resource, fields in grouped_values.items():
            # create/update your models
            ...
```

The frontend sends `PATCH {"step": "step_id", "values": {...}}` on each Next click, and `POST {...}` on final Submit. ProtoForm validates per-step or fully, and calls the appropriate hook.
```
