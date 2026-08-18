# ProtoForm

[![CI](https://github.com/AlexanderCollins/protoform/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexanderCollins/protoform/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/AlexanderCollins/protoform)](https://github.com/AlexanderCollins/protoform/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

ProtoForm describes a form as a JSON document. One schema renders in the
browser and is re-validated on the server by a second engine with the
same behavior. A conformance suite in CI verifies that the two engines
agree. The client engine is TypeScript with React bindings and the server
engine is dependency-free Python. MIT licensed.

**[Try the live demo](https://alexandercollins.github.io/protoform/)**: a
schema playground with an editable JSON document, switchable UI adapters,
and a multi-step wizard, running entirely in your browser.

```json
{
  "fields": [
    { "id": "name", "meta": { "type": "text", "label": "Full name", "required": true } },
    { "id": "type", "meta": { "type": "select", "label": "Account type",
        "properties": { "options": [ { "label": "Personal", "value": "personal" },
                                     { "label": "Company", "value": "company" } ] } } },
    { "id": "companyName", "meta": { "type": "text", "label": "Company name" } }
  ],
  "layout": [
    { "id": "main", "meta": { "title": "Sign up" },
      "children": [ { "id": "name" }, { "id": "type" }, { "id": "companyName" } ] }
  ],
  "rules": [
    { "id": "company-only", "when": "value('type') !== 'company'",
      "affects": [ { "target": "companyName", "visible": false } ] },
    { "id": "company-required", "when": "value('type') === 'company'",
      "affects": [ { "target": "companyName", "required": true } ] }
  ]
}
```

## Install

```bash
# Browser
npm install @protoform/core @protoform/react @protoform/adapter-daisyui

# Server
pip install protoform-engine          # engine only, framework-free
pip install protoform-engine[drf]     # + Django REST framework view
```

## Usage

Render in React:

```tsx
import { ProtoForm } from "@protoform/react";
import { daisyuiAdapter } from "@protoform/adapter-daisyui";

<ProtoForm schema={schema} adapter={daisyuiAdapter} onSubmit={handleSubmit} />
```

daisyUI is the default look used across the docs and demo. Swapping the
adapter is one import: `daisyui`, `tailwind`, and `unstyled` are
maintained by the core team, and `shadcn`, `material`, `antd`, and
`chakra` are community-maintained.

Enforce on the server, same schema:

```python
from protoform import prepare_form, evaluate_rules, collect_field_errors

prepared = prepare_form(schema)
result = evaluate_rules(prepared, submitted_values)
errors = collect_field_errors(prepared["form"], result["derived"], result["values"])
# {} when valid, otherwise {"companyName": ["This field is required."]}
```

Or subclass the DRF view and get GET schema / PATCH step / POST submit
with `400 {"errors": {...}}` responses:

```python
from protoform.views import ProtoFormView

class SignupView(ProtoFormView):
    schema = SCHEMA
    mapping = {"name": "myapp.Account", "email": "myapp.Account"}

    def validate(self, values, errors, *, step_id=None):
        if Account.objects.filter(email=values.get("email")).exists():
            errors.setdefault("email", []).append("Already taken.")

    def save(self, grouped_values, request):
        Account.objects.create(**grouped_values["myapp.Account"])
```

## Why

Forms get built twice: browser validation for feedback, and server
validation because the browser can be bypassed. The two drift, and
nothing tests that they agree. ProtoForm makes the form a document
evaluated by two engines that CI proves identical. The schema is also
small enough for an LLM to write whole, and the server re-validates
whatever it wrote.

## Capabilities

| Included | Not included (host concerns) |
|---|---|
| 19 field types, including multiselect, computed, and the common HTML input types | Approval workflow and scheduling |
| Conditional visibility, required, disabled, read-only, validity via rules | Persistence and models (you bring your own) |
| Cross-field validation, 15 templates, custom functions and templates | Async vendor orchestration (pattern documented in spec §11) |
| Multi-step forms with completeness, progression gates, per-step validation, and a wizard component | Authentication and multi-party workflow |
| Repeating groups, nested to any depth, with min/max rows, per-row rules, and row-addressed errors | File upload transport (field type included, storage is yours) |
| Computed fields with arithmetic, `round`/`min`/`max`, and cross-row `count`/`sum` | Payments and e-signature execution |
| Identical Python server engine, DRF view, server error channel | i18n (single-language strings today) |
| Pluggable UI adapters, custom field components, field wrappers | Non-React bindings (core is framework-free; contributions welcome) |
| `hidden` fields, `env()` context, message interpolation, debug overlay | Visual form builder |
| Rule-driven select options, async option search (`options_url`), warning messages, RFC 9457 error responses | |
| Meta-schema for validating schema documents; no eval in either engine, safe under strict CSP | |

### What ProtoForm deliberately doesn't do

ProtoForm defines what a form is and how its state derives from values.
It does not manage users. Scenarios where multiple parties work on the
same submission, each seeing or editing different parts under different
permissions, are host-application territory: the invitations, the
delegation of access, the authorization checks, and the security model
around them all live in your application. The protocol's contribution is
mechanical: pass the acting party's context via `env()` and drive
per-party views with `visible`/`read_only` rules, which the server
re-evaluates with its own trusted env. Who gets in, and who may write
what, is enforced by you. The same boundary applies to persistence,
approval workflow, and vendor orchestration: the schema owns calculation;
the host owns process. Patterns for each are in [spec §11](docs/spec.md).

## Going deeper

- [Specification](docs/spec.md): the protocol: schema, expressions, rules, repeaters, computed fields, evaluation
- [Agent guide](AGENTS.md): complete reference for configuring ProtoForm correctly (written for AI agents and humans in a hurry)
- [Adapter guide](docs/adapters.md): render props, custom adapters, custom fields
- [Python reference](docs/python.md): engine API, Django integration, DRF views
- [Roadmap](docs/roadmap.md) · [Contributing](CONTRIBUTING.md)

## Development

```bash
bun install
bun run build        # all packages
bun run test         # TS + React tests
bun run conformance  # cross-engine parity check (needs Python 3.10+)
bun run dev          # demo app
```

## License

MIT
