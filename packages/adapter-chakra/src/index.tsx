import React, { useState, useRef } from "react";
import type { ProtoFormAdapter, FieldRenderProps, ContainerRenderProps, FormRenderProps } from "@protoform/react";
import { HTML_INPUT_TYPES } from "@protoform/react";

/**
 * Chakra UI adapter for ProtoForm.
 * Uses Chakra v3 namespace-style components.
 */

function ChakraFileDropzone({ id, value, setValue, disabled, accept, multiple, hasError }: {
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
          border: `2px dashed ${dragOver ? "#3182CE" : hasError ? "#E53E3E" : "#E2E8F0"}`,
          borderRadius: "8px", padding: "24px", textAlign: "center",
          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
          transition: "border-color 0.2s",
          backgroundColor: dragOver ? "#EBF8FF" : undefined,
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <p style={{ fontSize: "14px", color: "#718096" }}>Drop files here or click to browse</p>
        {accept && <p style={{ fontSize: "12px", color: "#A0AEC0", marginTop: "4px" }}>{accept}</p>}
      </div>
      <input ref={inputRef} id={id} type="file" style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} accept={accept} multiple={multiple} disabled={disabled} />
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
          {files.map((f, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "6px", fontSize: "12px", backgroundColor: "#EDF2F7", color: "#4A5568" }}>{f.name || `File ${i + 1}`}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function renderField(props: FieldRenderProps): React.ReactNode {
  const { id, field, value, setValue, disabled, required, readOnly, messages, showErrors } = props;
  const errorMessages = showErrors ? messages.filter((m) => m.type === "error") : [];
  const hasError = errorMessages.length > 0;
  const infoMessages = showErrors ? messages.filter((m) => m.type === "info") : [];

  const inputProps = {
    id,
    name: id,
    disabled,
    readOnly,
    placeholder: field.meta.properties?.placeholder,
    style: {
      width: "100%",
      padding: "8px 12px",
      borderRadius: "6px",
      border: hasError ? "2px solid #E53E3E" : "1px solid #E2E8F0",
      fontSize: "14px",
      outline: "none",
    } as React.CSSProperties,
  };

  const label = (
    <label htmlFor={id} style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>
      {field.meta.label}
      {required && <span style={{ color: "#E53E3E", marginLeft: "2px" }}> *</span>}
    </label>
  );

  const description = field.meta.description ? (
    <p style={{ fontSize: "12px", color: "#718096", marginBottom: "4px" }}>{field.meta.description}</p>
  ) : null;

  const errors = errorMessages.map((msg, i) => (
    <p key={i} style={{ fontSize: "12px", color: "#E53E3E", marginTop: "4px" }}>{msg.message}</p>
  ));

  const infos = infoMessages.map((msg, i) => (
    <p key={i} style={{ fontSize: "12px", color: "#3182CE", marginTop: "4px" }}>{msg.message}</p>
  ));

  const wrapper = (children: React.ReactNode) => (
    <div style={{ marginBottom: "16px" }}>
      {label}
      {description}
      {children}
      {errors}
      {infos}
    </div>
  );

  switch (field.meta.type) {
    case "checkbox":
      return (
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => setValue(e.target.checked)}
              disabled={disabled}
              style={{ width: "16px", height: "16px", accentColor: "#3182CE" }}
            />
            <span style={{ fontSize: "14px" }}>{field.meta.label}</span>
            {required && <span style={{ color: "#E53E3E" }}>*</span>}
          </label>
          {errors}
        </div>
      );
    case "select": {
      const options = field.meta.properties?.options || [];
      return wrapper(
        <select
          {...inputProps}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          style={{ ...inputProps.style, appearance: "auto" }}
        >
          <option value="">Select...</option>
          {options.map((opt: any) => (
            <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>
          ))}
        </select>
      );
    }
    case "textarea":
      return wrapper(
        <textarea
          {...inputProps}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          style={{ ...inputProps.style, resize: "vertical" }}
        />
      );
    case "number":
      return wrapper(
        <input
          {...inputProps}
          type="number"
          value={value ?? ""}
          onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
          min={field.meta.properties?.min}
          max={field.meta.properties?.max}
        />
      );
    case "file": {
      const fileProps = field.meta.properties || {};
      return wrapper(
        <ChakraFileDropzone id={id} value={value} setValue={setValue} disabled={disabled} accept={fileProps.accept} multiple={fileProps.multiple} hasError={hasError} />
      );
    }
    case "radio": {
      const options = field.meta.properties?.options || [];
      return wrapper(
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
      return wrapper(
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
      return wrapper(
        <input
          {...inputProps}
          type={HTML_INPUT_TYPES[field.meta.type] ?? "text"}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
        />
      );
  }
}

function renderContainer(props: ContainerRenderProps): React.ReactNode {
  const { container, isComplete, children } = props;
  return (
    <div style={{ marginBottom: "24px", border: "1px solid #E2E8F0", borderRadius: "8px", overflow: "hidden" }}>
      {(container.meta.title || container.meta.sub_title) && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", background: "#F7FAFC" }}>
          {container.meta.title && (
            <h3 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
              {container.meta.title}
              {isComplete && <span style={{ color: "#38A169", marginLeft: "8px" }}>&#10003;</span>}
            </h3>
          )}
          {container.meta.sub_title && (
            <p style={{ fontSize: "14px", color: "#718096", margin: "4px 0 0" }}>{container.meta.sub_title}</p>
          )}
        </div>
      )}
      <div style={{ padding: "20px" }}>{children}</div>
    </div>
  );
}

function renderForm(props: FormRenderProps): React.ReactNode {
  return (
    <form onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      {props.children}
      <button
        type="submit"
        style={{
          padding: "8px 24px",
          background: "#3182CE",
          color: "white",
          border: "none",
          borderRadius: "6px",
          fontSize: "14px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Submit
      </button>
    </form>
  );
}

export const chakraAdapter: ProtoFormAdapter = { renderField, renderContainer, renderForm };
export default chakraAdapter;
