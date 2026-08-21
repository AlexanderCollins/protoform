import React, { useState, useRef } from "react";
import type { ProtoFormAdapter, FieldRenderProps, FieldChromeRenderProps, ContainerRenderProps, FormRenderProps, StepperRenderProps } from "@protoform/react";
import { HTML_INPUT_TYPES } from "@protoform/react";

/**
 * Unstyled adapter — bare semantic HTML with BEM class names and zero
 * visual styling. Apply your own CSS targeting the protoform__* classes,
 * or use this as a starting point for a custom adapter.
 *
 * State hooks for styling: data-drag-over on the dropzone,
 * protoform__step--current / --complete on stepper buttons, and a
 * protoform__form--dark modifier when the host passes darkMode.
 */

function UnstyledFileDropzone({ id, value, setValue, disabled, accept, multiple }: {
  id: string; value: any; setValue: (v: any) => void; disabled?: boolean; accept?: string; multiple?: boolean;
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
    <div className="protoform__file" data-field-type="file">
      <div
        className="protoform__dropzone"
        data-dropzone
        data-drag-over={dragOver || undefined}
        data-disabled={disabled || undefined}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <p className="protoform__dropzone-hint">Drop files here or click to browse</p>
        {accept && <p className="protoform__dropzone-accept">{accept}</p>}
      </div>
      <input ref={inputRef} id={id} type="file" className="protoform__file-input" hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} accept={accept} multiple={multiple} disabled={disabled} />
      {files.length > 0 && (
        <ul className="protoform__file-list">
          {files.map((f, i) => (
            <li key={i} className="protoform__file-item">{f.name || `File ${i + 1}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UnstyledMultiSelect({ id, options, value, setValue, disabled, searchable, remoteSearch, remoteQuery, setRemoteQuery, loading }: {
  id: string; options: { label?: string; value: any }[]; value: any; setValue: (v: any) => void;
  disabled?: boolean; searchable?: boolean; remoteSearch?: boolean;
  remoteQuery?: string; setRemoteQuery?: (q: string) => void; loading?: boolean;
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
    <div className="protoform__multiselect" data-field-type="multiselect">
      {(searchable || remoteSearch) && (
        <input
          type="search"
          className="protoform__search"
          data-options-search
          placeholder="Search..."
          value={remoteSearch ? remoteQuery ?? "" : filter}
          onChange={(e) => (remoteSearch ? setRemoteQuery?.(e.target.value) : setFilter(e.target.value))}
          disabled={disabled}
        />
      )}
      {loading && <div className="protoform__loading">Loading…</div>}
      <div className="protoform__multiselect-options" role="group">
        {shown.map((opt) => (
          <label key={String(opt.value)} className="protoform__multiselect-option">
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
  const { id, field, required, messages, showErrors, control } = props;
  const visibleMessages = showErrors ? messages : messages.filter((m) => m.type !== "error");
  return (
    <div className="protoform__field">
      <label htmlFor={id} className="protoform__label">
        {field.meta.label}
        {required && <span className="protoform__required"> *</span>}
      </label>
      {field.meta.description && <div className="protoform__description">{field.meta.description}</div>}
      {control}
      {visibleMessages.map((msg, i) => (
        <div
          key={i}
          className={`protoform__message protoform__message--${msg.type}`}
          role={msg.type === "error" ? "alert" : undefined}
        >
          {msg.message}
        </div>
      ))}
    </div>
  );
}

function renderField(props: FieldRenderProps): React.ReactNode {
  const { id, field, value, setValue, disabled, required, readOnly, messages, showErrors, optionsLoading, optionsQuery, setOptionsQuery } = props;
  const visibleMessages = showErrors ? messages : messages.filter((m) => m.type !== "error");
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
      input = <textarea id={id} name={id} className="protoform__textarea" value={value || ""} onChange={handleChange} disabled={disabled} readOnly={readOnly} placeholder={field.meta.properties?.placeholder} rows={field.meta.properties?.rows} />;
      break;
    case "select": {
      const options = field.meta.properties?.options || [];
      input = (
        <>
          {remoteSearch && (
            <input
              type="search"
              className="protoform__search"
              data-options-search
              placeholder="Search..."
              value={optionsQuery ?? ""}
              onChange={(e) => setOptionsQuery?.(e.target.value)}
              disabled={disabled}
            />
          )}
          {optionsLoading && <div className="protoform__loading">Loading…</div>}
          <select id={id} name={id} className="protoform__select" value={value || ""} onChange={handleChange} disabled={disabled}>
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
        <div className="protoform__radio-group" role="radiogroup" data-field-type="radio">
          {options.map((opt: any) => (
            <label key={String(opt.value)} className="protoform__radio-option">
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
        />
      );
      break;
    }
    case "checkbox":
      input = (
        <label className="protoform__checkbox">
          <input type="checkbox" id={id} name={id} checked={Boolean(value)} onChange={handleChange} disabled={disabled} />
          <span>{field.meta.label}</span>
          {required && <span className="protoform__required"> *</span>}
        </label>
      );
      return (
        <div className="protoform__field">
          {input}
          {visibleMessages.map((msg, i) => (
            <div key={i} className={`protoform__message protoform__message--${msg.type}`} role={msg.type === "error" ? "alert" : undefined}>{msg.message}</div>
          ))}
        </div>
      );
    case "file": {
      const fileProps = field.meta.properties || {};
      input = <UnstyledFileDropzone id={id} value={value} setValue={setValue} disabled={disabled} accept={fileProps.accept} multiple={fileProps.multiple} />;
      break;
    }
    case "currency": {
      const symbol = field.meta.properties?.currency || "$";
      input = (
        <div className="protoform__currency">
          <span className="protoform__currency-symbol">{symbol}</span>
          <input
            id={id}
            name={id}
            type="number"
            inputMode="decimal"
            className="protoform__input"
            step={field.meta.properties?.step ?? "0.01"}
            min={field.meta.properties?.min}
            max={field.meta.properties?.max}
            value={value ?? ""}
            onChange={handleChange}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={field.meta.properties?.placeholder}
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
          className="protoform__input"
          type={HTML_INPUT_TYPES[field.meta.type] ?? "text"}
          value={field.meta.type === "number" || field.meta.type === "range" ? (value ?? "") : (value || "")}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={field.meta.properties?.placeholder}
          min={field.meta.properties?.min}
          max={field.meta.properties?.max}
          step={field.meta.properties?.step}
        />
      );
      break;
  }

  return renderFieldChrome({ ...props, control: input });
}

function renderContainer(props: ContainerRenderProps): React.ReactNode {
  const { container, isComplete, children } = props;
  return (
    <fieldset className="protoform__container" data-complete={isComplete || undefined}>
      {container.meta.title && (
        <legend className="protoform__container-title">
          {container.meta.title}
          {isComplete && " ✓"}
        </legend>
      )}
      {container.meta.sub_title && <p className="protoform__container-subtitle">{container.meta.sub_title}</p>}
      {children}
    </fieldset>
  );
}

function renderForm(props: FormRenderProps): React.ReactNode {
  const showSubmit = props.showSubmit !== false;
  const dk = props.darkMode ?? false;
  return (
    <form className={`protoform__form${dk ? " protoform__form--dark" : ""}`} onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      {props.children}
      {showSubmit && <button type="submit" className="protoform__submit">Submit</button>}
    </form>
  );
}

function renderStepper(props: StepperRenderProps): React.ReactNode {
  const { steps, currentStep, onStepClick, canNavigateTo } = props;
  return (
    <ol className="protoform__stepper">
      {steps.map((step, idx) => {
        const navigable = canNavigateTo(idx);
        const modifiers =
          (idx === currentStep ? " protoform__step--current" : "") +
          (step.isComplete ? " protoform__step--complete" : "");
        return (
          <li key={step.id} className="protoform__stepper-item">
            <button
              type="button"
              className={`protoform__step${modifiers}`}
              onClick={() => navigable && onStepClick(idx)}
              disabled={!navigable}
              aria-current={idx === currentStep ? "step" : undefined}
            >
              {idx + 1}. {step.title}
              {step.isComplete && " ✓"}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export const unstyledAdapter: ProtoFormAdapter = { renderField, renderContainer, renderForm, renderStepper, renderFieldChrome };
export default unstyledAdapter;
