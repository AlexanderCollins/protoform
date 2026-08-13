import type { ComponentType } from "react";
import type { Form, FormValues } from "@protoform/core";
import type { ProtoFormAdapter, FieldKey } from "@protoform/react";
import { ProtoForm, useProtoForm } from "@protoform/react";
import { MultiStepWizard } from "./MultiStepWizard";
import type { ProgressStyle } from "./MultiStepWizard";

/** Wrapper that pulls current values from context to pass to onSubmit */
function MultiStepWizardWithSubmit({ progressStyle, onSubmit }: {
  progressStyle: ProgressStyle;
  onSubmit?: (values: FormValues) => void;
}) {
  const { state } = useProtoForm();
  return (
    <MultiStepWizard
      progressStyle={progressStyle}
      onSubmit={() => { if (onSubmit) onSubmit(state.values); }}
    />
  );
}

interface FormPreviewProps {
  parsedSchema: Form | null;
  schemaVersion: number;
  adapter: ProtoFormAdapter;
  demoType: "single" | "multi";
  darkMode?: boolean;
  fieldOverrides: Record<string, ComponentType<{ id: FieldKey }>>;
  progressStyle: ProgressStyle;
  initialValues?: FormValues;
  onChange?: (values: FormValues) => void;
  onSubmit?: (values: FormValues) => void;
}

export function FormPreview({
  parsedSchema, schemaVersion, adapter, demoType, darkMode,
  fieldOverrides, progressStyle, initialValues, onChange, onSubmit,
}: FormPreviewProps) {
  return (
    <div style={{
      border: "1px solid var(--pf-border)",
      borderRadius: "12px",
      padding: "24px",
      background: "var(--pf-bg-card)",
      boxShadow: "var(--pf-shadow-card)",
      minHeight: "400px",
    }}>
      {!parsedSchema ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "300px", color: "var(--pf-text-muted)", fontSize: "14px", textAlign: "center",
        }}>
          <div>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>{ "{}" }</div>
            <div>Invalid schema JSON.</div>
            <div>Fix the errors in the Schema tab to see the form.</div>
          </div>
        </div>
      ) : demoType === "single" ? (
        <ProtoForm
          key={`single-${schemaVersion}`}
          schema={parsedSchema}
          adapter={adapter}
          darkMode={darkMode}
          fields={fieldOverrides}
          initialValues={initialValues}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      ) : (
        <ProtoForm
          key={`multi-${schemaVersion}`}
          schema={parsedSchema}
          adapter={adapter}
          darkMode={darkMode}
          autoLayout={false}
          showSubmitButton={false}
          initialValues={initialValues}
          onChange={onChange}
        >
          <MultiStepWizardWithSubmit
            progressStyle={progressStyle}
            onSubmit={onSubmit}
          />
        </ProtoForm>
      )}
    </div>
  );
}
