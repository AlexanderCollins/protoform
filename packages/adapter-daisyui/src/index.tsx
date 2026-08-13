import React, { useState, useRef } from "react";
import type { ProtoFormAdapter, FieldRenderProps, FieldChromeRenderProps, ContainerRenderProps, FormRenderProps, StepperRenderProps } from "@protoform/react";
import { HTML_INPUT_TYPES } from "@protoform/react";

/**
 * DaisyUI adapter using DaisyUI CSS classes.
 * Responds to data-theme on ancestor elements for automatic dark mode support.
 * Falls back to darkMode prop for inline-style overrides when needed.
 */

function DaisyFileDropzone({ id, value, setValue, disabled, accept, multiple, hasError }: {
  id: string; value: any; setValue: (v: any) => void; disabled?: boolean; accept?: string; multiple?: boolean; hasError?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const files: { name: string; size?: number }[] = Array.isArray(value) ? value : [];

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || disabled) return;
    const arr = Array.from(fileList);
    setValue(multiple ? arr : arr.slice(0, 1));
  };

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${dragOver ? "border-primary bg-primary/5" : hasError ? "border-error" : "border-base-300 hover:border-primary/50"}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <span className="iconify lucide--upload-cloud size-8 mx-auto mb-2 text-base-content/30" />
        <p className="text-sm text-base-content/60">Drop files here or click to browse</p>
        {accept && <p className="text-xs text-base-content/40 mt-1">{accept}</p>}
      </div>
      <input ref={inputRef} id={id} type="file" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} accept={accept} multiple={multiple} disabled={disabled} />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map((f, i) => (
            <span key={i} className="badge badge-sm gap-1">{f.name || `File ${i + 1}`}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The adapter's field chrome — label, description, messages — around any control. */
function DaisyMultiSelect({ id, options, value, setValue, disabled, searchable, remoteSearch, remoteQuery, setRemoteQuery, loading }: {
  id: string; options: { label?: string; value: any }[]; value: any; setValue: (v: any) => void;
  disabled?: boolean; searchable?: boolean; remoteSearch?: boolean;
  remoteQuery?: string; setRemoteQuery?: (q: string) => void; loading?: boolean;
}) {
  const [filter, setFilter] = React.useState("");
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
          className="input input-bordered input-sm w-full mb-2"
          placeholder="Search..."
          value={remoteSearch ? remoteQuery ?? "" : filter}
          onChange={(e) => (remoteSearch ? setRemoteQuery?.(e.target.value) : setFilter(e.target.value))}
          disabled={disabled}
        />
      )}
      {loading && <p className="text-xs opacity-60 mb-1">Loading…</p>}
      <div className="flex flex-col gap-2" role="group">
        {shown.map((opt) => (
          <label key={String(opt.value)} className="label cursor-pointer justify-start gap-3 py-0">
            <input
              type="checkbox"
              name={id}
              value={String(opt.value)}
              checked={selected.some((x) => x === opt.value)}
              onChange={(e) => toggle(opt.value, e.target.checked)}
              disabled={disabled}
              className="checkbox checkbox-primary checkbox-sm"
            />
            <span className="label-text">{opt.label || String(opt.value)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function renderFieldChrome(props: FieldChromeRenderProps): React.ReactNode {
  const { id, field, required, messages, showErrors, control } = props;
  const errorMessages = showErrors ? messages.filter((m) => m.type === "error") : [];
  const warningMessages = showErrors ? messages.filter((m) => m.type === "warning") : [];
  const infoMessages = showErrors ? messages.filter((m) => m.type === "info") : [];
  return (
    <div className="form-control mb-5">
      <label htmlFor={id} className="label">
        <span className="label-text font-semibold">
          {field.meta.label}
          {required && <span className="text-error ml-1">*</span>}
        </span>
      </label>
      {field.meta.description && <p className="text-xs text-base-content/60 mb-1.5">{field.meta.description}</p>}
      {control}
      {errorMessages.map((msg, i) => <p key={i} role="alert" className="text-xs text-error mt-1.5 font-medium">{msg.message}</p>)}
      {warningMessages.map((msg, i) => <p key={i} className="text-xs text-warning mt-1.5 font-medium">{msg.message}</p>)}
      {infoMessages.map((msg, i) => <p key={i} className="text-xs text-info mt-1.5">{msg.message}</p>)}
    </div>
  );
}

function renderField(props: FieldRenderProps): React.ReactNode {
  const { id, field, value, setValue, disabled, required, readOnly, messages, showErrors, optionsLoading, optionsQuery, setOptionsQuery } = props;
  const errorMessages = showErrors ? messages.filter((m) => m.type === "error") : [];
  const hasError = errorMessages.length > 0;

  const inputClass = `input input-bordered w-full ${hasError ? "input-error" : ""}`;
  const props_: Record<string, any> = field.meta.properties || {};
  const fieldStyle: React.CSSProperties | undefined = props_.style;

  const wrap = (control: React.ReactNode) => renderFieldChrome({ ...props, control });
  const remoteSearch = typeof props_.options_url === "string" && props_.options_url.includes("{q}");
  const searchBox = (remoteSearch || null) && (
    <input
      type="search"
      data-options-search
      className="input input-bordered input-sm w-full mb-2"
      placeholder="Search..."
      value={optionsQuery ?? ""}
      onChange={(e) => setOptionsQuery?.(e.target.value)}
      disabled={disabled}
    />
  );

  switch (field.meta.type) {
    case "checkbox":
      return (
        <div className="form-control mb-5">
          <label className="label cursor-pointer justify-start gap-3">
            <input type="checkbox" id={id} checked={Boolean(value)} onChange={(e) => setValue(e.target.checked)} disabled={disabled} className="checkbox checkbox-primary" style={fieldStyle} />
            <span className="label-text">{field.meta.label}</span>
            {required && <span className="text-error">*</span>}
          </label>
          {errorMessages.map((msg, i) => <p key={i} className="text-xs text-error mt-1 font-medium">{msg.message}</p>)}
        </div>
      );
    case "radio": {
      const options = props_.options || [];
      return wrap(
        <div className="flex flex-col gap-2">
          {options.map((opt: any) => (
            <label key={opt.value} className="label cursor-pointer justify-start gap-3">
              <input type="radio" name={id} value={opt.value} checked={value === opt.value} onChange={() => setValue(opt.value)} disabled={disabled} className="radio radio-primary" />
              <span className="label-text">{opt.label || opt.value}</span>
            </label>
          ))}
        </div>
      );
    }
    case "select": {
      const options = props_.options || [];
      return wrap(
        <>
          {searchBox}
          {optionsLoading && <p className="text-xs opacity-60 mb-1">Loading…</p>}
          <select id={id} className={`select select-bordered w-full ${hasError ? "select-error" : ""}`} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} style={fieldStyle}>
            <option value="" disabled>{props_.placeholder || "Pick one..."}</option>
            {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
          </select>
        </>
      );
    }
    case "multiselect": {
      return wrap(
        <DaisyMultiSelect
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
        />
      );
    }
    case "range":
      return wrap(
        <input id={id} type="range" className={`range range-primary ${hasError ? "range-error" : ""}`} value={value ?? props_.min ?? 0} onChange={(e) => { const n = parseFloat(e.target.value); setValue(isNaN(n) ? "" : n); }} disabled={disabled} min={props_.min} max={props_.max} step={props_.step} style={fieldStyle} />
      );
    case "textarea":
      return wrap(
        <textarea id={id} className={`textarea textarea-bordered w-full ${hasError ? "textarea-error" : ""}`} rows={props_.rows || 3} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} placeholder={props_.placeholder} style={fieldStyle} />
      );
    case "number":
      return wrap(
        <input id={id} type="number" className={inputClass} value={value ?? ""} onChange={(e) => { const n = parseFloat(e.target.value); setValue(isNaN(n) ? "" : n); }} disabled={disabled} readOnly={readOnly} placeholder={props_.placeholder} min={props_.min} max={props_.max} step={props_.step} style={fieldStyle} />
      );
    case "currency":
      return wrap(
        <label className={`input input-bordered flex items-center gap-2 w-full ${hasError ? "input-error" : ""}`} style={fieldStyle}>
          <span className="opacity-60">{props_.currency || "$"}</span>
          <input id={id} type="number" inputMode="decimal" className="grow" value={value ?? ""} onChange={(e) => { const n = parseFloat(e.target.value); setValue(isNaN(n) ? "" : n); }} disabled={disabled} readOnly={readOnly} placeholder={props_.placeholder} min={props_.min} max={props_.max} step={props_.step ?? "0.01"} />
        </label>
      );
    case "file":
      return wrap(
        <DaisyFileDropzone id={id} value={value} setValue={setValue} disabled={disabled} accept={props_.accept} multiple={props_.multiple} hasError={hasError} />
      );
    default:
      return wrap(
        <input id={id} type={HTML_INPUT_TYPES[field.meta.type] ?? "text"} className={inputClass} value={value || ""} onChange={(e) => setValue(e.target.value)} disabled={disabled} readOnly={readOnly} placeholder={props_.placeholder} min={props_.min} max={props_.max} step={props_.step} style={fieldStyle} />
      );
  }
}

function renderContainer(props: ContainerRenderProps): React.ReactNode {
  const { container, isComplete, children } = props;
  return (
    <div className="card bg-base-100 shadow-sm border border-base-300 mb-6 overflow-hidden">
      {(container.meta.title || container.meta.sub_title) && (
        <div className="px-6 py-4 bg-gradient-to-br from-primary to-secondary text-primary-content">
          {container.meta.title && (
            <h3 className="text-base font-bold flex items-center gap-2">
              {container.meta.title}
              {isComplete && (
                <span className="badge badge-sm bg-white/25 border-0 text-white backdrop-blur-sm">
                  Complete
                </span>
              )}
            </h3>
          )}
          {container.meta.sub_title && <p className="text-sm mt-1 opacity-85">{container.meta.sub_title}</p>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function renderForm(props: FormRenderProps): React.ReactNode {
  const showSubmit = props.showSubmit !== false;
  return (
    <form onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      {props.children}
      {showSubmit && (
        <button type="submit" className="btn btn-primary">
          Submit
        </button>
      )}
    </form>
  );
}

function renderStepper(props: StepperRenderProps): React.ReactNode {
  const { steps, currentStep, onStepClick, canNavigateTo } = props;
  return (
    <div className="flex items-center mb-7 px-2">
      {steps.map((step, idx) => {
        const isCurrent = idx === currentStep;
        const navigable = canNavigateTo(idx);
        return (
          <div key={step.id} className={`flex items-center ${idx < steps.length - 1 ? "flex-1" : ""}`}>
            <div className="relative flex flex-col items-center">
              <div
                onClick={() => navigable && onStepClick(idx)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all
                  ${navigable ? "cursor-pointer" : "cursor-not-allowed opacity-40"}
                  ${isCurrent ? "bg-primary text-primary-content shadow-lg shadow-primary/40" :
                    step.isComplete ? "bg-success text-success-content" :
                    "bg-base-200 text-base-content/50"}`}
                title={step.title}
              >
                {step.isComplete ? "\u2713" : idx + 1}
              </div>
              <span className={`absolute top-full mt-1 text-[11px] whitespace-nowrap overflow-hidden text-ellipsis w-20 text-center pointer-events-none
                ${isCurrent ? "font-semibold text-primary" : "text-base-content/50"}`}>
                {step.title}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 transition-colors ${step.isComplete ? "bg-success" : "bg-base-300"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const daisyuiAdapter: ProtoFormAdapter = { renderField, renderContainer, renderForm, renderStepper, renderFieldChrome };
export default daisyuiAdapter;
