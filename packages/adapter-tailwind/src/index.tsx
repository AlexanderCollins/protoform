import React, { useState, useRef } from "react";
import type { ProtoFormAdapter, FieldRenderProps, ContainerRenderProps, FormRenderProps, StepperRenderProps } from "@protoform/react";
import { HTML_INPUT_TYPES } from "@protoform/react";

/**
 * Tailwind-inspired adapter using inline styles.
 * In production, replace with actual Tailwind utility classes.
 * Color palette: blue-500 (#3b82f6), gray-300 (#d1d5db), red-500 (#ef4444), green-600 (#16a34a)
 */

const lightColors = {
  inputBg: "#fff",
  inputBorder: "#d1d5db",
  inputText: undefined as string | undefined,
  labelColor: "#374151",
  descColor: "#6b7280",
  checkboxLabel: "#374151",
};

const darkColors = {
  inputBg: "#1e293b",
  inputBorder: "#334155",
  inputText: "#f1f5f9",
  labelColor: "#f1f5f9",
  descColor: "#94a3b8",
  checkboxLabel: "#f1f5f9",
};

function getStyles(dk: boolean) {
  const c = dk ? darkColors : lightColors;
  return {
    input: (hasError: boolean): React.CSSProperties => ({
      display: "block",
      width: "100%",
      borderRadius: "6px",
      border: `1px solid ${hasError ? "#ef4444" : c.inputBorder}`,
      padding: "8px 12px",
      fontSize: "14px",
      lineHeight: "20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      outline: "none",
      background: c.inputBg,
      color: c.inputText,
    }),
    label: {
      display: "block",
      fontSize: "14px",
      fontWeight: 500,
      color: c.labelColor,
      marginBottom: "4px",
    } as React.CSSProperties,
    description: {
      fontSize: "12px",
      color: c.descColor,
      marginBottom: "4px",
    } as React.CSSProperties,
    error: {
      marginTop: "4px",
      fontSize: "14px",
      color: "#dc2626",
    } as React.CSSProperties,
    info: {
      marginTop: "4px",
      fontSize: "14px",
      color: "#2563eb",
    } as React.CSSProperties,
    field: {
      marginBottom: "16px",
    } as React.CSSProperties,
    checkboxLabel: c.checkboxLabel,
  };
}

function TailwindFileDropzone({ id, value, setValue, disabled, accept, multiple, hasError }: {
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
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${dragOver ? "border-blue-500 bg-blue-50" : hasError ? "border-red-400" : "border-gray-300 hover:border-blue-400"}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <p className="text-sm text-gray-500">Drop files here or click to browse</p>
        {accept && <p className="text-xs text-gray-400 mt-1">{accept}</p>}
      </div>
      <input ref={inputRef} id={id} type="file" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} accept={accept} multiple={multiple} disabled={disabled} />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">{f.name || `File ${i + 1}`}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TailwindMultiSelect({ id, options, value, setValue, disabled, searchable, remoteSearch, remoteQuery, setRemoteQuery, loading, inputStyle, labelColor, descriptionStyle }: {
  id: string; options: { label?: string; value: any }[]; value: any; setValue: (v: any) => void;
  disabled?: boolean; searchable?: boolean; remoteSearch?: boolean;
  remoteQuery?: string; setRemoteQuery?: (q: string) => void; loading?: boolean;
  inputStyle: React.CSSProperties; labelColor: string; descriptionStyle: React.CSSProperties;
}) {
  const [filter, setFilter] = useState("");
  const selected: any[] = Array.isArray(value) ? value : [];
  const shown = !remoteSearch && searchable && filter
    ? options.filter((o) => String(o.label ?? o.value).toLowerCase().includes(filter.toLowerCase()))
    : options;
  const toggle = (v: any, checked: boolean) =>
    setValue(checked ? [...selected, v] : selected.filter((x) => x !== v));
  return (
    <div data-field-type="multiselect">
      {(searchable || remoteSearch) && (
        <input
          type="search"
          data-options-search
          style={{ ...inputStyle, marginBottom: "6px" }}
          placeholder="Search..."
          value={remoteSearch ? remoteQuery ?? "" : filter}
          onChange={(e) => (remoteSearch ? setRemoteQuery?.(e.target.value) : setFilter(e.target.value))}
          disabled={disabled}
        />
      )}
      {loading && <p style={descriptionStyle}>Loading…</p>}
      <div role="group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {shown.map((opt) => (
          <label key={String(opt.value)} style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: labelColor }}>
            <input
              type="checkbox"
              name={id}
              value={String(opt.value)}
              checked={selected.some((x) => x === opt.value)}
              onChange={(e) => toggle(opt.value, e.target.checked)}
              disabled={disabled}
              style={{ width: "16px", height: "16px", borderRadius: "4px", accentColor: "#3b82f6" }}
            />
            <span>{opt.label || String(opt.value)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function renderField(props: FieldRenderProps): React.ReactNode {
  const { id, field, value, setValue, disabled, required, readOnly, messages, showErrors, darkMode, optionsLoading, optionsQuery, setOptionsQuery } = props;
  const dk = darkMode ?? false;
  const styles = getStyles(dk);
  const errorMessages = showErrors ? messages.filter((m) => m.type === "error") : [];
  const infoMessages = showErrors ? messages.filter((m) => m.type === "info") : [];
  const hasError = errorMessages.length > 0;

  const inputStyle = styles.input(hasError);
  const props_ = field.meta.properties || {};
  const remoteSearch = typeof props_.options_url === "string" && props_.options_url.includes("{q}");

  // Shared wrapper: label + description + control + messages.
  const shell = (control: React.ReactNode) => (
    <div style={styles.field}>
      <label htmlFor={id} style={styles.label}>
        {field.meta.label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      {field.meta.description && <p style={styles.description}>{field.meta.description}</p>}
      {control}
      {errorMessages.map((msg, i) => <p key={i} style={styles.error}>{msg.message}</p>)}
      {infoMessages.map((msg, i) => <p key={i} style={styles.info}>{msg.message}</p>)}
    </div>
  );
  const searchBox = remoteSearch && (
    <input
      type="search"
      data-options-search
      style={{ ...inputStyle, marginBottom: "6px" }}
      placeholder="Search..."
      value={optionsQuery ?? ""}
      onChange={(e) => setOptionsQuery?.(e.target.value)}
      disabled={disabled}
    />
  );

  switch (field.meta.type) {
    case "checkbox":
      return (
        <div style={styles.field}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              id={id}
              checked={Boolean(value)}
              onChange={(e) => setValue(e.target.checked)}
              disabled={disabled}
              style={{ width: "16px", height: "16px", borderRadius: "4px", accentColor: "#3b82f6" }}
            />
            <span style={{ fontSize: "14px", color: styles.checkboxLabel }}>{field.meta.label}</span>
          </label>
          {errorMessages.map((msg, i) => <p key={i} style={styles.error}>{msg.message}</p>)}
        </div>
      );
    case "textarea":
      return (
        <div style={styles.field}>
          <label htmlFor={id} style={styles.label}>
            {field.meta.label}{required && <span style={{ color: "#ef4444" }}> *</span>}
          </label>
          {field.meta.description && <p style={styles.description}>{field.meta.description}</p>}
          <textarea id={id} style={{ ...inputStyle, resize: "vertical" }} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} placeholder={field.meta.properties?.placeholder} rows={3} />
          {errorMessages.map((msg, i) => <p key={i} style={styles.error}>{msg.message}</p>)}
          {infoMessages.map((msg, i) => <p key={i} style={styles.info}>{msg.message}</p>)}
        </div>
      );
    case "select": {
      const options = field.meta.properties?.options || [];
      return (
        <div style={styles.field}>
          <label htmlFor={id} style={styles.label}>
            {field.meta.label}{required && <span style={{ color: "#ef4444" }}> *</span>}
          </label>
          {field.meta.description && <p style={styles.description}>{field.meta.description}</p>}
          {searchBox}
          {optionsLoading && <p style={styles.description}>Loading…</p>}
          <select id={id} style={{ ...inputStyle, appearance: "auto" }} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled}>
            <option value="">Select...</option>
            {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
          </select>
          {errorMessages.map((msg, i) => <p key={i} style={styles.error}>{msg.message}</p>)}
          {infoMessages.map((msg, i) => <p key={i} style={styles.info}>{msg.message}</p>)}
        </div>
      );
    }
    case "radio": {
      const options = props_.options || [];
      return shell(
        <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {options.map((opt: any) => (
            <label key={String(opt.value)} style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: styles.checkboxLabel }}>
              <input type="radio" name={id} value={String(opt.value)} checked={value === opt.value} onChange={() => setValue(opt.value)} disabled={disabled} style={{ accentColor: "#3b82f6" }} />
              <span>{opt.label || String(opt.value)}</span>
            </label>
          ))}
        </div>
      );
    }
    case "multiselect":
      return shell(
        <TailwindMultiSelect
          id={id}
          options={props_.options || []}
          value={value}
          setValue={setValue}
          disabled={disabled}
          searchable={Boolean(props_.searchable)}
          remoteSearch={remoteSearch}
          remoteQuery={optionsQuery}
          setRemoteQuery={setOptionsQuery}
          loading={Boolean(optionsLoading)}
          inputStyle={inputStyle}
          labelColor={styles.checkboxLabel}
          descriptionStyle={styles.description}
        />
      );
    case "range":
      return shell(
        <input id={id} type="range" style={{ width: "100%", accentColor: "#3b82f6" }} value={value ?? props_.min ?? 0} onChange={(e) => { const n = parseFloat(e.target.value); setValue(isNaN(n) ? "" : n); }} disabled={disabled} min={props_.min} max={props_.max} step={props_.step} />
      );
    case "number":
      return (
        <div style={styles.field}>
          <label htmlFor={id} style={styles.label}>
            {field.meta.label}{required && <span style={{ color: "#ef4444" }}> *</span>}
          </label>
          {field.meta.description && <p style={styles.description}>{field.meta.description}</p>}
          <input id={id} type="number" style={inputStyle} value={value ?? ""} onChange={(e) => { const n = parseFloat(e.target.value); setValue(isNaN(n) ? "" : n); }} disabled={disabled} readOnly={readOnly} placeholder={field.meta.properties?.placeholder} min={field.meta.properties?.min} max={field.meta.properties?.max} />
          {errorMessages.map((msg, i) => <p key={i} style={styles.error}>{msg.message}</p>)}
          {infoMessages.map((msg, i) => <p key={i} style={styles.info}>{msg.message}</p>)}
        </div>
      );
    case "file": {
      const props_ = field.meta.properties || {};
      return (
        <div style={styles.field}>
          <label htmlFor={id} style={styles.label}>
            {field.meta.label}{required && <span style={{ color: "#ef4444" }}> *</span>}
          </label>
          {field.meta.description && <p style={styles.description}>{field.meta.description}</p>}
          <TailwindFileDropzone id={id} value={value} setValue={setValue} disabled={disabled} accept={props_.accept} multiple={props_.multiple} hasError={hasError} />
          {errorMessages.map((msg, i) => <p key={i} style={styles.error}>{msg.message}</p>)}
          {infoMessages.map((msg, i) => <p key={i} style={styles.info}>{msg.message}</p>)}
        </div>
      );
    }
    default:
      return (
        <div style={styles.field}>
          <label htmlFor={id} style={styles.label}>
            {field.meta.label}{required && <span style={{ color: "#ef4444" }}> *</span>}
          </label>
          {field.meta.description && <p style={styles.description}>{field.meta.description}</p>}
          <input id={id} type={HTML_INPUT_TYPES[field.meta.type] ?? "text"} style={inputStyle} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} placeholder={field.meta.properties?.placeholder} min={field.meta.properties?.min} max={field.meta.properties?.max} step={field.meta.properties?.step} />
          {errorMessages.map((msg, i) => <p key={i} style={styles.error}>{msg.message}</p>)}
          {infoMessages.map((msg, i) => <p key={i} style={styles.info}>{msg.message}</p>)}
        </div>
      );
  }
}

function renderContainer(props: ContainerRenderProps): React.ReactNode {
  const { container, isComplete, children, darkMode } = props;
  const dk = darkMode ?? false;
  return (
    <div style={{ borderRadius: "8px", border: `1px solid ${dk ? "#334155" : "#e5e7eb"}`, background: dk ? "#1e293b" : "#fff", padding: "24px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", marginBottom: "24px" }}>
      {container.meta.title && (
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: dk ? "#f1f5f9" : "#111827", marginBottom: "4px" }}>
          {container.meta.title}
          {isComplete && <span style={{ marginLeft: "8px", fontSize: "14px", color: "#16a34a" }}>&#10003;</span>}
        </h3>
      )}
      {container.meta.sub_title && <p style={{ fontSize: "14px", color: dk ? "#94a3b8" : "#6b7280", marginBottom: "16px" }}>{container.meta.sub_title}</p>}
      <div>{children}</div>
    </div>
  );
}

function renderForm(props: FormRenderProps): React.ReactNode {
  const showSubmit = props.showSubmit !== false;
  return (
    <form onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      {props.children}
      {showSubmit && (
        <button type="submit" style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
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
        const bg = isCurrent ? "#3b82f6" : step.isComplete ? "#16a34a" : "#e5e7eb";
        const fg = isCurrent || step.isComplete ? "white" : "#6b7280";
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center", flex: idx < steps.length - 1 ? 1 : "none" }}>
            <div
              onClick={() => navigable && onStepClick(idx)}
              style={{
                width: 36, height: 36, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", background: bg,
                color: fg, fontSize: "13px", fontWeight: 600,
                cursor: navigable ? "pointer" : "not-allowed",
                opacity: navigable ? 1 : 0.5,
                border: isCurrent ? "2px solid #2563eb" : "2px solid transparent",
                transition: "all 150ms", flexShrink: 0,
              }}
              title={step.title}
            >
              {step.isComplete ? "\u2713" : idx + 1}
            </div>
            {/* Label below */}
            <div style={{
              position: "absolute", marginTop: "52px", width: "80px", textAlign: "center",
              marginLeft: "-22px", fontSize: "11px", color: isCurrent ? (dk ? "#f1f5f9" : "#1e293b") : "#94a3b8",
              fontWeight: isCurrent ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden",
              textOverflow: "ellipsis", pointerEvents: "none",
            }}>
              {step.title}
            </div>
            {/* Connecting line */}
            {idx < steps.length - 1 && (
              <div style={{
                flex: 1, height: "2px", margin: "0 8px",
                background: step.isComplete ? "#16a34a" : (dk ? "#334155" : "#e5e7eb"),
                transition: "background 150ms",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const tailwindAdapter: ProtoFormAdapter = { renderField, renderContainer, renderForm, renderStepper };
export default tailwindAdapter;
