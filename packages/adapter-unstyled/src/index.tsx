import React, { useState, useRef } from "react";
import type { ProtoFormAdapter, FieldRenderProps, FieldChromeRenderProps, ContainerRenderProps, FormRenderProps, StepperRenderProps } from "@protoform/react";
import { HTML_INPUT_TYPES } from "@protoform/react";

/**
 * Unstyled adapter — bare HTML with BEM class names, no visual styling.
 * Apply your own CSS targeting the protoform__* classes,
 * or use this as a starting point for a custom adapter.
 */

function UnstyledFileDropzone({ id, value, setValue, disabled, accept, multiple, dk }: {
  id: string; value: any; setValue: (v: any) => void; disabled?: boolean; accept?: string; multiple?: boolean; dk?: boolean;
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
    <div data-field-type="file">
      <div
        data-dropzone
        data-drag-over={dragOver || undefined}
        style={{
          border: `2px dashed ${dragOver ? (dk ? "#888" : "#666") : dk ? "#444" : "#ccc"}`,
          borderRadius: "4px", padding: "20px", textAlign: "center",
          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
          background: dk ? "#2a2a2a" : undefined, color: dk ? "#e0e0e0" : undefined,
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <p style={{ fontSize: "14px" }}>Drop files here or click to browse</p>
        {accept && <p style={{ fontSize: "12px", color: dk ? "#999" : "#666", marginTop: "4px" }}>{accept}</p>}
      </div>
      <input ref={inputRef} id={id} type="file" style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} accept={accept} multiple={multiple} disabled={disabled} />
      {files.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          {files.map((f, i) => (
            <span key={i} style={{ display: "inline-block", marginRight: "4px", padding: "2px 6px", fontSize: "12px", background: dk ? "#333" : "#eee", borderRadius: "3px" }}>{f.name || `File ${i + 1}`}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function UnstyledMultiSelect({ id, options, value, setValue, disabled, searchable, remoteSearch, remoteQuery, setRemoteQuery, loading, dk }: {
  id: string; options: { label?: string; value: any }[]; value: any; setValue: (v: any) => void;
  disabled?: boolean; searchable?: boolean; remoteSearch?: boolean;
  remoteQuery?: string; setRemoteQuery?: (q: string) => void; loading?: boolean; dk?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const selected: any[] = Array.isArray(value) ? value : [];
  // Remote search re-fetches options from options_url; local search only
  // filters the loaded list, so it feels like searching without a request.
  const shown = !remoteSearch && searchable && filter
    ? options.filter((o) => String(o.label ?? o.value).toLowerCase().includes(filter.toLowerCase()))
    : options;
  const toggle = (v: any, checked: boolean) =>
    setValue(checked ? [...selected, v] : selected.filter((x) => x !== v));

  return (
    <div data-field-type="multiselect" style={{ marginTop: "2px" }}>
      {(searchable || remoteSearch) && (
        <input
          type="search"
          data-options-search
          placeholder="Search..."
          value={remoteSearch ? remoteQuery ?? "" : filter}
          onChange={(e) => (remoteSearch ? setRemoteQuery?.(e.target.value) : setFilter(e.target.value))}
          disabled={disabled}
          style={{ display: "block", width: "100%", marginBottom: "4px", background: dk ? "#2a2a2a" : undefined, color: dk ? "#e0e0e0" : undefined, borderColor: dk ? "#444" : undefined }}
        />
      )}
      {loading && <div style={{ fontSize: "12px", color: dk ? "#999" : "#666" }}>Loading…</div>}
      <div role="group">
        {shown.map((opt) => (
          <label key={String(opt.value)} style={{ display: "flex", alignItems: "center", gap: "6px", color: dk ? "#e0e0e0" : undefined }}>
            <input
              type="checkbox"
              name={id}
              value={String(opt.value)}
              checked={selected.some((x) => x === opt.value)}
              onChange={(e) => toggle(opt.value, e.target.checked)}
              disabled={disabled}
            />
            <span>{opt.label || String(opt.value)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** The adapter's field chrome — label, description, messages — around any control. */
function renderFieldChrome(props: FieldChromeRenderProps): React.ReactNode {
  const { id, field, required, messages, showErrors, darkMode, control } = props;
  const visibleMessages = showErrors ? messages : messages.filter((m) => m.type !== "error");
  const dk = darkMode ?? false;
  return (
    <div style={{ marginBottom: "12px" }}>
      <label htmlFor={id} style={{ color: dk ? "#e0e0e0" : undefined }}>
        <strong>{field.meta.label}</strong>
        {required && <span> *</span>}
      </label>
      {field.meta.description && <div style={{ fontSize: "13px", color: dk ? "#999" : "#666" }}>{field.meta.description}</div>}
      {control}
      {visibleMessages.map((msg, i) => (
        <div
          key={i}
          role={msg.type === "error" ? "alert" : undefined}
          style={{
            color: msg.type === "error" ? "red" : msg.type === "warning" ? "#b45309" : dk ? "#e0e0e0" : "inherit",
            fontSize: "13px",
          }}
        >
          {msg.message}
        </div>
      ))}
    </div>
  );
}

function renderField(props: FieldRenderProps): React.ReactNode {
  const { id, field, value, setValue, disabled, required, readOnly, messages, showErrors, darkMode, optionsLoading, optionsQuery, setOptionsQuery } = props;
  const visibleMessages = showErrors ? messages : messages.filter((m) => m.type !== "error");
  const dk = darkMode ?? false;
  const remoteSearch = typeof field.meta.properties?.options_url === "string" && field.meta.properties.options_url.includes("{q}");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (field.meta.type === "checkbox") {
      setValue((e.target as HTMLInputElement).checked);
    } else if (field.meta.type === "number" || field.meta.type === "currency" || field.meta.type === "range") {
      const n = parseFloat(e.target.value);
      setValue(isNaN(n) ? "" : n);
    } else {
      setValue(e.target.value);
    }
  };

  let input: React.ReactNode;
  switch (field.meta.type) {
    case "textarea":
      input = <textarea id={id} name={id} value={value || ""} onChange={handleChange} disabled={disabled} readOnly={readOnly} placeholder={field.meta.properties?.placeholder} style={{ display: "block", width: "100%", marginTop: "2px", background: dk ? "#2a2a2a" : undefined, color: dk ? "#e0e0e0" : undefined, borderColor: dk ? "#444" : undefined }} />;
      break;
    case "select": {
      const options = field.meta.properties?.options || [];
      input = (
        <>
          {remoteSearch && (
            <input
              type="search"
              data-options-search
              placeholder="Search..."
              value={optionsQuery ?? ""}
              onChange={(e) => setOptionsQuery?.(e.target.value)}
              disabled={disabled}
              style={{ display: "block", width: "100%", marginTop: "2px", marginBottom: "4px", background: dk ? "#2a2a2a" : undefined, color: dk ? "#e0e0e0" : undefined, borderColor: dk ? "#444" : undefined }}
            />
          )}
          {optionsLoading && <div style={{ fontSize: "12px", color: dk ? "#999" : "#666" }}>Loading…</div>}
          <select id={id} name={id} value={value || ""} onChange={handleChange} disabled={disabled} style={{ display: "block", width: "100%", marginTop: "2px", background: dk ? "#2a2a2a" : undefined, color: dk ? "#e0e0e0" : undefined, borderColor: dk ? "#444" : undefined }}>
            <option value="">-- Select --</option>
            {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
          </select>
        </>
      );
      break;
    }
    case "radio": {
      const options = field.meta.properties?.options || [];
      input = (
        <div role="radiogroup" data-field-type="radio" style={{ marginTop: "2px" }}>
          {options.map((opt: any) => (
            <label key={String(opt.value)} style={{ display: "flex", alignItems: "center", gap: "6px", color: dk ? "#e0e0e0" : undefined }}>
              <input type="radio" name={id} value={String(opt.value)} checked={value === opt.value} onChange={() => setValue(opt.value)} disabled={disabled} />
              <span>{opt.label || String(opt.value)}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    case "multiselect": {
      const p = field.meta.properties || {};
      input = (
        <UnstyledMultiSelect
          id={id}
          options={p.options || []}
          value={value}
          setValue={setValue}
          disabled={disabled}
          searchable={Boolean(p.searchable)}
          remoteSearch={remoteSearch}
          remoteQuery={optionsQuery}
          setRemoteQuery={setOptionsQuery}
          loading={Boolean(optionsLoading)}
          dk={dk}
        />
      );
      break;
    }
    case "checkbox":
      input = (
        <label style={{ display: "flex", alignItems: "center", gap: "6px", color: dk ? "#e0e0e0" : undefined }}>
          <input type="checkbox" id={id} name={id} checked={Boolean(value)} onChange={handleChange} disabled={disabled} />
          <span>{field.meta.label}</span>
          {required && <span> *</span>}
        </label>
      );
      return (
        <div style={{ marginBottom: "12px" }}>
          {input}
          {visibleMessages.map((msg, i) => <div key={i} style={{ color: msg.type === "error" ? "red" : dk ? "#e0e0e0" : "inherit", fontSize: "13px" }}>{msg.message}</div>)}
        </div>
      );
    case "file": {
      const fileProps = field.meta.properties || {};
      input = <UnstyledFileDropzone id={id} value={value} setValue={setValue} disabled={disabled} accept={fileProps.accept} multiple={fileProps.multiple} dk={dk} />;
      break;
    }
    case "currency": {
      const symbol = field.meta.properties?.currency || "$";
      input = (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
          <span style={{ color: dk ? "#999" : "#666" }}>{symbol}</span>
          <input
            id={id}
            name={id}
            type="number"
            inputMode="decimal"
            step={field.meta.properties?.step ?? "0.01"}
            min={field.meta.properties?.min}
            max={field.meta.properties?.max}
            value={value ?? ""}
            onChange={handleChange}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={field.meta.properties?.placeholder}
            style={{ display: "block", width: "100%", background: dk ? "#2a2a2a" : undefined, color: dk ? "#e0e0e0" : undefined, borderColor: dk ? "#444" : undefined }}
          />
        </div>
      );
      break;
    }
    default:
      input = (
        <input
          id={id}
          name={id}
          type={HTML_INPUT_TYPES[field.meta.type] ?? "text"}
          value={field.meta.type === "number" || field.meta.type === "range" ? (value ?? "") : (value || "")}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={field.meta.properties?.placeholder}
          min={field.meta.properties?.min}
          max={field.meta.properties?.max}
          step={field.meta.properties?.step}
          style={{ display: "block", width: "100%", marginTop: "2px", background: dk ? "#2a2a2a" : undefined, color: dk ? "#e0e0e0" : undefined, borderColor: dk ? "#444" : undefined }}
        />
      );
      break;
  }

  return renderFieldChrome({ ...props, control: input });
}

function renderContainer(props: ContainerRenderProps): React.ReactNode {
  const { container, isComplete, children, darkMode } = props;
  const dk = darkMode ?? false;
  return (
    <fieldset style={{ border: `1px solid ${dk ? "#444" : "#ccc"}`, padding: "16px", marginBottom: "16px", background: dk ? "#1a1a1a" : undefined }}>
      {container.meta.title && (
        <legend style={{ color: dk ? "#e0e0e0" : undefined }}>
          <strong>{container.meta.title}</strong>
          {isComplete && " ✓"}
        </legend>
      )}
      {container.meta.sub_title && <p style={{ marginTop: 0, color: dk ? "#999" : "#666", fontSize: "14px" }}>{container.meta.sub_title}</p>}
      {children}
    </fieldset>
  );
}

function renderForm(props: FormRenderProps): React.ReactNode {
  const showSubmit = props.showSubmit !== false;
  const dk = props.darkMode ?? false;
  return (
    <form onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }} style={{ color: dk ? "#e0e0e0" : undefined }}>
      {props.children}
      {showSubmit && <button type="submit" style={dk ? { background: "#333", color: "#e0e0e0", border: "1px solid #555" } : undefined}>Submit</button>}
    </form>
  );
}

function renderStepper(props: StepperRenderProps): React.ReactNode {
  const { steps, currentStep, onStepClick, canNavigateTo, darkMode } = props;
  const dk = darkMode ?? false;
  return (
    <ol style={{ display: "flex", gap: "4px", listStyle: "none", padding: 0, margin: "0 0 16px" }}>
      {steps.map((step, idx) => {
        const navigable = canNavigateTo(idx);
        return (
          <li key={step.id}>
            <button
              onClick={() => navigable && onStepClick(idx)}
              disabled={!navigable}
              style={{
                padding: "6px 12px", border: `1px solid ${dk ? "#555" : "#ccc"}`, borderRadius: "3px",
                background: idx === currentStep ? (dk ? "#888" : "#666") : step.isComplete ? (dk ? "#555" : "#ccc") : (dk ? "#2a2a2a" : "#f5f5f5"),
                color: idx === currentStep ? "white" : dk ? "#e0e0e0" : "inherit",
                cursor: navigable ? "pointer" : "not-allowed",
                opacity: navigable ? 1 : 0.5,
                fontSize: "13px",
              }}
            >
              {idx + 1}. {step.title}
              {step.isComplete && " \u2713"}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export const unstyledAdapter: ProtoFormAdapter = { renderField, renderContainer, renderForm, renderStepper, renderFieldChrome };
export default unstyledAdapter;
