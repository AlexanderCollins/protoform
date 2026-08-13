interface CodeGenOptions {
  adapterName: string;
  demoType: "single" | "multi";
  showCustomReferral: boolean;
}

const ADAPTER_IMPORTS: Record<string, string> = {
  unstyled: `import { unstyledAdapter } from "@protoform/adapter-unstyled";`,
  tailwind: `import { tailwindAdapter } from "@protoform/adapter-tailwind";`,
  shadcn: `import { shadcnAdapter } from "@protoform/adapter-shadcn";`,
  daisyui: `import { daisyuiAdapter } from "@protoform/adapter-daisyui";`,
};

const ADAPTER_VAR: Record<string, string> = {
  unstyled: "unstyledAdapter",
  tailwind: "tailwindAdapter",
  shadcn: "shadcnAdapter",
  daisyui: "daisyuiAdapter",
};

export function generateCode({ adapterName, demoType, showCustomReferral }: CodeGenOptions): string {
  const adapterImport = ADAPTER_IMPORTS[adapterName] || ADAPTER_IMPORTS.unstyled;
  const adapterVar = ADAPTER_VAR[adapterName] || ADAPTER_VAR.unstyled;

  if (demoType === "single") {
    const protoformImports = showCustomReferral
      ? `import { registerFunction, registerTemplate } from "@protoform/core";
import { ProtoForm, useFieldState } from "@protoform/react";`
      : `import { ProtoForm } from "@protoform/react";`;

    const referralComponent = showCustomReferral
      ? `
// Extensibility API: register a custom expression function, then a rule
// template that delegates to it. The schema's "rule_validate_referral"
// rule simply says: when: "referralInvalid".
registerFunction("referralCodeInvalid", (code) => {
  if (typeof code !== "string" || code === "") return false;
  if (!/^[A-Z]{3}-\\d{4}$/.test(code)) return true;
  const sum = code.slice(4).split("").reduce((acc, d) => acc + Number(d), 0);
  return sum % 7 !== 0; // toy checksum
});
registerTemplate("referralInvalid", {
  params: ["fieldId"],
  expression: "referralCodeInvalid(value('\${fieldId}'))",
});

// Custom field override for the referral code
function CustomReferenceField({ id }) {
  const { field, value, setValue, visible, disabled, required, messages, showErrors } = useFieldState(id);
  if (!visible) return null;
  const errors = showErrors ? messages.filter((m) => m.type === "error") : [];
  return (
    <div style={{ padding: 12, border: "2px dashed #6366f1", borderRadius: 8 }}>
      <label>{field.meta.label}{required && " *"}</label>
      <input
        value={value || ""}
        onChange={(e) => {
          const raw = e.target.value.toUpperCase().replace(/\\s+/g, "");
          const formatted = raw.replace(/^([A-Z]{3})(?!-)(\\d)/, "$1-$2");
          setValue(formatted);
        }}
        disabled={disabled}
        placeholder="PFX-3400"
      />
      {errors.map((msg, i) => <div key={i} style={{ color: "red" }}>{msg.message}</div>)}
    </div>
  );
}
`
      : "";

    const fieldsAttr = showCustomReferral ? `\n      fields={{ referral_code: CustomReferenceField }}` : "";

    return `import React from "react";
${protoformImports}
${adapterImport}
import { demoFormSchema } from "./schemas/demo1";
${referralComponent}
export function App() {
  return (
    <ProtoForm
      schema={demoFormSchema}
      adapter={${adapterVar}}${fieldsAttr}
      onSubmit={(values) => console.log("Submitted:", values)}
    />
  );
}`;
  }

  // Multi-step wizard
  return `import React, { useState, useEffect } from "react";
import { ProtoForm, useProtoForm, ProtoContainer } from "@protoform/react";
${adapterImport}
import { multiStepFormSchema } from "./schemas/demo2";

function MultiStepWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const { prepared, state, touchContainerFields, setCurrentContainer } = useProtoForm();

  const steps = prepared.form.layout;
  const stepIds = steps.map((s) => s.id);

  // Keep form context in sync with the active step
  useEffect(() => {
    setCurrentContainer(stepIds[currentStep]);
  }, [currentStep, stepIds, setCurrentContainer]);

  const handleNext = () => {
    const id = stepIds[currentStep];
    if (!state.progress.completeContainers.has(id)) {
      touchContainerFields(id);
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  return (
    <div>
      {/* Step indicators */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {steps.map((step, idx) => (
          <button key={step.id} onClick={() => setCurrentStep(idx)}>
            {idx + 1}. {step.meta.title}
            {state.progress.completeContainers.has(step.id) && " ✓"}
          </button>
        ))}
      </div>

      <ProtoContainer id={stepIds[currentStep]} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button onClick={() => setCurrentStep((p) => Math.max(p - 1, 0))} disabled={currentStep === 0}>
          Previous
        </button>
        {currentStep < steps.length - 1 ? (
          <button onClick={handleNext}>Next</button>
        ) : (
          <button onClick={() => console.log("Submit:", state.values)}>Submit</button>
        )}
      </div>
    </div>
  );
}

export function App() {
  return (
    <ProtoForm
      schema={multiStepFormSchema}
      adapter={${adapterVar}}
      autoLayout={false}
    >
      <MultiStepWizard />
    </ProtoForm>
  );
}`;
}
