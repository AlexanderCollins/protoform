# ProtoForm Roadmap

The two headline v1.3 additions below are **shipped**: specified in the
protocol (spec sections 12 and 13), implemented in both engines in the same
release, and locked in by conformance vectors. The design notes are kept
here for the rationale; the spec is normative.

---

## v1.3.1: Repeating groups (repeaters): shipped

This is scheduled first because repeating structures appear in most real
forms: additional contacts, work history, items in an order. "Add another"
is the most common feature request a form system gets, and today it
requires custom components outside the protocol.

### Schema shape (draft)

A repeat container is a container whose `meta.type` is `"repeat"`:

```json
{
  "id": "contacts",
  "meta": { "title": "Emergency contacts", "type": "repeat",
            "min": 1, "max": null, "item_label": "Contact {index}" },
  "children": [ { "id": "contact_name" }, { "id": "contact_phone" }, { "id": "relationship" } ]
}
```

### Value model

The repeat container's id keys one array of row objects in values:

```json
{ "contacts": [
    { "contact_name": "Sam Wu", "contact_phone": "0400 000 000", "relationship": "partner" },
    { "contact_name": "Ada Osei", "contact_phone": "0400 111 111", "relationship": "friend" } ] }
```

### Row addressing

Everywhere errors, messages, and touched state appear, row fields are
addressed as `repeatId[index].fieldId` (for example
`contacts[1].contact_phone`). This includes the server error channel (spec
§10), so a backend can reject one specific row's field.

### Row-scoped rules

A rule may declare `"scope": "<repeatId>"`. Scoped rules evaluate once per
row. Bare identifiers and `value()` resolve within the row, and affects
target row-local fields:

```json
{ "id": "phone-required", "scope": "contacts",
  "when": "isEmpty(contact_phone)",
  "affects": [{ "target": "contact_phone", "valid": false, "message": "Phone required" }] }
```

### Aggregates (cross-row expressions)

Three new builtins, available to unscoped rules:

- `count('contacts')` returns the number of rows
- `sum('order_items', 'quantity')` returns the numeric sum of one field across rows
- `total_pct('allocations', 'pct')` is a convenience form of `sum` asserted against 100

General `any()` and `every()` with nested expressions are deferred because
they complicate the parity story. `count` and `sum` cover the common cases.

### Completeness and progression

A repeat container is complete when it has at least `min` rows and every
row's visible required fields are valid and non-empty. This uses the same
definition as spec §7. `max: null` means unbounded.

### Mixed row shapes (discriminated rows)

Rows in one repeat need not look alike. A discriminator field plus
row-scoped visibility rules gives per-row shapes. An order item can be
physical or digital and show different fields per type. Hidden row fields
are exempt from that row's completeness, following the same cascade rule as
spec §4:

```json
{ "id": "order_items", "meta": { "title": "Items", "type": "repeat", "min": 1 },
  "children": [ { "id": "item_type" }, { "id": "sku" }, { "id": "name" },
                { "id": "weight_kg" }, { "id": "shipping_class" },
                { "id": "download_format" }, { "id": "license_seats" } ] }
```
```json
{ "id": "physical-fields", "scope": "order_items",
  "when": "item_type !== 'physical'",
  "affects": [ { "target": "weight_kg", "visible": false },
               { "target": "shipping_class", "visible": false } ] }
```

### Row-scoped lookup / integration fields

Custom field components (overrides and wrappers, both standard extension
points) work inside rows. The component receives row-scoped field state, so
its `setValue` writes into its own row. A row-scoped `setValues(partial)`
lets a lookup populate sibling fields in one pass. A catalog-lookup flow
composes from existing protocol pieces:

1. `sku` carries an app-specific `meta.integration` extension (unknown meta
   keys are preserved, spec §2), and the host renders it with a lookup
   component.
2. The lookup resolves the item and writes `name`, `weight_kg`, and a
   hidden `sku_verified` flag into the row via row-scoped `setValues`.
3. A row-scoped rule locks the populated fields:
   ```json
   { "id": "lock-looked-up", "scope": "order_items",
     "when": "sku_verified === true",
     "affects": [ { "target": "name", "read_only": true },
                  { "target": "weight_kg", "read_only": true } ] }
   ```
4. The server re-evaluates the same rules per row. Its `validate()` hook
   can re-check the looked-up values and address an objection to exactly
   `order_items[2].sku`.

### Engine/UI split

Engines own the value model, row-scoped evaluation, addressing, and
completeness. The React layer renders rows through the adapter contract
(`renderRepeat`, optional, with a built-in default that provides add and
remove controls) and exposes row-scoped field state and `setValues` to
custom components. Nesting shipped as a follow-up in the same protocol
line: repeats may contain repeat containers to any depth, with row keys
extending recursively (`teams[0].members[1].qual_name`), `min`/`max`
applied per parent row, and rule value resolution walking the row chain
lexically (inner rows shadow ancestor rows shadow globals).

---

## v1.3.2: Computed fields + arithmetic: shipped

Totals, percentages, derived quantities, and "these allocations must sum
to 100" all require arithmetic the expression grammar does not have. Today
these calculations live in host code, which means the server cannot
re-derive them. That is the same duplication the protocol removes for
validation, so it should be removed here too.

### Grammar additions

`+ - * /` operators plus `round(x, dp?)`, `min(...)`, and `max(...)`
builtins. These are small and portable, added to both parsers with
conformance vectors for precedence and coercion edges.

### Schema shape (draft)

```json
{ "id": "total", "meta": { "type": "computed", "label": "Total",
    "expr": "round(value('unit_price') * value('quantity'), 2)",
    "format": "currency" } }
```

### Semantics

- Computed fields evaluate inside `evaluateRules`, before rules run, in
  dependency (topological) order. Cycles are rejected at `prepareForm`.
- Results are written into values and are read-only. They are excluded
  from required and touched semantics.
- Both engines compute identically, so the server can recompute any
  derived figure a client submits instead of trusting it.
- Non-numeric inputs make a computed value `null` (fail closed), never NaN.

Message interpolation (`"That's {total} in total"`) is included in this
change.

---

## v1.4: Wire format, wizard, dynamic options, meta-schema: shipped

- Standardized wire format: validation failures are RFC 9457
  `application/problem+json` responses; success responses carry a
  `values` object so servers can push computed or enriched values back to
  a live session (`applyServerValues` on the client).
- `MultiStepWizard` promoted into `@protoform/react` as a first-class
  component.
- Rule-driven select options: an `options` affect swaps a field's option
  set, giving portable cascading selects.
- `warning` message kind for non-blocking advisory notices.
- Meta-schema: `schema/protoform.schema.json` validates ProtoForm schemas
  themselves, so machine-generated schemas can be linted before they reach
  an engine. The conformance runner applies it to every vector.
- Nested repeats (see above).

## v1.5: HTML type coverage + async options: shipped

- New field types: `tel`, `url`, `time`, `datetime`, `range`, and
  `multiselect` (value is an array of option values; `count()` and
  `.includes()` work on it unchanged). Radio and multiselect render as
  real control groups in the maintained adapters.
- `properties.options_url`: a URL the client fetches options from. A
  `{q}` placeholder makes it a search-driven async select. Rendering
  contract only: engines never fetch, and membership checks belong in the
  server `validate()` hook.
- `properties.searchable` on `multiselect`: client-side filtering over
  the loaded options, no request involved.

## Under consideration (unscheduled)

- Content and action elements: informational text blocks and trigger
  buttons as schema elements rather than custom components.
- General `any()` / `every()` row aggregates with nested expressions.
- Rarely-used HTML input types: `color`, `month`, `week`, `search`.

## Non-goals

The following are deliberately outside the protocol (see spec §11 for the
recommended patterns): persistence and submission state, identity and
multi-party workflow, async vendor orchestration, payment execution,
approval chains. Calculation belongs in the schema. Workflow belongs to
the host.

Current limitations, stated plainly:

- Bindings are React-only. The core engine is framework-free TypeScript,
  and Vue or Svelte bindings would be welcome contributions.
- No i18n. Labels and messages are single-language strings today.
- Accessibility depends on the adapter. The unstyled adapter emits
  semantic HTML (labels, fieldsets). Adapters carry their own a11y
  responsibility and no WCAG conformance is claimed yet.
