import { useState, useEffect, useMemo, useCallback } from "react";
import type { Form, FormValues } from "@protoform/core";
import type { ProtoFormAdapter } from "@protoform/react";
import { unstyledAdapter } from "@protoform/adapter-unstyled";
import { tailwindAdapter } from "@protoform/adapter-tailwind";
import { shadcnAdapter } from "@protoform/adapter-shadcn";
import { daisyuiAdapter } from "@protoform/adapter-daisyui";
import { antdAdapter } from "@protoform/adapter-antd";
import { demoFormSchema } from "./schemas/demo1";
import { multiStepFormSchema } from "./schemas/demo2";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useSystemDarkMode } from "./hooks/useSystemDarkMode";
import { clearAll } from "./lib/persistence";
import { generateCode } from "./lib/codeGenerator";
import { DemoControls } from "./components/DemoControls";
import { FormPreview } from "./components/FormPreview";
import { CustomReferenceField } from "./components/CustomReferenceField";
import { SchemaEditor } from "./components/SchemaEditor";
import { CodeViewer } from "./components/CodeViewer";
import { ResetButton } from "./components/ResetButton";
import type { ProgressStyle } from "./components/MultiStepWizard";
import { highlightJson } from "./lib/highlight";

// --- Adapter registry ---
const adapters: Record<string, ProtoFormAdapter> = {
  unstyled: unstyledAdapter,
  tailwind: tailwindAdapter,
  shadcn: shadcnAdapter,
  daisyui: daisyuiAdapter,
  antd: antdAdapter,
};
const adapterNames = Object.keys(adapters);

// --- Default schema JSON ---
const DEFAULT_SCHEMA_JSON: Record<string, string> = {
  single: JSON.stringify(demoFormSchema, null, 2),
  multi: JSON.stringify(multiStepFormSchema, null, 2),
};

// --- Schema validation ---
function parseSchema(jsonText: string): { schema: Form | null; error: string | null } {
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed.fields)) return { schema: null, error: "Schema must have a 'fields' array" };
    if (!Array.isArray(parsed.layout)) return { schema: null, error: "Schema must have a 'layout' array" };
    if (!Array.isArray(parsed.rules)) return { schema: null, error: "Schema must have a 'rules' array" };
    return { schema: parsed as Form, error: null };
  } catch (e) {
    return { schema: null, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

export function App() {
  const darkMode = useSystemDarkMode();

  // --- Persisted state ---
  const [adapterName, setAdapterName] = useLocalStorage("adapterName", "unstyled");
  const [demoType, setDemoType] = useLocalStorage<"single" | "multi">("demoType", "single");
  const [showCustomReferral, setShowCustomReferral] = useLocalStorage("showCustomReferral", true);
  const [schemaJsonSingle, setSchemaJsonSingle] = useLocalStorage("schemaJson_single", DEFAULT_SCHEMA_JSON.single);
  const [schemaJsonMulti, setSchemaJsonMulti] = useLocalStorage("schemaJson_multi", DEFAULT_SCHEMA_JSON.multi);
  const [formValuesSingle, setFormValuesSingle] = useLocalStorage<FormValues>("formValues_single", {});
  const [formValuesMulti, setFormValuesMulti] = useLocalStorage<FormValues>("formValues_multi", {});
  const [progressStyle, setProgressStyle] = useLocalStorage<ProgressStyle>("progressStyle", "adapter");

  // --- Per-demo state ---
  const formValues = demoType === "single" ? formValuesSingle : formValuesMulti;
  const setFormValues = demoType === "single" ? setFormValuesSingle : setFormValuesMulti;

  // --- Schema parsing ---
  const [schemaVersion, setSchemaVersion] = useState(0);
  const schemaJsonText = demoType === "single" ? schemaJsonSingle : schemaJsonMulti;
  const [parsedSchema, setParsedSchema] = useState<Form | null>(() => parseSchema(schemaJsonText).schema);
  const [schemaError, setSchemaError] = useState<string | null>(() => parseSchema(schemaJsonText).error);

  // Re-parse when demo type changes
  useEffect(() => {
    const text = demoType === "single" ? schemaJsonSingle : schemaJsonMulti;
    const { schema, error } = parseSchema(text);
    setSchemaError(error);
    if (schema) {
      setParsedSchema(schema);
      setSchemaVersion((v) => v + 1);
    }
  }, [demoType, schemaJsonSingle, schemaJsonMulti]);

  // --- Tab state for right panel ---
  const [rightTab, setRightTab] = useState<"schema" | "code">("schema");

  // --- Generated code (readonly) ---
  const codeText = useMemo(
    () => generateCode({ adapterName, demoType, showCustomReferral }),
    [adapterName, demoType, showCustomReferral],
  );

  // --- Derived ---
  const adapter = adapters[adapterName] || unstyledAdapter;
  const fieldOverrides = useMemo(
    () => (showCustomReferral && demoType === "single" ? { referral_code: CustomReferenceField } : {} as Record<string, never>),
    [showCustomReferral, demoType],
  );

  // --- Form value change handler ---
  const handleFormChange = useCallback(
    (values: FormValues) => setFormValues(values),
    [setFormValues],
  );

  const handleSubmit = useCallback((values: FormValues) => {
    console.log("Submitted:", values);
    alert("Form submitted! Check console.");
  }, []);

  // --- Reset ---
  const handleReset = useCallback(() => {
    clearAll();
    // Reset all state to defaults
    setAdapterName("unstyled");
    setDemoType("single");
    setShowCustomReferral(true);
    setSchemaJsonSingle(DEFAULT_SCHEMA_JSON.single);
    setSchemaJsonMulti(DEFAULT_SCHEMA_JSON.multi);
    setFormValuesSingle({});
    setFormValuesMulti({});
    setProgressStyle("adapter");
    setRightTab("schema");
    // Re-parse default schema
    const { schema } = parseSchema(DEFAULT_SCHEMA_JSON.single);
    setParsedSchema(schema);
    setSchemaError(null);
    setSchemaVersion((v) => v + 1);
  }, [setAdapterName, setDemoType, setShowCustomReferral, setSchemaJsonSingle, setSchemaJsonMulti, setFormValuesSingle, setFormValuesMulti, setProgressStyle]);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "var(--pf-text)" }}>ProtoForm Demo</h1>
          <p style={{ color: "var(--pf-text-secondary)", margin: "4px 0 0", fontSize: "14px" }}>
            Schema-driven forms with adapter-based rendering
          </p>
        </div>
        <ResetButton onReset={handleReset} />
      </div>

      {/* Controls */}
      <div style={{ marginBottom: "20px" }}>
        <DemoControls
          adapterName={adapterName}
          adapterNames={adapterNames}
          onAdapterChange={setAdapterName}
          demoType={demoType}
          onDemoTypeChange={setDemoType}
          showCustomReferral={showCustomReferral}
          onCustomReferralChange={setShowCustomReferral}
          progressStyle={progressStyle}
          onProgressStyleChange={setProgressStyle}
        />
      </div>

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* Left panel — Form Preview (55%) */}
        <div style={{ flex: "0 0 55%", minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "var(--pf-text-muted)", marginBottom: "8px", letterSpacing: "0.05em" }}>
            Form Preview
          </div>
          <FormPreview
            parsedSchema={parsedSchema}
            schemaVersion={schemaVersion}
            adapter={adapter}
            demoType={demoType}
            darkMode={darkMode}
            fieldOverrides={fieldOverrides}
            progressStyle={progressStyle}
            initialValues={formValues}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
          />
        </div>

        {/* Right panel (45%) */}
        <div style={{ flex: "0 0 calc(45% - 24px)", minWidth: 0 }}>
          {/* Tab buttons */}
          <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
            {(["schema", "code"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  padding: "6px 16px",
                  fontSize: "13px",
                  fontWeight: 500,
                  border: "1px solid var(--pf-border)",
                  borderBottom: rightTab === tab ? "2px solid #3b82f6" : "1px solid var(--pf-border)",
                  borderRadius: "6px 6px 0 0",
                  background: rightTab === tab ? "var(--pf-bg-tab-active)" : "var(--pf-bg-tab)",
                  color: rightTab === tab ? "var(--pf-text)" : "var(--pf-text-secondary)",
                  cursor: "pointer",
                }}
              >
                {tab === "schema" ? "Schema" : "Code"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {rightTab === "schema" ? (
              <SchemaEditor
                schema={parsedSchema}
                error={schemaError}
              />
            ) : (
              <CodeViewer code={codeText} />
            )}
          </div>
        </div>
      </div>

      {/* Form State Payload */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "var(--pf-text-muted)", marginBottom: "8px", letterSpacing: "0.05em" }}>
          Form State Payload
        </div>
        <div style={{
          background: "#1e1e2e", borderRadius: "8px", padding: "16px",
          maxHeight: "300px", overflow: "auto",
        }}>
          <pre
            dangerouslySetInnerHTML={{ __html: highlightJson(JSON.stringify(formValues, null, 2) || "{}") }}
            style={{
              margin: 0, color: "#cdd6f4",
              fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace",
              fontSize: "12.5px", lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}
          />
        </div>
      </div>
    </div>
  );
}
