import React, { useState, useRef } from "react";
import type { ProtoFormAdapter, FieldRenderProps, ContainerRenderProps, FormRenderProps, StepperRenderProps } from "@protoform/react";
import { HTML_INPUT_TYPES } from "@protoform/react";

/**
 * Shadcn UI-inspired adapter using inline styles.
 * Distinctive look: zinc palette, tight spacing, very minimal, ring-offset focus.
 */

function ShadcnFileDropzone({ id, value, setValue, disabled, accept, multiple, hasError }: {
  id: string; value: any; setValue: (v: any) => void; disabled?: boolean; accept?: string; multiple?: boolean; hasError?: boolean;
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
          border: `2px dashed ${dragOver ? "#71717a" : hasError ? "#ef4444" : "#d4d4d8"}`,
          borderRadius: "8px", padding: "24px", textAlign: "center", cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1, transition: "border-color 0.2s",
          backgroundColor: dragOver ? "#fafafa" : undefined,
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <p style={{ fontSize: "14px", color: "#71717a" }}>Drop files here or click to browse</p>
        {accept && <p style={{ fontSize: "12px", color: "#a1a1aa", marginTop: "4px" }}>{accept}</p>}
      </div>
      <input ref={inputRef} id={id} type="file" style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} accept={accept} multiple={multiple} disabled={disabled} />
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
          {files.map((f, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", backgroundColor: "#f4f4f5", color: "#3f3f46" }}>{f.name || `File ${i + 1}`}</span>
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

  const inputStyle: React.CSSProperties = {
    display: "flex",
    height: "36px",
    width: "100%",
    borderRadius: "6px",
    border: `1px solid ${hasError ? "#ef4444" : dk ? "#3f3f46" : "#27272a"}`,
    background: dk ? "#27272a" : "transparent",
    padding: "6px 12px",
    fontSize: "14px",
    lineHeight: "20px",
    color: dk ? "#fafafa" : "#09090b",
    outline: "none",
  };

  const disabledStyle: React.CSSProperties = disabled ? { cursor: "not-allowed", opacity: 0.5 } : {};

  const label = (
    <label htmlFor={id} style={{ fontSize: "14px", fontWeight: 500, lineHeight: "1", color: dk ? "#fafafa" : "#09090b" }}>
      {field.meta.label}{required && <span style={{ color: "#ef4444" }}> *</span>}
    </label>
  );

  const desc = field.meta.description ? (
    <p style={{ fontSize: "13px", color: dk ? "#a1a1aa" : "#71717a", margin: 0 }}>{field.meta.description}</p>
  ) : null;

  const errors = errorMessages.map((msg, i) => (
    <p key={i} style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>{msg.message}</p>
  ));

  const infos = infoMessages.map((msg, i) => (
    <p key={i} style={{ fontSize: "13px", color: "#3b82f6", margin: 0 }}>{msg.message}</p>
  ));

  const wrap = (input: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
      {label}
      {desc}
      {input}
      {errors}
      {infos}
    </div>
  );

  switch (field.meta.type) {
    case "checkbox":
      return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "16px" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "16px", height: "16px", borderRadius: "4px", marginTop: "2px",
            border: value ? "none" : `1px solid ${dk ? "#3f3f46" : "#27272a"}`,
            background: value ? (dk ? "#fafafa" : "#18181b") : "transparent",
            cursor: "pointer", flexShrink: 0,
          }} onClick={() => !disabled && setValue(!value)}>
            {value && <span style={{ color: dk ? "#09090b" : "#fff", fontSize: "10px", lineHeight: 1 }}>&#10003;</span>}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor={id} style={{ fontSize: "14px", fontWeight: 500, lineHeight: "1", color: dk ? "#fafafa" : "#09090b", cursor: "pointer" }} onClick={() => !disabled && setValue(!value)}>
              {field.meta.label}
            </label>
            {errors}
          </div>
          <input type="checkbox" id={id} checked={Boolean(value)} onChange={(e) => setValue(e.target.checked)} disabled={disabled} style={{ display: "none" }} />
        </div>
      );
    case "select": {
      const options = field.meta.properties?.options || [];
      return wrap(
        <select id={id} style={{ ...inputStyle, ...disabledStyle, appearance: "auto" }} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled}>
          <option value="">Select...</option>
          {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
        </select>
      );
    }
    case "textarea":
      return wrap(
        <textarea id={id} style={{ ...inputStyle, ...disabledStyle, height: "auto", minHeight: "80px", resize: "vertical" }} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} placeholder={field.meta.properties?.placeholder} />
      );
    case "number":
      return wrap(
        <input id={id} type="number" style={{ ...inputStyle, ...disabledStyle }} value={value ?? ""} onChange={(e) => { const n = parseFloat(e.target.value); setValue(isNaN(n) ? "" : n); }} disabled={disabled} readOnly={readOnly} placeholder={field.meta.properties?.placeholder} min={field.meta.properties?.min} max={field.meta.properties?.max} />
      );
    case "file": {
      const fileProps = field.meta.properties || {};
      return wrap(
        <ShadcnFileDropzone id={id} value={value} setValue={setValue} disabled={disabled} accept={fileProps.accept} multiple={fileProps.multiple} hasError={hasError} />
      );
    }
    case "radio": {
      const options = field.meta.properties?.options || [];
      return wrap(
        <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {options.map((opt: any) => (
            <label key={String(opt.value)} style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
              <input type="radio" name={id} value={String(opt.value)} checked={value === opt.value} onChange={() => setValue(opt.value)} disabled={disabled} />
              <span>{opt.label || String(opt.value)}</span>
            </label>
          ))}
        </div>
      );
    }
    case "multiselect": {
      const options = field.meta.properties?.options || [];
      const selected: any[] = Array.isArray(value) ? value : [];
      return wrap(
        <div role="group" data-field-type="multiselect" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {options.map((opt: any) => (
            <label key={String(opt.value)} style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
              <input
                type="checkbox"
                name={id}
                value={String(opt.value)}
                checked={selected.some((x) => x === opt.value)}
                onChange={(e) => setValue(e.target.checked ? [...selected, opt.value] : selected.filter((x) => x !== opt.value))}
                disabled={disabled}
              />
              <span>{opt.label || String(opt.value)}</span>
            </label>
          ))}
        </div>
      );
    }
    default:
      return wrap(
        <input id={id} type={HTML_INPUT_TYPES[field.meta.type] ?? "text"} style={{ ...inputStyle, ...disabledStyle }} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} placeholder={field.meta.properties?.placeholder} />
      );
  }
}

function renderContainer(props: ContainerRenderProps): React.ReactNode {
  const { container, isComplete, children, darkMode } = props;
  const dk = darkMode ?? false;
  return (
    <div style={{ borderRadius: "8px", border: `1px solid ${dk ? "#3f3f46" : "#27272a"}`, background: dk ? "#18181b" : "#fff", marginBottom: "24px", overflow: "hidden" }}>
      {(container.meta.title || container.meta.sub_title) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "24px 24px 0" }}>
          {container.meta.title && (
            <h3 style={{ fontSize: "24px", fontWeight: 600, lineHeight: "1", letterSpacing: "-0.025em", color: dk ? "#fafafa" : "#09090b", margin: 0 }}>
              {container.meta.title}
              {isComplete && <span style={{ marginLeft: "8px", fontSize: "14px", color: "#22c55e" }}>&#10003;</span>}
            </h3>
          )}
          {container.meta.sub_title && <p style={{ fontSize: "14px", color: dk ? "#a1a1aa" : "#71717a", margin: 0 }}>{container.meta.sub_title}</p>}
        </div>
      )}
      <div style={{ padding: "24px" }}>{children}</div>
    </div>
  );
}

function renderForm(props: FormRenderProps): React.ReactNode {
  const showSubmit = props.showSubmit !== false;
  const dk = props.darkMode ?? false;
  return (
    <form onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      {props.children}
      {showSubmit && (
        <button type="submit" style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          height: "36px", padding: "0 16px", borderRadius: "6px",
          background: dk ? "#fafafa" : "#18181b", color: dk ? "#18181b" : "#fafafa", border: "none",
          fontSize: "14px", fontWeight: 500, cursor: "pointer",
          letterSpacing: "0.01em",
        }}>
          Submit
        </button>
      )}
    </form>
  );
}

function renderStepper(props: StepperRenderProps): React.ReactNode {
  const { steps, currentStep, onStepClick, canNavigateTo, darkMode } = props;
  const dk = darkMode ?? false;
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "28px", padding: "0 8px" }}>
      {steps.map((step, idx) => {
        const isCurrent = idx === currentStep;
        const navigable = canNavigateTo(idx);
        const bg = isCurrent ? (dk ? "#fafafa" : "#18181b") : step.isComplete ? (dk ? "#3f3f46" : "#27272a") : (dk ? "#27272a" : "#f4f4f5");
        const fg = isCurrent ? (dk ? "#18181b" : "#fafafa") : step.isComplete ? "#fafafa" : (dk ? "#a1a1aa" : "#71717a");
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center", flex: idx < steps.length - 1 ? 1 : "none" }}>
            <div
              onClick={() => navigable && onStepClick(idx)}
              style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", background: bg,
                color: fg, fontSize: "12px", fontWeight: 500,
                cursor: navigable ? "pointer" : "not-allowed",
                opacity: navigable ? 1 : 0.4,
                transition: "all 150ms", flexShrink: 0,
              }}
              title={step.title}
            >
              {step.isComplete ? "\u2713" : idx + 1}
            </div>
            {/* Label */}
            <div style={{
              position: "absolute", marginTop: "48px", width: "72px", textAlign: "center",
              marginLeft: "-20px", fontSize: "11px", color: isCurrent ? (dk ? "#fafafa" : "#09090b") : "#a1a1aa",
              fontWeight: isCurrent ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden",
              textOverflow: "ellipsis", pointerEvents: "none",
            }}>
              {step.title}
            </div>
            {/* Line */}
            {idx < steps.length - 1 && (
              <div style={{
                flex: 1, height: "1px", margin: "0 8px",
                background: step.isComplete ? (dk ? "#3f3f46" : "#27272a") : (dk ? "#27272a" : "#e4e4e7"),
                transition: "background 150ms",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const shadcnAdapter: ProtoFormAdapter = { renderField, renderContainer, renderForm, renderStepper };
export default shadcnAdapter;
