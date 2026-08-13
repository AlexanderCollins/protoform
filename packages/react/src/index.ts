// Re-export everything from core for convenience
export * from "@protoform/core";

// Adapter interface
export type {
  ProtoFormAdapter,
  FieldRenderProps,
  FieldChromeRenderProps,
  ContainerRenderProps,
  FormRenderProps,
  StepperRenderProps,
  RepeatRenderProps,
} from "./adapter";

// Components
export { ProtoForm } from "./ProtoForm";
export type { ProtoFormProps } from "./ProtoForm";

export { ProtoField, ProtoContainer, RepeatContainer, HTML_INPUT_TYPES } from "./renderers";

export { MultiStepWizard } from "./MultiStepWizard";
export type { MultiStepWizardProps, WizardStepResult } from "./MultiStepWizard";

// Context & Hooks
export {
  ProtoFormContext,
  useProtoForm,
  useFieldState,
  useContainerState,
  useFormErrors,
  scrollToFirstError,
  buildOptionsUrl,
  clearRemoteOptionsCache,
} from "./ProtoFormContext";
export type { ProtoFormContextValue } from "./ProtoFormContext";
