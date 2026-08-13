# ProtoForm Protocol Specification

Version 1.5

## 1. Schema Structure

A ProtoForm schema is a `Form` with three top-level arrays:

```typescript
interface Form {
  fields: Field[];
  layout: Container[];
  rules: Rule[];
}
```

### Field

```typescript
interface Field {
  id: FieldKey;   // unique string identifier
  meta: FieldMeta;
}
interface FieldMeta {
  type: string;                       // see section 2
  label: string;
  description?: string;
  properties?: Record<string, any>;   // HTML attribute passthrough
  required?: boolean;
  disabled?: boolean;
}
```

### Container

```typescript
interface Container {
  id: ContainerKey;
  children: (Container | FieldRef)[];
  meta: ContainerMeta;
  layout?: ElementKey[][];   // rows of element IDs for grid rendering
}
interface FieldRef {
  id: FieldKey;              // references a field in Form.fields
  meta?: FieldMeta;          // legacy inline meta, ignored by engines
}
interface ContainerMeta {
  title: string;
  sub_title?: string;
  type?: string;             // renderer hint ("section", "step", "card")
}
```

`layout` defines rows: `[["firstName", "lastName"], ["email"]]`. Elements not listed render in declaration order. A child with `children` is a Container; any other child is a field.

**Field children are references.** The canonical form for a field child is a bare reference, `{ "id": "firstName" }`, pointing at the field declared in the top-level `fields` array. The `fields` array is the single source of truth for field metadata. Inline full Field objects (id + meta) are accepted for backwards compatibility, but engines only ever read the `id`. Duplicated `meta` in layout children is ignored and should not be authored.

### Responsive Layout

Rows use `display: flex` with `flexWrap: wrap` and `columnGap: 1rem`. Each element in a row has `flex: 1` and `minWidth: 200px`. On narrow viewports (mobile), fields that can't fit side-by-side wrap to the next line automatically. Only `columnGap` is used (not `gap`) so that vertical spacing between wrapped fields comes solely from each field's own margin, avoiding double-spacing. This ensures multi-field rows degrade gracefully without any media queries or breakpoint configuration.

## 2. Field Types

| Type       | Description      | Relevant Properties                 |
|------------|------------------|-------------------------------------|
| `text`     | Single-line text | `placeholder`                       |
| `number`   | Numeric input    | `placeholder`, `min`, `max`, `step` |
| `currency` | Monetary amount  | `placeholder`, `min`, `max`, `step`, `currency` (symbol, default `$`) |
| `email`    | Email address    | `placeholder`                       |
| `password` | Masked text      | `placeholder`                       |
| `date`     | Date picker      | `min`, `max`                        |
| `textarea` | Multi-line text  | `placeholder`, `rows`               |
| `select`   | Dropdown         | `options`, `placeholder`, `options_url` |
| `multiselect` | Multiple choice; value is an array of option values | `options`, `searchable`, `options_url`, `placeholder` |
| `radio`    | Radio group      | `options`                           |
| `checkbox` | Boolean toggle   | --                                  |
| `tel`      | Phone number     | `placeholder`                       |
| `url`      | Web address      | `placeholder`                       |
| `time`     | Time of day (`HH:MM`) | `min`, `max`, `step`           |
| `datetime` | Date and time (`YYYY-MM-DDTHH:MM`, renders as `datetime-local`) | `min`, `max`, `step` |
| `range`    | Numeric slider   | `min`, `max`, `step`                |
| `file`     | File upload      | `accept`, `multiple`, `maxFiles`, `maxSize`; recommended value shape: an array of `{ "name": ..., "size"?, "url"?, "id"? }`; upload transport and storage are host concerns |
| `hidden`   | Value-only field | -- (participates in state and rules, renders no UI) |
| `computed` | Derived value    | `expr` (expression), `format` (renderer hint); see section 13 |

Select/radio/multiselect `options` format: `[{ "label": "Option A", "value": "a" }]`

A `multiselect` value is an array of option values. An empty array counts
as empty for `required`, `count('field_id')` returns the selection size,
and `value('field_id').includes('x')` tests membership. `time` and
`datetime` values are ISO-formatted strings, so the existing lexicographic
string comparison orders them correctly in rules.

### Dynamic option loading (`options_url`)

`properties.options_url` names a URL the *client* fetches option lists
from. It is a rendering contract only: engines never fetch, and schema
evaluation is identical with or without it. The server therefore does not
validate that a submitted value belongs to the fetched list; when
membership matters, check it in the host's `validate()` hook.

- A plain URL is fetched once when the field mounts.
- A URL containing `{q}` makes the control search-driven: the renderer
  substitutes the (URL-encoded) query and re-fetches, debounced, as the
  user types. This is the async search select.
- The response body is a JSON array of `{ "label", "value" }` objects (or
  an object with an `options` array of the same shape).
- Precedence when several sources exist: a rule-driven `options` affect
  (section 4) wins over fetched options, which win over static
  `properties.options`.
- On `multiselect`, `properties.searchable` instead filters the loaded
  options client-side with no request; combined with a plain (no-`{q}`)
  `options_url`, this gives search-feel over one fetched list.

**Fallback:** a renderer that doesn't implement a type renders it as a plain text input; `hidden` never reaches a renderer. Unknown `meta` keys (e.g. app-specific extensions like `meta.integration`) must be preserved and ignored by engines.

## 3. Expression Syntax

Expressions are strings evaluated for truthiness. The engine coerces the
result to a boolean using JS truthiness rules. In scope:

- **`value('fieldId')`** -- current field value
- **`env('key')`** -- environment context value
- **Bare field identifiers** -- every field id that is a valid identifier is
  available as a variable holding its current value: `age >= 18` is
  equivalent to `value('age') >= 18`. Use `value()` for field ids that are
  not valid identifiers (dashes, leading digits).
- **`isEmpty(x)`** -- true when `x` is `null`, `undefined`, `""`, `[]`, or `{}`
  (the protocol-wide empty definition, section 7)

**Comparisons:** `===`, `!==`, `>=`, `<=`, `>`, `<`
```
value('age') >= 18
value('country') === 'AU'
```
Ordering comparisons between two strings are lexicographic (as in JS), which
makes ISO date-string rules work: `value('end_date') >= value('start_date')`.

**Logic:** `&&`, `||`, `!`
```
value('age') >= 18 && value('age') <= 65
value('role') === 'admin' || env('isInternal') === true
```

**Literals:** strings (`'...'`), numbers, `true`, `false`, `null`, `undefined`

**Arithmetic:** `+`, `-`, `*`, `/` with standard precedence, parentheses, and
unary minus. Arithmetic is numeric only: operands coerce via strict float
rules, and a non-numeric operand or division by zero makes the expression
error (false in a rule, null in a computed field). Builtins: `round(x, dp?)`
(half away from zero), `min(...)`, `max(...)`.

**Array aggregates:** `count('repeatId')`, `sum('repeatId', 'fieldId')`
(empty row values count as 0), and `total_pct('repeatId', 'fieldId')`
(true when the sum is 100 within 1e-9). See section 12. These read any
array value: `count` on a `multiselect` field returns the selection size,
and `sum` over rows that are not objects contributes 0 for those rows in
both engines.

**Method calls:** `.length`, `.test()`, `.includes()`
```
(value('name') || '').length >= 2
/^[A-Z]/.test(value('code'))
(value('tags') || []).includes('vip')
```

The receiver of `.test()` is a `/regex/` literal (no flags). `.test()`
searches (JS `RegExp.test` semantics); anchor with `^`/`$` for full matches.
Keep patterns to the syntax common to JS and Python `re`. Avoid lookbehind
quirks, named groups, and JS-only escapes.

**Short-circuit semantics:** `&&` returns the first falsy value (or the last value if all truthy). `||` returns the first truthy value (or the last value if all falsy). This matches JavaScript behaviour and must be preserved by all implementations.

**Evaluation safety:** both engines evaluate expressions with sandboxed
recursive-descent parsers, with no `eval` and no `new Function`. The TS engine is
safe under a strict Content-Security-Policy (`'unsafe-eval'` not required),
and schema expressions cannot execute arbitrary code in either engine.
Unparseable or erroring expressions evaluate to `false` (fail closed).
Missing values normalize to `null`, and `undefined` is the same value as
`null`, so `value('missing') === null` is true in every engine.

### Compositional Expressions

```typescript
interface Expression {
  type?: "and" | "or";   // defaults to "and"
  expressions: Expression | Expression[] | ExpressionString | ExpressionString[];
}
```

```json
{
  "type": "or",
  "expressions": [
    "value('status') === 'approved'",
    { "type": "and", "expressions": ["value('role') === 'manager'", "value('override') === true"] }
  ]
}
```

`"and"` = all true. `"or"` = at least one true.

## 4. Rule System

```typescript
interface Rule {
  id: RuleKey;
  when: Expression | ExpressionString;
  affects: Affect[];
  required_parent?: RuleKey[];   // skip unless all parent rules were true
}

type MessageKind = "error" | "info" | "warning";

interface Affect {
  target: ElementKey;
  blocking?: boolean;      // gates form progression
  required?: boolean;
  valid?: boolean;
  visible?: boolean;
  disabled?: boolean;
  read_only?: boolean;
  message?: string;
  type?: MessageKind;      // default: "error" if this affect sets valid: false, else "info"
  options?: SelectOption[]; // replace the target's select/radio options while the rule holds
}
```

All affect properties are optional. Only specified properties take effect.
A `message` on an affect that also sets `valid: false` defaults to
`type: "error"`; otherwise the default is `"info"`. `"warning"` messages
are advisory: renderers style them distinctly and they are never collected
as errors.

**Rule-driven options:** an affect may carry `options` to replace the
target select/radio field's option list while the rule holds (the last
matching rule wins). When no options-carrying rule matches, the field's
`meta.properties.options` apply. This is the portable half of dynamic
options; fetching options from an API remains a host concern via custom
field components.

```json
{
  "id": "show-company-fields",
  "when": "value('entityType') === 'company'",
  "affects": [
    { "target": "companyName", "visible": true, "required": true },
    { "target": "companyNumber", "visible": true }
  ]
}
```

**Rule chaining:** A rule with `required_parent` is skipped unless every listed parent evaluated to `true`:
```json
{
  "id": "validate-company-number",
  "when": "minLength(6)",
  "required_parent": ["show-company-fields"],
  "affects": [{ "target": "companyNumber", "valid": false, "message": "Too short", "type": "error" }]
}
```

## 5. Templates

Templates are named, parameterized expression generators resolved before evaluation.

**Call syntax:** `"templateName(arg1, arg2)"`

When the first template param is `fieldId` and omitted, the engine infers it from `affects[0].target`:
```json
{ "id": "age-min", "when": "minValue(18)",
  "affects": [{ "target": "age", "valid": false, "message": "Must be 18+" }] }
```
Resolves to: `value('age') < 18 && value('age') !== null && value('age') !== ''`

### Built-in Templates (15)

| Template | Params | Expression |
|---|---|---|
| `minValue` | `fieldId, minValue` | `value(f) < min && value(f) !== null && value(f) !== ''` |
| `maxValue` | `fieldId, maxValue` | `value(f) > max` |
| `between` | `fieldId, min, max` | `(value(f) < min \|\| value(f) > max) && value(f) !== null` |
| `fieldEquals` | `fieldId, value` | `value(f) === 'val'` |
| `fieldNotEquals` | `fieldId, value` | `value(f) !== 'val'` |
| `isEmpty` | `fieldId` | `isEmpty(value(f))` (empty per section 7, incl. `[]`/`{}`) |
| `isNotEmpty` | `fieldId` | `!isEmpty(value(f))` |
| `fieldsEqual` | `fieldId1, fieldId2` | `value(f1) === value(f2)` |
| `fieldGreaterThan` | `fieldId1, fieldId2` | `value(f1) > value(f2)` |
| `fieldLessThan` | `fieldId1, fieldId2` | `value(f1) < value(f2)` |
| `matches` | `fieldId, pattern` | `/pattern/.test(value(f) \|\| '')` |
| `minLength` | `fieldId, minLength` | `(value(f) \|\| '').length < min` |
| `maxLength` | `fieldId, maxLength` | `(value(f) \|\| '').length > max` |
| `includes` | `fieldId, value` | `(value(f) \|\| []).includes('val')` |
| `notIncludes` | `fieldId, value` | `!(value(f) \|\| []).includes('val')` |

Usage: `"minValue(18)"`, `"between(0, 100)"`, `"fieldEquals('AU')"`, `"fieldsEqual('password', 'confirmPassword')"`, `"matches('^[A-Z]{2}\\d{4}$')"`, `"isEmpty"`

Args split on commas outside quotes. Commas inside quoted strings are part of
the arg, so `matches('^[A-Z]{2,4}$')` passes the whole pattern. All 15
template expansions produce byte-identical expression strings in every
engine.

### Custom Templates and Functions

Hosts extend the vocabulary without forking the protocol:

- **`registerFunction(name, fn)`** / **`register_function(name, fn)`** adds
  a function callable from expressions, for example a checksum or a lookup
  against loaded data.
- **`registerTemplate(name, template)`** / **`register_template(name,
  params, expression)`** adds a named template shorthand, typically
  delegating to a registered function.

Rules: a custom function MUST be registered in every engine that evaluates
the schema. The registrations are host code, one per engine, kept
equivalent by the host's own tests. An expression calling an unregistered
function evaluates to `false` (fail closed), never a crash. Custom names
must be valid identifiers and cannot shadow `value`, `env`, or `isEmpty`.

```ts
registerFunction("checksumFails", (v) => digitSum(v) % 7 !== 0);
registerTemplate("checksumInvalid", {
  params: ["fieldId"],
  expression: "checksumFails(value('${fieldId}'))",
});
// schema: { "when": "checksumInvalid", "affects": [{ "target": "code", "valid": false }] }
```

A template reference must be the **entire** `when` string, exactly
`templateName` or `templateName(args)`. An expression that merely starts with
a template name (`isEmpty(other) && value('purpose') === 'other'`) is a plain
expression, evaluated by the expression engine (where `isEmpty` is available
as a builtin, section 3).

## 6. Derived State Model

```typescript
interface DerivedState {
  required: Set<FieldKey>;
  visible: Set<ElementKey>;
  disabled: Set<ElementKey>;
  readOnly: Set<FieldKey>;
  valid: Set<ElementKey>;
  blockingTargets: Set<ElementKey>;
  messages: Record<ElementKey, { type: MessageKind; message: string }[]>;
  options: Record<FieldKey, SelectOption[]>;  // rule-driven option overrides
}
```

### Base State (before rules)

1. All fields and containers added to `visible`
2. All fields added to `valid`
3. `meta.required: true` fields added to `required`
4. `meta.disabled: true` fields added to `disabled`
5. `readOnly`, `blockingTargets`, `messages` start empty

### Rule Overrides

When a rule condition is true, affects mutate state:
- `visible: false` removes from `visible`; `true` adds
- `disabled`, `valid`, `required`, `read_only` follow the same add/remove pattern
- `blocking: true` adds to `blockingTargets` (one-way, no removal)
- `message` appends to target's message array (accumulates, never replaces)

Rules evaluate in declaration order. Later rules override earlier rules for the same target/property.

### Visibility Cascade

After all affects apply, container visibility cascades: an element is
**effectively visible** only if it and every ancestor container are in
`visible`. Hiding a container therefore hides every descendant field and
exempts it from validation, completeness, and progression, even if a rule set
that field `visible: true`. Re-showing the container restores whatever the
field-level rules dictate (evaluation is stateless per pass).

## 7. Container Completeness

A container is **complete** when all visible, non-disabled, required descendant fields are valid with non-empty values.

```
isContainerComplete(containerId, descendantFields, values, derived):
  if containerId not in derived.visible: return true
  for each fieldId in descendantFields:
    if fieldId not in derived.visible: continue
    if fieldId in derived.disabled: continue
    if fieldId not in derived.valid: return false
    if fieldId in derived.required and isEmpty(values[fieldId]): return false
  return true
```

**Empty:** `null`, `undefined`, `""`, `[]`, or `{}`. Hidden/disabled fields are skipped. Hidden containers are complete by definition. Descendants are collected recursively and precomputed in `prepareForm`.

## 8. Evaluation Algorithm

### Phase 1: prepareForm (once, on schema load)

```typescript
interface PreparedForm {
  form: Form;
  dependencies: RuleDependencies;
  containerDescendants: Record<ContainerKey, FieldKey[]>;
  fieldToContainer: Record<FieldKey, ContainerKey>;
}
interface RuleDependencies {
  ruleToFields: Record<RuleKey, Set<FieldKey>>;
  fieldToRules: Record<FieldKey, Set<RuleKey>>;
}
```

1. **Resolve templates** -- replace template references in `when` with expanded expressions
2. **Build dependencies** -- extract `value('...')` refs plus bare identifiers naming known fields; produce `ruleToFields` and `fieldToRules` maps
3. **Compute layout maps** -- walk container tree for `containerDescendants` and `fieldToContainer`

### Phase 2: evaluateRules (on every value change)

```
evaluateRules(prepared, values, env?, currentContainer?):
  1. Init base derived state from schema
  2. Pass 1 -- for each rule in order:
     a. If required_parent set, skip if any parent was false
     b. Evaluate rule.when; record in ruleTruth map
  3. Pass 2 -- for each rule where ruleTruth is true:
     Apply all affects (visible, disabled, valid, required, readOnly, blocking, messages)
  4. Compute container completeness
  5. Return { derived, progress }
```

Two-pass design ensures `required_parent` works regardless of rule declaration order.

### Phase 3: canProgress

```
canProgress(derived, values):
  for each target in derived.blockingTargets:
    if target not visible: continue
    if target disabled: continue
    if target not valid: return false
    if isEmpty(values[target]): return false
  return true
```

Only blocking targets gate progression. A field can be invalid without blocking if no rule sets `blocking: true`.

### Phase 4: validateStep (per-step validation)

```
validateStep(prepared, values, stepId, env?):
  1. Evaluate all rules with full values (cross-step dependencies need full context)
  2. Collect errors only for fields in containerDescendants[stepId]
  3. Return { valid, errors, stepValues }
```

Used for partial saves in multi-step forms. The full rule evaluation runs (rules may reference fields from other steps), but error collection is scoped to the specified container.

## 9. Runtime State

```typescript
interface FormProgress {
  currentContainer: ContainerKey | null;
  completeContainers: Set<ContainerKey>;
}

interface FormRuntimeState {
  values: FormValues;
  derived: DerivedState;
  progress: FormProgress;
  touchedFields: Set<FieldKey>;
}
```

`FormRuntimeState` is the complete runtime state of a form instance. It combines the current values, the derived state from rule evaluation, step progress tracking, and touched field tracking.

### Touched Fields

`touchedFields` tracks which fields the user has interacted with. A field becomes touched when:
- The user changes its value
- The user attempts to advance past a step containing the field (all fields in that step are touched)

### Error Visibility

Implementations should support a `showErrorsOnTouch` mode (default `true`) where validation errors are only shown for touched fields. This prevents showing "required" errors on fields the user hasn't reached yet. When a field is required, touched, and empty, a `"This field is required."` error message should be included in the field's messages.

When `showErrorsOnTouch` is `false`, all errors are shown immediately regardless of touch state.

## 10. Server Error Injection

Server-side validation can produce errors that the rule engine cannot express (uniqueness checks, external API verification, cross-model constraints). These **external errors** are injected into the frontend alongside rule engine errors.

### Error Response Format

Validation failures use RFC 9457 Problem Details (`application/problem+json`)
with HTTP status `400`, carrying the field error map as the conventional
`errors` extension member:

```json
{
  "type": "urn:protoform:validation",
  "title": "Validation failed",
  "status": 400,
  "errors": {"field_id": ["Error message 1", "Error message 2"]}
}
```

Field IDs map to the same IDs used in the form schema, including
row-addressed keys (`contacts[1].phone`). The special key `__all__` is used
for form-level errors not tied to a specific field. Clients read `errors`;
the envelope makes the response self-describing to standard HTTP tooling.

### Success Response Values

Successful step and submit responses MAY include a `values` object:

```json
{"status": "ok", "step": "step_id", "values": {"total": 128.5}}
```

Clients MUST merge these into form values without marking fields touched
and re-evaluate. Servers use this to return authoritative computed values
(the default in the DRF view) and asynchronous integration results via the
overridable `response_values()` hook. The React binding exposes
`applyServerValues(partial)` with exactly these semantics.

### Backend: `validate()` Hook

`ProtoFormView` provides an overridable `validate()` method that runs after rule engine validation in both `patch()` (step validation) and `post()` (full form submission):

```python
def validate(self, values: dict, errors: dict[str, list[str]], *, step_id: str | None = None) -> None:
```

Mutate the `errors` dict in place to add custom errors. The dict may already contain errors from rule engine validation. `step_id` is the container being validated (for `patch()`) or `None` (for `post()`).

### Frontend: External Errors

External errors are stored separately from `FormRuntimeState` (they are a React/UI concern, not a core engine concern). They are managed via the `ProtoFormContext`:

- **`externalErrors`**: `Record<FieldKey, string[]>` holding the current external errors
- **`setExternalErrors(errors)`**: Set all external errors wholesale (typically from a server response)
- **`clearExternalErrors()`**: Clear all external errors

Behavior:

- **Merged at read time**: `useFieldState()` appends external errors to the field's messages array as `"error"` type messages
- **Always visible**: External errors bypass `showErrorsOnTouch`, because if the server returned an error the user has already submitted
- **Cleared per-field on edit**: When the user changes a field, that field's external errors clear automatically. Other fields' external errors persist until the next server round-trip
- **`scrollToFirstError`** considers external errors when finding the first errored field

### Typical Flow

```
1. User clicks Next/Submit
2. Client rule engine validates (existing)
3. If valid: PATCH/POST to server
4. Server rule engine validates (existing)
5. Server validate() hook runs and adds custom errors
6. Response: 200 OK or 400 {"errors": {...}}
7. Frontend: setExternalErrors(response.errors)
8. useFieldState merges external errors into messages
9. User edits field → that field's external error clears
```

## 11. Scope, Non-Goals, and Extension Patterns

ProtoForm specifies **what a form is and how its state derives from values**.
It deliberately does not specify persistence, identity, or orchestration.
When a requirement falls outside the schema's vocabulary, use the sanctioned
pattern below rather than extending the engine.

### In scope
Field/layout/rule definitions; derived state (visibility, required, valid,
messages, completeness); expression evaluation with identical semantics in
every engine; step progression and per-step validation; the server error
channel (section 10).

### Out of scope (host-application concerns)

| Concern | Sanctioned pattern |
|---|---|
| **Async vendor steps** (identity verification, document processing, data enrichment) | Host runs the vendor flow (redirect/SDK/webhook), then merges results into form values, typically `hidden` fields (`verification_status`, `lookup_result`). Rules react to those values like any other: gate progression with a `blocking` affect on the status field, reveal sections when results arrive. |
| **Custom inputs** (lookups, uploads, embedded SDKs) | Per-field override or wrapper components; keep adapter chrome via `renderFieldChrome`. The component reads and writes the field's value, and the engine stays unaware of how the value was produced. |
| **Multi-party access / delegated authority** (multiple parties working on one submission with different views and permissions) | The host owns invitations, auth, and audit. The schema stays single: pass the acting party via `env` (e.g. `env('actor_role')`) and drive per-party views with `visible` / `read_only` / `disabled` affects. Per-section server checks use `validate_step` with the party's permitted containers. The engine never knows who is typing, only what the values and env are. |
| **Persistence, drafts, versioning** | Host stores values and schema versions; an application pins the schema version it started on. |
| **Approval chains, notifications, e-signature, payments** | Workflow layer above the form. A terminal container can host vendor embeds via custom components. |
| **App-specific metadata** | Namespace it under `meta.*` (e.g. `meta.integration`). Engines must preserve and ignore unknown keys. |

### Known limitations (candidate protocol additions)

- **General row aggregates**: `count`, `sum`, and `total_pct` are the only
  cross-row builtins. General `any()` / `every()` with nested expressions
  are deferred for parity reasons.
- **Content and action elements**: informational text blocks and trigger
  buttons are not schema elements. Today: custom components.
- **i18n**: labels and messages are single-language strings.

## 12. Repeating Groups (Repeaters)

A repeat container is a container whose `meta.type` is `"repeat"`. Its
children are field references that act as the row template, plus
optionally further repeat containers (nested repeats). Any non-repeat
container inside a repeat is a schema error.

```json
{ "id": "contacts",
  "meta": { "title": "Emergency contacts", "type": "repeat",
            "min": 1, "max": 3, "item_label": "Contact {index}" },
  "children": [ { "id": "contact_name" }, { "id": "contact_phone" } ] }
```

`min` defaults to 0 and `max` to null (unbounded). Row-template fields are
excluded from top-level field semantics, they exist only as row instances.

**Value model.** The repeat container's id keys one array of row objects:
`{ "contacts": [ { "contact_name": "Sam" }, ... ] }`. A non-array value
normalizes to an empty array.

**Row addressing.** Every place derived state and errors refer to a row
field, the key is `repeatId[index].fieldId` (e.g. `contacts[1].contact_phone`),
including `visible`/`valid`/`required`/`messages`, blocking targets,
touched state, and the server error channel (section 10). Nesting extends
the same form recursively: `teams[0].members[1].qual_name` addresses a
field in the second member row of the first team row. Engines expose
`rowKey` / `row_key`, `parseRowKey`, `templateFieldId`, and
`resolveValuePath` helpers; `resolveValuePath` recurses through nested
segments.

**Row-scoped rules.** A rule with `"scope": "<repeatId>"` evaluates once
per row instance (for a nested repeat, once per row of every parent
instance). Bare identifiers and `value()` resolve lexically: the row's own
values first, then each ancestor row outward, then top-level values, with
inner scopes shadowing outer ones. A rule scoped to a parent repeat can
aggregate over a child repeat (`count('qualifications')` inside
`scope: "members"` counts that member's own qualification rows). Affects whose target is a row-template
field apply to that row's instance; other targets apply globally.
`required_parent` on a scoped rule checks same-scope parents per row and
unscoped parents globally.

**Base state per row.** Each row instance starts visible and valid, with
`meta.required` / `meta.disabled` taken from the row-template field.

**Completeness.** A visible repeat container is complete when its row count
is within `min`/`max` and every visible, non-disabled, required row field
is valid and non-empty. For a nested repeat, `min`/`max` apply to each
parent row's own array independently, and a repeat is complete only when
every one of its instances satisfies its bounds and row fields. A
container that contains a repeat anywhere in its subtree is complete only
if that repeat (and its nested repeats) are complete. A hidden repeat (cascade included) is complete by
definition, and its row keys leave `visible`. A regular container is
complete only if the repeat containers among its descendants are complete.

**Error collection.** Row-count violations produce errors addressed to the
repeat container id ("At least N entries are required." / "At most N
entries are allowed."). For nested repeats the key names the specific
instance: a second team missing members yields an error under
`teams[1].members`. Row-field errors are addressed to row keys, nested or
not.

**Rendering.** The React layer renders one set of row fields per row plus
add/remove controls (adapters may take over via `renderRepeat`), rendering
nested repeats recursively inside their parent rows. It seeds `min` empty
rows on first render (including child minimums inside each seeded row) and
exposes `addRow`, `removeRow`, and `setRowValues(path, index, partial)`.
The path argument is the repeat id for a root repeat or a row-addressed
path for a nested one (`addRow("teams[0].members")`); `setRowValues` is
the bulk row write that lets a lookup component populate sibling fields in
one evaluation pass.

## 13. Computed Fields

A field with `meta.type` `"computed"` derives its value from an expression
in `meta.expr`:

```json
{ "id": "total", "meta": { "type": "computed", "label": "Total",
    "expr": "round(value('unit_price') * value('quantity'), 2)",
    "format": "currency" } }
```

**Evaluation.** Computed fields evaluate inside `evaluateRules`, before
rules run, in dependency order (references to other computed fields are
topologically sorted; cycles are rejected at `prepareForm`). Results are
written into the working values, which `evaluateRules` returns, so rules,
completeness, progression, and error collection all see computed values.

**Semantics.** Computed fields are always read-only and never required or
touched; `meta.required`/`meta.disabled` are ignored. Any evaluation
error, NaN, or infinity yields `null` (fail closed), including arithmetic
on empty inputs and division by zero. `format` is a renderer hint only.

**Message interpolation.** Affect messages may embed `{field_id}`
placeholders, replaced with the current value using a canonical number
format (integral numbers render without a decimal point, so both engines
produce identical text). Unknown placeholders are left as-is. Row-scoped
rules interpolate with the row's values.

## Full Example

```json
{
  "fields": [
    { "id": "name", "meta": { "type": "text", "label": "Full Name", "required": true,
        "properties": { "placeholder": "Jane Doe" } } },
    { "id": "age", "meta": { "type": "number", "label": "Age", "required": true } },
    { "id": "role", "meta": { "type": "select", "label": "Role",
        "properties": { "options": [{ "label": "User", "value": "user" },
                                     { "label": "Admin", "value": "admin" }] } } },
    { "id": "adminCode", "meta": { "type": "password", "label": "Admin Code" } }
  ],
  "layout": [{
    "id": "main",
    "meta": { "title": "Registration" },
    "children": [
      { "id": "name" },
      { "id": "age" },
      { "id": "role" },
      { "id": "adminCode" }
    ],
    "layout": [["name", "age"], ["role"], ["adminCode"]]
  }],
  "rules": [
    { "id": "age-range", "when": "between(0, 150)",
      "affects": [{ "target": "age", "valid": false, "blocking": true,
                    "message": "Age must be 0-150", "type": "error" }] },
    { "id": "show-admin", "when": "value('role') === 'admin'",
      "affects": [{ "target": "adminCode", "visible": true, "required": true }] },
    { "id": "hide-admin", "when": "value('role') !== 'admin'",
      "affects": [{ "target": "adminCode", "visible": false }] },
    { "id": "admin-length", "when": "minLength(6)", "required_parent": ["show-admin"],
      "affects": [{ "target": "adminCode", "valid": false,
                    "message": "Min 6 characters", "type": "error" }] }
  ]
}
```
