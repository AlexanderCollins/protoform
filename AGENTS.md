# ProtoForm Agent Guide

Complete reference for generating ProtoForm schemas and integrating the
engines correctly. Written for AI agents; useful for humans in a hurry.
The [spec](docs/spec.md) is normative; this guide is operational.

## Golden rules

1. Use strict equality only: `===` and `!==`. `==` and `!=` are not in the
   grammar and evaluate to false on the server.
2. Layout `children` are references: `{ "id": "field_id" }`. Never duplicate
   field meta inside layout.
3. HTML attributes (`placeholder`, `options`, `min`, `max`, `step`, `rows`,
   `accept`, `multiple`) go in `meta.properties`, never directly on `meta`.
4. Custom expression functions must be registered in every engine that
   evaluates the schema (TS and Python). Unregistered functions make their
   expression false, silently.
5. Keep regex patterns to syntax valid in both JS and Python `re`. Regex
   literals take no flags.
6. Arithmetic is numeric only. Adding a string to a number is an error
   (rule becomes false, computed value becomes null), not concatenation.
7. A repeat container may contain field references and nested repeat
   containers, nothing else. A plain (non-repeat) container inside a
   repeat is a prepare-time error.
8. Rule `when` strings that are exactly `templateName` or
   `templateName(args)` resolve as templates. Anything longer is a plain
   expression.
9. Validate generated schemas against the meta-schema
   (`schema/protoform.schema.json`) before shipping them; it is the typed
   contract for the schema document itself.

## Working with your engineer

You are usually building a form for a software engineer who knows their
domain but not this protocol. Some decisions are theirs, and guessing them
produces a form that validates the wrong thing. Ask before generating when
the answer changes the schema. When a documented default exists, use it
and state the assumption in your reply instead of asking.

Ask about, when the request leaves them open:

- **Severity**: should a failed check block progression (`blocking: true`),
  mark the field invalid without blocking, or only advise
  (`"type": "warning"`)? Engineers often say "validate X" when they mean
  "warn about X".
- **Step structure**: which fields belong to which step, whether any step
  is conditional, and what should happen on step completion (server call
  or client-only). One container per step; `MultiStepWizard` handles the
  rest.
- **Repeats**: minimum and maximum row counts, the `item_label`, what a
  new row should be pre-filled with, and whether rows contain their own
  lists (nested repeats are supported; do not flatten them into
  numbered field copies).
- **Computed values**: exact formula, rounding (`round` is
  half-away-from-zero), and display format. Confirm whether the server
  should recompute and return them (`values` in the response) or trust
  the client.
- **Environment values**: which `env()` keys exist, who sets them, and
  their exact spellings. An `env()` key the host never provides makes the
  rule silently false.
- **Option sources**: fixed list in `meta.properties.options`, rule-driven
  via the `options` affect (cascading selects), fetched via
  `properties.options_url` (add `{q}` for an async search select), or a
  custom field component for richer lookups. Ask whether selected values
  must be re-checked server-side; if so, that check belongs in the
  `validate()` hook because engines never fetch option lists.
- **Server contract**: whether the backend runs the Python engine (it
  should), which endpoints validate steps vs. submission, and whether
  clients consume the problem+json error body.
- **Persistence**: where drafts live and which schema version an
  in-flight submission pins. The protocol does not store anything.
- **Custom checks**: any validation that needs data the engine cannot see
  (uniqueness, external systems). That belongs in the server `validate()`
  hook, addressed to a field id or row key, not in a rule.

Use the protocol fully. Before writing host code, check this table; if
the left column describes what you are about to do, use the right column
instead:

| If you are about to write... | Use instead |
|---|---|
| Conditional JSX (`{show && <Field/>}`) | A rule with a `visible` affect |
| Validation logic in a submit handler | Rules, or the server `validate()` hook |
| A totals calculation in an `onChange` | A `computed` field |
| A custom array-of-inputs component | A repeat container (nested if needed) |
| A hand-rolled stepper | `MultiStepWizard` |
| An ad-hoc error response shape | The problem+json wire format (section below) |
| Duplicated per-field required checks | `meta.required` plus templates |
| A second source of truth for options | The `options` affect |
| Client-only validation | The same schema evaluated by the Python engine |

Catch misuses when reviewing a schema (yours or theirs):

- `==` or `!=` anywhere in an expression. The server evaluates the rule
  as false and accepts what the client rejected.
- A rule referencing a field id that does not exist in `fields`.
  Expressions read `undefined`, which equals `null`, and the rule
  misfires quietly.
- Field meta duplicated inside layout `children`, or `placeholder` /
  `options` placed directly on `meta` instead of `meta.properties`.
- A custom function used in an expression but registered in only one
  engine.
- A `visible: true` affect with no counterpart hiding rule, on a field
  meant to be hidden by default (fields default to visible).
- Arithmetic on fields that can be empty, inside a rule, without an
  `isEmpty()` guard.
- A repeat used for a fixed, known-size group (two named referees are two
  sets of fields, not a repeat with `min: 2, max: 2`).
- A repeat of single-field rows used for "pick several of these": that is
  a `multiselect`.
- A rule comparing a `multiselect` value with `===`: arrays never equal a
  string; use `value('id').includes('x')` or `count('id')`.
- Anything from the out-of-scope list modeled in the schema (see the
  section below).

Run every generated schema through the meta-schema
(`schema/protoform.schema.json`) and, when both engines are in play, add
a conformance vector for any behavior you are not sure both engines share.

## Schema skeleton

```json
{
  "fields":  [ { "id": "f1", "meta": { "type": "text", "label": "Label",
                 "required": true, "description": "optional",
                 "properties": { "placeholder": "..." } } } ],
  "layout":  [ { "id": "step1", "meta": { "title": "Step title", "sub_title": "optional" },
                 "children": [ { "id": "f1" } ],
                 "layout": [ ["f1"] ] } ],
  "rules":   [ { "id": "r1", "when": "<expression or template>",
                 "affects": [ { "target": "f1", "visible": true, "required": true,
                                "valid": false, "disabled": false, "read_only": true,
                                "blocking": true, "message": "text with {f1}",
                                "type": "error" } ] } ]
}
```

Every `affects` property is optional; only the ones present take effect.
Multiple layout containers = multi-step form (one container per step).
`layout` rows inside a container place fields side by side.

## Field types

| Type | Notes | Properties |
|---|---|---|
| `text` | | `placeholder` |
| `number` | value stored as number | `placeholder`, `min`, `max`, `step` |
| `currency` | number input with symbol | above + `currency` (symbol, default `$`) |
| `email`, `password`, `date`, `textarea` | | `placeholder`; `rows` for textarea; `min`/`max` for date |
| `select`, `radio` | | `options: [{ "label": "A", "value": "a" }]`, `placeholder`; select also takes `options_url` |
| `multiselect` | value is an array of option values; `[]` counts as empty for required; validate with `count('id')` and `value('id').includes(...)` | `options`, `searchable` (client-side filter), `options_url`, `placeholder` |
| `checkbox` | boolean value | |
| `tel`, `url` | plain string values | `placeholder` |
| `time`, `datetime` | ISO strings (`HH:MM`, `YYYY-MM-DDTHH:MM`); string comparison orders them correctly in rules | `min`, `max`, `step` |
| `range` | numeric slider, value stored as number | `min`, `max`, `step` |
| `file` | value is host-defined (usually array) | `accept`, `multiple`, `maxFiles`, `maxSize` |
| `hidden` | holds state, participates in rules, renders nothing | |
| `computed` | derived, read-only, never required | `expr` (expression), `format` (hint) |

Unknown types render as text inputs. Unknown `meta.*` keys are preserved,
which is the extension namespace for app-specific data such as
`meta.integration`.

### Option sources, in order of reach

1. **Static**: `properties.options` in the schema. Default choice.
2. **Rule-driven**: an `options` affect swaps the option set when a rule
   fires (cascading selects). Both engines see it; it is part of derived
   state.
3. **Fetched**: `properties.options_url` is a URL the client fetches
   options from. A `{q}` placeholder makes it a search-driven async
   select: the renderer substitutes the encoded query and re-fetches,
   debounced, as the user types. Response: a JSON array of
   `{label, value}`. Engines never fetch and never validate membership;
   if a submitted value must belong to the fetched list, check it in the
   server `validate()` hook.
4. **Custom component**: for anything richer (results with images,
   multi-field population), use a field override; see the asset-lookup
   recipe below.

On `multiselect`, `properties.searchable: true` adds a client-side filter
box over whatever options are loaded, with no request involved. Precedence
when several sources exist: affect > fetched > static.

## Expressions

Available in `rule.when` and `meta.expr`:

```
value('field_id')          field lookup (missing value is null)
field_id                   bare identifier, same as value('field_id')
env('key')                 environment context (host-supplied, e.g. actor role)
isEmpty(x)                 true for null, "", [], {}
===  !==  >=  <=  >  <     comparisons (string-vs-string is lexicographic)
&&  ||  !                  logic, JS short-circuit semantics
+  -  *  /                 numeric arithmetic, unary minus, parentheses
round(x, dp?)  min(...)  max(...)      numeric builtins (round half away from zero)
count('repeatId')                       number of rows
sum('repeatId', 'fieldId')              numeric sum across rows (empty cells = 0)
total_pct('repeatId', 'fieldId')        true when sum is 100
/pattern/.test(value('f'))              regex search, no flags
(value('f') || '').length               string/array length
(value('f') || []).includes('x')        membership
'a' , 1 , true , null , undefined , [1, 2]    literals (undefined ≡ null)
```

Failure model: anything that errors (unknown function, bad arithmetic,
division by zero) makes a rule false and a computed value null. Nothing
throws at runtime.

## Templates (rule shorthands)

`when` shorthands; `fieldId` is inferred from `affects[0].target` when
omitted: `minValue(18)`, `maxValue(100)`, `between(0, 150)`,
`fieldEquals('AU')`, `fieldNotEquals('AU')`, `isEmpty`, `isNotEmpty`,
`fieldsEqual('pw', 'pw2')`, `fieldGreaterThan('a', 'b')`,
`fieldLessThan('a', 'b')`, `matches('^[A-Z]{2,4}$')`, `minLength(2)`,
`maxLength(100)`, `includes('vip')`, `notIncludes('vip')`.

Custom, registered once per engine:

```ts
// TypeScript (client)
import { registerFunction, registerTemplate } from "@protoform/core";
registerFunction("checksumFails", (v) => digitSum(v) % 7 !== 0);
registerTemplate("checksumInvalid", { params: ["fieldId"], expression: "checksumFails(value('${fieldId}'))" });
```
```python
# Python (server): the same names, equivalent logic
from protoform import register_function, register_template
register_function("checksumFails", lambda v: digit_sum(v) % 7 != 0)
register_template("checksumInvalid", ["fieldId"], "checksumFails(value('${fieldId}'))")
```

## Common rule patterns

Conditional section (pair the show and hide):

```json
{ "id": "show-company", "when": "value('type') === 'company'",
  "affects": [{ "target": "company_name", "visible": true, "required": true }] },
{ "id": "hide-company", "when": "value('type') !== 'company'",
  "affects": [{ "target": "company_name", "visible": false }] }
```

Required field with message: `{ "when": "isEmpty", "affects": [{ "target": "f", "valid": false, "message": "Required" }] }`.
Advisory notice: `"type": "warning"` on a message renders distinctly and is
never collected as an error.
Cascading selects: an affect with `"options": [{ "label": ..., "value": ... }]`
replaces the target select/radio's options while the rule holds; the last
matching rule wins, and `meta.properties.options` apply when none match.
API-fetched option lists stay in custom field components.
Gate progression: add `"blocking": true` to the affect.
Chained rules: `"required_parent": ["parent-rule-id"]` skips a rule unless
the parent evaluated true.
Hide a whole step: target the container id with `visible: false`; every
field inside is exempted from validation automatically.
Per-party views: `"when": "env('actor_role') === 'restricted'"` driving
`read_only` / `visible` affects; the server evaluates the same rules with
server-supplied env.

## Repeaters

```json
{ "id": "contacts",
  "meta": { "title": "Emergency contacts", "type": "repeat",
            "min": 1, "max": 3, "item_label": "Contact {index}" },
  "children": [ { "id": "contact_name" }, { "id": "contact_phone" } ] }
```

- Row-template fields are declared in top-level `fields` like any field,
  then referenced by the repeat's `children`. They exist only as row
  instances.
- Values: `{ "contacts": [ { "contact_name": "Sam" }, ... ] }`.
- Addressing: derived state and errors use `contacts[0].contact_phone`.
- Row-scoped rules: add `"scope": "contacts"` to a rule; bare identifiers
  resolve within the row; affects targeting row-template fields apply per
  row. Everything else about rules works unchanged.
- Aggregates (`count`/`sum`/`total_pct`) work in unscoped rules, and in
  rules scoped to a parent repeat when the argument names a child repeat
  (each parent row aggregates over its own child rows).
- Completeness: within `min`/`max` and every visible required row field
  filled. Errors include "At least N entries are required." on the repeat
  container id.
- Nested repeats: a repeat's `children` may include further repeat
  containers. Addressing extends recursively
  (`teams[0].members[1].qual_name`); `min`/`max` apply to each parent
  row's own array; bound errors name the instance (`teams[1].members`).
  In row-scoped rules, identifiers resolve lexically: own row first, then
  ancestor rows, then top-level values.
- React context: `addRow(path, initial?)`, `removeRow(path, index)`,
  `setRowValues(path, index, partial)` (bulk row write, one evaluation
  pass). `path` is the repeat id for a root repeat or a row-addressed
  path for a nested one (`addRow("teams[0].members")`). Added and seeded
  rows include child repeats pre-filled to their minimums. Helpers
  `rowKey`/`parseRowKey`/`templateFieldId`/`resolveValuePath` come from
  `@protoform/core`.
- `fields` overrides and `fieldWrappers` registered under the template
  field id apply to every row instance at any nesting depth; an exact row
  id wins if both are registered.

## Computed fields

```json
{ "id": "total", "meta": { "type": "computed", "label": "Total",
    "expr": "round(value('unit_price') * value('quantity'), 2)", "format": "currency" } }
```

Evaluated before rules, in dependency order (cycles rejected at prepare).
Always read-only, never required. Empty inputs or bad arithmetic yield
null. Rules may read computed values and messages may interpolate them:
`"message": "Total is {total}"`.

## Multi-step wizard

`MultiStepWizard` ships in `@protoform/react`. Each visible top-level
container is a step; completeness and progression come from the engine.

```tsx
import { ProtoForm, MultiStepWizard } from "@protoform/react";

<ProtoForm schema={schema} adapter={adapter} autoLayout={false} showSubmitButton={false}>
  <MultiStepWizard
    progressStyle="adapter"          // "stepper" (built-in) | "adapter" | "none"
    onStepComplete={async (stepId, values) => {
      const res = await api.patch(url, { step: stepId, values });
      if (res.status === 400) return { errors: res.data.errors };
      return { values: res.data.values };   // server-authoritative merges
    }}
    onSubmit={async (values) => {
      const res = await api.post(url, values);
      if (res.status === 400) return { errors: res.data.errors };
    }}
  />
</ProtoForm>
```

Returning `{errors}` blocks advancement and shows them on the right
fields; returning `{values}` merges server-provided values (computed
results, async data) without touching fields. Rule-hidden steps are
skipped automatically.

## Recipe: repeating asset list with an API lookup and images

The scenario: a list of assets; each row has a lookup field backed by a
search API; selecting a result populates the row, including an image the
API returns; populated fields lock.

Schema:

```json
{
  "fields": [
    { "id": "sku", "meta": { "type": "text", "label": "Search catalog",
        "integration": { "kind": "asset-search", "min_query_length": 2 } } },
    { "id": "asset_name", "meta": { "type": "text", "label": "Name", "required": true } },
    { "id": "asset_value", "meta": { "type": "currency", "label": "Value" } },
    { "id": "image_url", "meta": { "type": "hidden", "label": "" } },
    { "id": "sku_verified", "meta": { "type": "hidden", "label": "" } }
  ],
  "layout": [
    { "id": "assets", "meta": { "title": "Assets", "type": "repeat",
        "min": 1, "item_label": "Asset {index}" },
      "children": [ { "id": "image_url" }, { "id": "sku" },
                    { "id": "asset_name" }, { "id": "asset_value" } ] }
  ],
  "rules": [
    { "id": "lock-looked-up", "scope": "assets", "when": "sku_verified === true",
      "affects": [ { "target": "asset_name", "read_only": true },
                   { "target": "asset_value", "read_only": true } ] }
  ]
}
```

Notes: `meta.integration` is an app extension (preserved, ignored by
engines). `image_url` and `sku_verified` are `hidden`, so they carry data
without rendering inputs.

Client components:

```tsx
import { parseRowKey } from "@protoform/core";
import { useFieldState, useProtoForm } from "@protoform/react";

// Registered as fields={{ sku: AssetLookup, image_url: AssetThumb }};
// template-id registration applies to every row.
function AssetLookup({ id }: { id: string }) {
  const { value, setValue } = useFieldState(id);
  const { setRowValues } = useProtoForm();
  const row = parseRowKey(id)!; // { repeatId: "assets", index, fieldId: "sku" }

  const onSelect = (hit: ApiHit) =>
    setRowValues(row.repeatId, row.index, {
      sku: hit.sku,
      asset_name: hit.name,
      asset_value: hit.value,
      image_url: hit.imageUrl,   // image from the API, into the row
      sku_verified: true,
    });

  return <SearchSelect query={value ?? ""} onQuery={setValue} onSelect={onSelect} />;
}

function AssetThumb({ id }: { id: string }) {
  const { value } = useFieldState(id);
  return value ? <img src={value} alt="" style={{ maxWidth: 96 }} /> : null;
}
```

Server: the same schema validates each row (`asset_name` required per
row); the `validate()` hook can re-fetch the SKU and reject exactly one
row's field:

```python
def validate(self, values, errors, *, step_id=None):
    for i, row in enumerate(values.get("assets", [])):
        if row.get("sku_verified") and not catalog.exists(row.get("sku")):
            errors.setdefault(f"assets[{i}].sku", []).append("Unknown SKU.")
```

## Recipe: save, resume, and asynchronous integrations

The engines are stateless functions over values, which is exactly what
makes resume simple. The host stores three things per submission:

1. **The values dict** (rows and all) after each autosave or step
   completion.
2. **The current step id.**
3. **A pin to the schema version** the submission started on, so in-flight
   submissions are never broken by publishing a new form version.

Resume is rehydration: load the stored values into `initialValues`, restore
the current step, done. Everything derived (visibility, validity,
completeness, computed values) is recomputed from values on load, so
nothing derived needs storing and nothing stored goes stale.

Per-step saving: `PATCH` the step with the full accumulated values (not
just the step's), because rules may reference fields from other steps. The
server validates only the step's fields and returns `400 {"errors"}` or
persists via `save_step`.

Asynchronous integrations follow from the same design. A verification or
lookup that completes out-of-band (webhook, callback, queue) writes its
result into the stored values as ordinary fields, typically `hidden` ones
(a status flag, a result payload). A `blocking` rule on the status field
keeps the step incomplete until the result arrives. A user who left
mid-flow sees the completed state on their next load because rehydration
picks up the merged values; a live session refetches the submission (or
the host pushes) and applies the fresh values. The engine needs no
concept of "pending": it evaluates whatever values exist, every time.

## Django integration, practically

Minimal wiring with the `[drf]` extra:

```python
# forms/views.py
from protoform.views import ProtoFormView
from .schemas import ONBOARDING_SCHEMA

class OnboardingView(ProtoFormView):
    schema = ONBOARDING_SCHEMA                 # or override get_schema() to load from DB
    mapping = {                                # field -> your models
        "first_name": "crm.Person",
        "email": ("crm.Person", "email_address"),
        "company_name": "crm.Company",
    }

    def get_env(self, request):
        return {"actor_role": request.user.role}

    def validate(self, values, errors, *, step_id=None):
        ...                                     # uniqueness, external checks

    def save_step(self, step_id, grouped, request):
        ...                                     # optional partial persistence

    def save(self, grouped, request):
        person = Person.objects.create(**grouped["crm.Person"])

# urls.py
path("api/onboarding/", OnboardingView.as_view())
```

Client flow against that endpoint: `GET` fetches the schema, autosave can
`PATCH {"step": id, "values": all_values}` per step, final `POST` submits
everything. Validation failures are RFC 9457 problem+json
(`{"type": "urn:protoform:validation", "title": ..., "status": 400,
"errors": {...}}`); clients read the `errors` member and pass it to
`setExternalErrors`, row-addressed keys included. Success responses carry
`{"values": {...}}` (computed fields by default; override
`response_values()` to add async results) which clients merge via
`applyServerValues`.

Without DRF, call the engine directly in any view or task:
`prepare_form` → `evaluate_rules` → `collect_field_errors` (use the
`values` returned by `evaluate_rules` so computed fields are present).

**With an existing API layer** (DRF viewsets, model-driven CRUD
frameworks, GraphQL): they compose side by side and don't overlap.
ProtoForm is the intake layer in front of your models. A `ProtoFormView`
endpoint validates the submission, `mapping` groups the values by model,
and `save()` persists through the ORM, after which the records are
ordinary data served by your existing API like anything else. ProtoForm
never touches your API layer; it hands you validated, grouped data at the
boundary.

## Out of scope: do not model these in the schema

- **Multi-party access.** When several parties work on one submission with
  different views and permissions, the schema stays single and party
  differences are expressed only through `env()`-driven `visible` /
  `read_only` / `disabled` rules. Everything else about that arrangement
  is the host's: inviting a party, delegating access, authenticating them,
  authorizing what they may read or write, and auditing it. The engine
  never knows who is acting; it sees values and env. Server-side
  enforcement of write permissions is host code layered on top of
  `validate_step` / `validate()`.
- **Persistence and workflow.** Drafts, submission status, approval
  chains, notifications, and scheduling belong to the host. The engines
  are stateless functions over values; the DRF view exposes `save_step`
  and `save` hooks and owns nothing.
- **Vendor orchestration.** Redirects, embedded SDKs, webhooks, and
  polling are host mechanics. Results enter the form as values (spec §11);
  rules take over from there.

## Pitfalls checklist

- `==` instead of `===`: rule silently false on the server.
- Custom function registered client-side only: server treats the rule as
  false and accepts what the client rejected. Register in both engines.
- Full field objects in layout `children`: ignored meta, drift risk. Use
  `{ "id": ... }`.
- `placeholder`/`options` directly on `meta`: renderers read
  `meta.properties` only.
- Regex with flags (`/x/i`) or Python-incompatible syntax: parse failure,
  rule false.
- Arithmetic on possibly-empty fields: guard with `isEmpty()` in rules;
  computed fields handle it (null), rules become false.
- Expecting `values` passed into `evaluate_rules` to contain computed
  results: use the `values` the call returns.
- Plain (non-repeat) containers inside a repeat: rejected at prepare time.
- Forgetting the hide-rule of a show/hide pair: fields default to visible.
- Expecting the server to validate `options_url` membership: engines never
  fetch. Check membership in the server `validate()` hook.
- Treating a `multiselect` value as a string: it is an array; `[]` is
  empty for required, `.includes()` tests membership, `count()` sizes it.
