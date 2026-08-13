import type { ReactNode } from "react";
import type {
  Field,
  FieldKey,
  ContainerKey,
  Container,
  MessageKind,
} from "@protoform/core";

/** Props passed to an adapter's field renderer */
export interface FieldRenderProps {
  id: FieldKey;
  field: Field;
  value: any;
  setValue: (v: any) => void;
  visible: boolean;
  disabled: boolean;
  required: boolean;
  readOnly: boolean;
  messages: { type: MessageKind; message: string }[];
  touched: boolean;
  showErrors: boolean;
  darkMode?: boolean;
  /** True while an options_url fetch is in flight (spec §2). */
  optionsLoading?: boolean;
  /** Search query for a search-driven options_url ("{q}" placeholder). */
  optionsQuery?: string;
  /** Set the options_url search query; re-fetches (debounced). */
  setOptionsQuery?: (q: string) => void;
}

/** Props passed to an adapter's container renderer */
export interface ContainerRenderProps {
  id: ContainerKey;
  container: Container;
  visible: boolean;
  disabled: boolean;
  isComplete: boolean;
  isCurrent: boolean;
  children: ReactNode;
  darkMode?: boolean;
}

/** Props passed to an adapter's form renderer */
export interface FormRenderProps {
  children: ReactNode;
  onSubmit: () => void;
  /** When false, the adapter should NOT render a submit button (e.g. multi-step wizards manage their own). Defaults to true. */
  showSubmit?: boolean;
  darkMode?: boolean;
}

/** Props passed to an adapter's optional field-chrome renderer */
export interface FieldChromeRenderProps extends FieldRenderProps {
  /** The custom control to wrap in the adapter's label/description/message chrome */
  control: ReactNode;
}

/** Props passed to an adapter's optional repeat renderer */
export interface RepeatRenderProps {
  id: ContainerKey;
  /** Value path of this instance-array — equals `id` for root repeats,
   * "parent[0].child" for nested ones. Pass to addRow/removeRow/setRowValues. */
  path: string;
  container: Container;
  /** Pre-rendered row contents (fields only — wrap them in your row chrome) */
  rows: ReactNode[];
  addRow: () => void;
  canAdd: boolean;
  removeRow: (index: number) => void;
  canRemove: boolean;
  itemLabel: (index: number) => string;
  min: number;
  max: number | null;
  darkMode?: boolean;
}

/** Props passed to an adapter's optional stepper renderer */
export interface StepperRenderProps {
  steps: {
    id: string;
    title: string;
    subtitle?: string;
    isComplete: boolean;
    isCurrent: boolean;
  }[];
  currentStep: number;
  onStepClick: (index: number) => void;
  /** Returns true if the user is allowed to navigate to the given step index. */
  canNavigateTo: (index: number) => boolean;
  darkMode?: boolean;
}

/** The adapter contract */
export interface ProtoFormAdapter {
  renderField: (props: FieldRenderProps) => ReactNode;
  renderContainer: (props: ContainerRenderProps) => ReactNode;
  renderForm: (props: FormRenderProps) => ReactNode;
  /** Optional stepper for multi-step wizards. If not provided, the wizard uses a built-in default. */
  renderStepper?: (props: StepperRenderProps) => ReactNode;
  /** Optional: wrap a custom control in this adapter's field chrome (label,
   * description, messages). Lets per-field overrides and wrappers supply their
   * own input while keeping the adapter's look. */
  renderFieldChrome?: (props: FieldChromeRenderProps) => ReactNode;
  /** Optional: render a repeat container (rows + add/remove controls).
   * When omitted, a built-in default renders. */
  renderRepeat?: (props: RepeatRenderProps) => ReactNode;
}
