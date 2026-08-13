# Adapters

An adapter tells ProtoForm how to render fields, containers, and the form shell
using a specific UI framework. The core engine handles state, rules, and
layout -- the adapter handles markup and styling.

## The Adapter Interface

```ts
import type { ReactNode } from "react";
import type { Field, FieldKey, ContainerKey, Container, MessageKind } from "@protoform/core";

interface ProtoFormAdapter {
  renderField:       (props: FieldRenderProps)       => ReactNode;
  renderContainer:   (props: ContainerRenderProps)   => ReactNode;
  renderForm:        (props: FormRenderProps)        => ReactNode;
  renderStepper?:    (props: StepperRenderProps)     => ReactNode;
  renderFieldChrome?: (props: FieldChromeRenderProps) => ReactNode;
  renderRepeat?:     (props: RepeatRenderProps)      => ReactNode;
}
```

Each function receives a props object and returns a `ReactNode`.
Returning `null` from `renderField` signals "I don't handle this type" and
triggers the fallback chain (see below). `renderStepper` is optional --
adapters without it fall back to built-in step indicators.
`renderFieldChrome` is optional -- it wraps a caller-supplied `control` node
in the adapter's label/description/message chrome, so custom field components
can keep the adapter's look (see "Custom control, adapter chrome" below).

Fields with `meta.type === "hidden"` never reach the adapter -- the engine
renders nothing for them while keeping their value in state. Fields with
`meta.type === "computed"` reach `renderField` with `readOnly: true`.

`renderRepeat` is optional -- repeat containers render through a built-in
default (row blocks with add/remove buttons) unless the adapter provides
its own. It receives `{ id, container, rows, addRow, canAdd, removeRow,
canRemove, itemLabel, min, max }` where `rows` is an array of pre-rendered
row field groups.

Inside repeat rows, per-field overrides and wrappers registered under the
row-template field id apply to every row instance; a registration under an
exact row id (`assets[1].sku`) wins over the template registration.

## Render Props

### FieldRenderProps

| Prop         | Type                                       | Description                            |
| ------------ | ------------------------------------------ | -------------------------------------- |
| `id`         | `FieldKey`                                 | Unique field identifier                |
| `field`      | `Field`                                    | Schema definition (includes `meta`)    |
| `value`      | `any`                                      | Current value from form state          |
| `setValue`   | `(v: any) => void`                         | Update this field's value              |
| `visible`    | `boolean`                                  | Whether the field is visible           |
| `disabled`   | `boolean`                                  | Disabled by a rule                     |
| `required`   | `boolean`                                  | Required by a rule                     |
| `readOnly`   | `boolean`                                  | Read-only by a rule                    |
| `messages`   | `{ type: MessageKind; message: string }[]` | Validation / info messages             |
| `touched`    | `boolean`                                  | User has interacted with this field    |
| `showErrors` | `boolean`                                  | Whether errors should be shown now     |
| `optionsLoading` | `boolean?`                             | An `options_url` fetch is in flight    |
| `optionsQuery` | `string?`                                | Current query for a `{q}` options_url  |
| `setOptionsQuery` | `((q: string) => void)?`              | Set the query; re-fetches (debounced)  |

Options resolved from an `options_url` (and from rule-driven `options`
affects) are patched into `field.meta.properties.options` before your
renderer runs, so a select that reads `properties.options` needs no
changes to support fetched options. To support the async search select,
render a search input wired to `optionsQuery`/`setOptionsQuery` when
`properties.options_url` contains `{q}`. A `multiselect` value is an
array of option values; render it as a checkbox group or tag picker and
toggle values in and out of the array.

### ContainerRenderProps

| Prop         | Type            | Description                             |
| ------------ | --------------- | --------------------------------------- |
| `id`         | `ContainerKey`  | Unique container identifier             |
| `container`  | `Container`     | Schema definition (includes `meta`)     |
| `visible`    | `boolean`       | Whether the container is visible        |
| `disabled`   | `boolean`       | Disabled by a rule                      |
| `isComplete` | `boolean`       | All required descendants are satisfied  |
| `isCurrent`  | `boolean`       | This container is the active step       |
| `children`   | `ReactNode`     | Pre-rendered child fields / containers  |

### FormRenderProps

| Prop         | Type         | Description                                      |
| ------------ | ------------ | ------------------------------------------------ |
| `children`   | `ReactNode`  | Pre-rendered form content                        |
| `onSubmit`   | `() => void` | Call to trigger form submit                      |
| `showSubmit` | `boolean`    | Whether the adapter should render a submit button. Defaults to `true`. Set to `false` when the host component manages submission (e.g. multi-step wizards with their own Submit button). Controlled via the `showSubmitButton` prop on `<ProtoForm>`. |

### StepperRenderProps

Optional. When provided, `renderStepper` lets the adapter render a step indicator (progress bar, numbered circles, tabs, etc.) for multi-step forms.

| Prop             | Type                         | Description                                            |
| ---------------- | ---------------------------- | ------------------------------------------------------ |
| `steps`          | `Container[]`                | Ordered list of step containers                        |
| `currentStep`    | `number`                     | Zero-based index of the active step                    |
| `onStepClick`    | `(index: number) => void`    | Navigate to a step (subject to `canNavigateTo`)        |
| `canNavigateTo`  | `(index: number) => boolean` | Whether navigation to a given step index is allowed. Users can always go back; forward navigation requires all prior steps to be complete. |

## Using an Adapter

```tsx
import { ProtoForm } from "@protoform/react";
import { daisyuiAdapter } from "@protoform/adapter-daisyui";

<ProtoForm schema={schema} adapter={daisyuiAdapter} onSubmit={handleSubmit} />
```

When no adapter is provided, ProtoForm uses a minimal inline default that
delegates field rendering to the built-in fallback.

### Hiding the Submit Button

Pass `showSubmitButton={false}` to suppress the adapter's built-in submit
button. This is useful when the host component manages submission itself
(e.g. a multi-step wizard that shows Submit only on the final step):

```tsx
<ProtoForm schema={schema} adapter={daisyuiAdapter} showSubmitButton={false} autoLayout={false}>
  {() => <MultiStepWizard onSubmit={handleSubmit} />}
</ProtoForm>
```

## Fallback Chain

`ProtoField` resolves rendering in order:

1. **Per-field override** -- the `fields` prop for this field ID.
2. **Adapter's `renderField`** -- the adapter's implementation.
3. **Unstyled default** -- if the adapter returns `null`, a plain `<input>` / `<label>` fallback renders.

This means an adapter only needs to handle the field types it knows about.
Unknown types automatically fall through to the built-in default.

## Three Levels of Customization

### Per-field override

Replace a single field by ID. The component receives `{ id }` and can call
`useFieldState(id)` internally.

```tsx
<ProtoForm
  schema={schema}
  adapter={daisyuiAdapter}
  fields={{ referral_code: CustomReferralField }}
/>
```

### Custom control, adapter chrome

A per-field override normally replaces the whole field, including the
label and errors. When the adapter implements `renderFieldChrome`, an override can supply
just the control and keep the adapter's chrome:

```tsx
function CustomReferralField({ id }: { id: string }) {
  const fieldState = useFieldState(id);
  const { adapter } = useProtoForm();
  const control = <ReferralLookupInput value={fieldState.value} onChange={fieldState.setValue} />;
  return <>{adapter.renderFieldChrome?.({ id, ...fieldState, control }) ?? control}</>;
}
```

`unstyled` and `daisyui` implement `renderFieldChrome`; adapters without it
return `undefined`, so always provide a bare-control fallback as above.

### Per-type override

Wrap an existing adapter and intercept specific `field.meta.type` values:

```ts
const myAdapter: ProtoFormAdapter = {
  ...daisyuiAdapter,
  renderField: (props) => {
    if (props.field.meta.type === "currency") return <CurrencyInput {...props} />;
    return daisyuiAdapter.renderField(props);
  },
};
```

### Full custom layout

Disable auto-layout and place fields manually using hooks:

```tsx
import { ProtoForm, useFieldState, useContainerState } from "@protoform/react";

<ProtoForm schema={schema} adapter={myAdapter} autoLayout={false}>
  {({ Container, Field }) => (
    <div className="grid grid-cols-2">
      <Field id="first_name" />
      <Field id="last_name" />
      <Container id="address_section" />
    </div>
  )}
</ProtoForm>
```

`useFieldState(id)` and `useContainerState(id)` are available inside any
component rendered within `<ProtoForm>`.

## How to Build an Adapter

A minimal adapter that handles `text` and `select`, falling through for
everything else:

```ts
import type { ProtoFormAdapter } from "@protoform/react";

export const myAdapter: ProtoFormAdapter = {
  renderField: ({ id, field, value, setValue, disabled, required, readOnly, messages, showErrors }) => {
    switch (field.meta.type) {
      case "text":
        return (
          <div className="my-field">
            <label htmlFor={id}>{field.meta.label}</label>
            <input id={id} value={value ?? ""} onChange={(e) => setValue(e.target.value)}
              disabled={disabled} readOnly={readOnly} required={required} />
            {showErrors && messages.filter((m) => m.type === "error").map((m, i) => (
              <span key={i} className="my-error">{m.message}</span>
            ))}
          </div>
        );
      case "select":
        // ... select rendering
        return null; // placeholder
      default:
        return null; // fall through to unstyled default
    }
  },

  renderContainer: ({ container, isComplete, children }) => (
    <fieldset>
      <legend>{container.meta.title}{isComplete && " (complete)"}</legend>
      {children}
    </fieldset>
  ),

  renderForm: ({ children, onSubmit, showSubmit }) => (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {children}
      {showSubmit !== false && <button type="submit">Submit</button>}
    </form>
  ),

  // Optional -- omit if your adapter doesn't need custom step UI
  renderStepper: ({ steps, currentStep, onStepClick, canNavigateTo }) => (
    <nav>
      {steps.map((step, i) => (
        <button key={step.id} disabled={!canNavigateTo(i)} onClick={() => onStepClick(i)}
          style={{ fontWeight: i === currentStep ? "bold" : "normal" }}>
          {step.meta.title}
        </button>
      ))}
    </nav>
  ),
};
```

**Key points:**

- Return `null` from `renderField` for types you don't handle.
- `children` in `renderContainer` is already rendered -- just place it.
- Respect `showSubmit` in `renderForm` -- when `false`, don't render a submit button.
- `renderStepper` is optional. When omitted, multi-step forms fall back to built-in step indicators.
- List your UI framework as a `peerDependency`, not a direct dependency.

## Available Adapters

| Package                        | UI Framework    | `renderStepper` |
| ------------------------------ | --------------- | --------------- |
| `@protoform/adapter-unstyled`  | BEM class names | Yes             |
| `@protoform/adapter-tailwind`  | Tailwind CSS    | Yes             |
| `@protoform/adapter-shadcn`    | shadcn/ui       | Yes             |
| `@protoform/adapter-daisyui`   | DaisyUI         | Yes             |
| `@protoform/adapter-antd`      | Ant Design      | Yes             |
| `@protoform/adapter-chakra`    | Chakra UI       | Yes             |
| `@protoform/adapter-material`  | Material UI     | Yes             |
