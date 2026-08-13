import React, { useState, useRef } from "react";
import type { ProtoFormAdapter, FieldRenderProps, ContainerRenderProps, FormRenderProps, StepperRenderProps } from "@protoform/react";
import { HTML_INPUT_TYPES } from "@protoform/react";
import { Input, Select, Checkbox, Radio, DatePicker, InputNumber, Card, Steps, ConfigProvider, theme as antdTheme } from "antd";
import dayjs from "dayjs";

const { TextArea } = Input;

// Dark mode token overrides for antd components (neutral grays, no blue tint)
const DARK_TOKEN = {
  colorBgContainer: "#1f1f1f",
  colorBgElevated: "#1f1f1f",
  colorBorder: "#3a3a3a",
  colorBorderSecondary: "#3a3a3a",
  colorText: "rgba(255,255,255,0.85)",
  colorTextSecondary: "rgba(255,255,255,0.65)",
  colorTextTertiary: "rgba(255,255,255,0.45)",
  colorTextQuaternary: "rgba(255,255,255,0.25)",
  colorBgBase: "#141414",
  colorFillSecondary: "rgba(255,255,255,0.06)",
  colorFillTertiary: "rgba(255,255,255,0.04)",
};

function AntdFileDropzone({ id, value, setValue, disabled, accept, multiple, hasError, dk }: {
  id: string; value: any; setValue: (v: any) => void; disabled?: boolean; accept?: string; multiple?: boolean; hasError?: boolean; dk?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const files: { name: string }[] = Array.isArray(value) ? value : [];

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || disabled) return;
    const arr = Array.from(fileList);
    setValue(multiple ? arr : arr.slice(0, 1));
  };

  return (
    <div>
      <div
        style={{
          border: `2px dashed ${dragOver ? "#1677ff" : hasError ? "#ff4d4f" : dk ? "#3a3a3a" : "#d9d9d9"}`,
          borderRadius: "8px", padding: "24px", textAlign: "center",
          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
          transition: "border-color 0.2s",
          backgroundColor: dragOver ? (dk ? "#111a2c" : "#e6f4ff") : undefined,
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <p style={{ fontSize: "14px", color: dk ? "rgba(255,255,255,0.45)" : "#666" }}>Drop files here or click to browse</p>
        {accept && <p style={{ fontSize: "12px", color: dk ? "rgba(255,255,255,0.3)" : "#999", marginTop: "4px" }}>{accept}</p>}
      </div>
      <input ref={inputRef} id={id} type="file" style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} accept={accept} multiple={multiple} disabled={disabled} />
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
          {files.map((f, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", backgroundColor: dk ? "#1f1f1f" : "#f5f5f5", color: dk ? "rgba(255,255,255,0.85)" : "#333", border: `1px solid ${dk ? "#3a3a3a" : "#d9d9d9"}` }}>{f.name || `File ${i + 1}`}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function renderField(props: FieldRenderProps): React.ReactNode {
  const { id, field, value, setValue, disabled, required, readOnly, messages, showErrors, darkMode } = props;
  const dk = darkMode ?? false;
  const errorMessages = showErrors ? messages.filter((m) => m.type === "error") : [];
  const infoMessages = showErrors ? messages.filter((m) => m.type === "info") : [];
  const hasError = errorMessages.length > 0;
  const errorMsg = errorMessages[0]?.message;
  const status = hasError ? "error" as const : undefined;

  let input: React.ReactNode;
  switch (field.meta.type) {
    case "checkbox":
      return (
        <div style={{ marginBottom: 16 }}>
          <Checkbox checked={value === true} onChange={(e) => setValue(e.target.checked)} disabled={disabled}>
            <span style={{ color: dk ? "rgba(255,255,255,0.85)" : undefined }}>{field.meta.label}</span>
          </Checkbox>
          {errorMsg && <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}>{errorMsg}</div>}
          {infoMessages.map((msg, i) => <div key={i} style={{ color: "#1677ff", fontSize: 12, marginTop: 4 }}>{msg.message}</div>)}
        </div>
      );
    case "select":
      input = (
        <Select
          value={value || undefined}
          onChange={(val) => setValue(val)}
          disabled={disabled}
          status={status}
          style={{ width: "100%" }}
          options={field.meta.properties?.options}
          placeholder={field.meta.properties?.placeholder || `Select ${field.meta.label.toLowerCase()}`}
        />
      );
      break;
    case "textarea":
      input = <TextArea value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} status={status} rows={4} placeholder={field.meta.properties?.placeholder} />;
      break;
    case "number":
      input = <InputNumber value={value} onChange={(val) => setValue(val)} disabled={disabled} readOnly={readOnly} status={status} style={{ width: "100%" }} {...field.meta.properties} />;
      break;
    case "date": {
      const dateValue = value ? (dayjs.isDayjs(value) ? value : dayjs(value)) : null;
      const safeDate = dateValue?.isValid() ? dateValue : null;
      input = <DatePicker value={safeDate} onChange={(date) => setValue(date ? date.format("YYYY-MM-DD") : "")} disabled={disabled} status={status} style={{ width: "100%" }} />;
      break;
    }
    case "email":
      input = <Input type="email" value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} status={status} placeholder={field.meta.properties?.placeholder} />;
      break;
    case "password":
      input = <Input.Password value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} status={status} placeholder={field.meta.properties?.placeholder} />;
      break;
    case "file": {
      const fileProps = field.meta.properties || {};
      input = <AntdFileDropzone id={id} value={value} setValue={setValue} disabled={disabled} accept={fileProps.accept} multiple={fileProps.multiple} hasError={hasError} dk={dk} />;
      break;
    }
    case "radio":
      input = (
        <Radio.Group
          name={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          options={(field.meta.properties?.options || []).map((opt: any) => ({ label: opt.label || String(opt.value), value: opt.value }))}
        />
      );
      break;
    case "multiselect":
      input = (
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => setValue(v)}
          disabled={disabled}
          status={status}
          placeholder={field.meta.properties?.placeholder}
          options={(field.meta.properties?.options || []).map((opt: any) => ({ label: opt.label || String(opt.value), value: opt.value }))}
        />
      );
      break;
    default:
      input = <Input type={HTML_INPUT_TYPES[field.meta.type] ?? "text"} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} status={status} placeholder={field.meta.properties?.placeholder} />;
      break;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", marginBottom: 4, fontWeight: 500, color: dk ? "rgba(255,255,255,0.85)" : undefined }}>
        {field.meta.label}
        {required && <span style={{ color: "#ff4d4f" }}> *</span>}
      </label>
      {field.meta.description && <div style={{ fontSize: 12, color: dk ? "rgba(255,255,255,0.45)" : "#666", marginBottom: 4 }}>{field.meta.description}</div>}
      {input}
      {errorMsg && <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}>{errorMsg}</div>}
      {infoMessages.map((msg, i) => <div key={i} style={{ color: "#1677ff", fontSize: 12, marginTop: 4 }}>{msg.message}</div>)}
    </div>
  );
}

function renderContainer(props: ContainerRenderProps): React.ReactNode {
  const { container, isComplete, children, darkMode } = props;
  const dk = darkMode ?? false;
  return (
    <Card
      title={
        container.meta.title
          ? <span style={{ color: dk ? "rgba(255,255,255,0.85)" : undefined }}>{container.meta.title}{isComplete && <span style={{ color: "#52c41a", marginLeft: 8 }}>✓</span>}</span>
          : undefined
      }
      style={{
        marginBottom: 24,
        background: dk ? "#1f1f1f" : undefined,
        borderColor: dk ? "#3a3a3a" : undefined,
      }}
      styles={{
        header: dk ? { borderBottomColor: "#3a3a3a", color: "rgba(255,255,255,0.85)" } : undefined,
        body: dk ? { background: "#1f1f1f" } : undefined,
      }}
    >
      {container.meta.sub_title && <p style={{ color: dk ? "rgba(255,255,255,0.45)" : "#666", marginBottom: 16 }}>{container.meta.sub_title}</p>}
      {children}
    </Card>
  );
}

const LIGHT_THEME = { algorithm: antdTheme.defaultAlgorithm };
const DARK_THEME_OBJ = { algorithm: antdTheme.darkAlgorithm, token: DARK_TOKEN };

function renderForm(props: FormRenderProps): React.ReactNode {
  const showSubmit = props.showSubmit !== false;
  const dk = props.darkMode ?? false;
  const form = (
    <form onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }} style={{ background: "transparent" }}>
      {props.children}
      {showSubmit && (
        <button type="submit" style={{
          padding: "6px 16px", background: "#1677ff", color: "#fff", border: "none",
          borderRadius: "6px", fontSize: "14px", cursor: "pointer",
        }}>
          Submit
        </button>
      )}
    </form>
  );
  return (
    <ConfigProvider theme={dk ? DARK_THEME_OBJ : LIGHT_THEME}>
      {form}
    </ConfigProvider>
  );
}

function renderStepper(props: StepperRenderProps): React.ReactNode {
  const { steps, currentStep, onStepClick, canNavigateTo } = props;
  return (
    <Steps
      current={currentStep}
      onChange={(idx) => { if (canNavigateTo(idx)) onStepClick(idx); }}
      style={{ marginBottom: 24 }}
      items={steps.map((step, idx) => ({
        title: step.title,
        description: step.subtitle,
        status: step.isComplete ? "finish" as const : idx === currentStep ? "process" as const : "wait" as const,
        disabled: !canNavigateTo(idx),
      }))}
    />
  );
}

export const antdAdapter: ProtoFormAdapter = { renderField, renderContainer, renderForm, renderStepper };
export default antdAdapter;
