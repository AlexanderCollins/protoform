import React from "react";
import type { FieldKey, ContainerKey, Container, FieldRef } from "@protoform/core";
import { isEmpty, parseRowKey, templateFieldId } from "@protoform/core";
import { useFieldState, useContainerState, useProtoForm } from "./ProtoFormContext";

function isField(element: Container | FieldRef): element is FieldRef {
  return !("children" in element);
}

/** ProtoForm field type → HTML input type, for types that render as a
 * plain <input>. Shared with adapters so passthrough types stay in sync. */
export const HTML_INPUT_TYPES: Record<string, string> = {
  text: "text",
  number: "number",
  email: "email",
  password: "password",
  date: "date",
  checkbox: "checkbox",
  tel: "tel",
  url: "url",
  time: "time",
  datetime: "datetime-local",
  range: "range",
};

// ---------------------------------------------------------------------------
// Dev mode overlay — self-contained (inline styles) so it works with any
// adapter. Enabled via <ProtoForm devMode>.
// ---------------------------------------------------------------------------

const devStripStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap",
  fontFamily: "ui-monospace, monospace",
  fontSize: "11px",
  padding: "2px 6px",
  borderRadius: "4px",
  marginBottom: "2px",
};

function DevFlag({ on, label, title }: { on: boolean; label: string; title: string }) {
  return (
    <span title={title} style={{ opacity: on ? 1 : 0.25 }}>
      {label}
    </span>
  );
}

function formatDevValue(value: any): string {
  if (value === undefined || value === null) return "∅";
  if (value === "") return "ε";
  try {
    const s = JSON.stringify(value);
    return s.length > 40 ? s.slice(0, 37) + "…" : s;
  } catch {
    return String(value);
  }
}

const FieldDevStrip: React.FC<{ id: FieldKey }> = ({ id }) => {
  const fieldState = useFieldState(id);
  const { state } = useProtoForm();
  const { field, value, visible, disabled, required, readOnly, touched } = fieldState;
  const valid = state.derived.valid.has(id);
  const blocking = state.derived.blockingTargets.has(id);

  return (
    <div style={{ ...devStripStyle, background: "rgba(217, 70, 239, 0.08)", color: "#a21caf" }}>
      <code>{id}</code>
      <span style={{ opacity: 0.7 }}>{field.meta.type}</span>
      <code>{formatDevValue(value)}</code>
      <span style={{ display: "inline-flex", gap: "0.25rem" }}>
        <DevFlag on={visible} label="👁" title="visible" />
        <DevFlag on={required} label="*" title="required" />
        <DevFlag on={disabled} label="🔒" title="disabled" />
        <DevFlag on={readOnly} label="📖" title="read-only" />
        <DevFlag on={valid} label="✓" title="valid" />
        <DevFlag on={touched} label="✋" title="touched" />
        {blocking && <DevFlag on label="🚫" title="blocking" />}
      </span>
    </div>
  );
};

const ContainerDevStrip: React.FC<{ id: ContainerKey }> = ({ id }) => {
  const { container, visible, disabled, isComplete, isCurrent } = useContainerState(id);
  const { prepared, state } = useProtoForm();
  const descendants = prepared.containerDescendants[id] || [];
  const visibleFields = descendants.filter((f) => state.derived.visible.has(f));
  const filledFields = visibleFields.filter((f) => !isEmpty(state.values[f]));

  return (
    <div style={{ ...devStripStyle, background: "rgba(99, 102, 241, 0.08)", color: "#4f46e5" }}>
      <code>{id}</code>
      <span style={{ opacity: 0.7 }}>{container.meta.type || "container"}</span>
      <span>
        {filledFields.length}/{visibleFields.length} filled
      </span>
      <span style={{ display: "inline-flex", gap: "0.25rem" }}>
        <DevFlag on={isComplete} label="✓" title="complete" />
        <DevFlag on={isCurrent} label="►" title="current step" />
        <DevFlag on={visible} label="👁" title="visible" />
        <DevFlag on={disabled} label="🔒" title="disabled" />
      </span>
    </div>
  );
};

/** Thin shell — delegates to per-field override or adapter.renderField */
export const ProtoField: React.FC<{ id: FieldKey }> = ({ id }) => {
  const fieldState = useFieldState(id);
  const { adapter, fieldOverrides, fieldWrappers, darkMode, devMode } = useProtoForm();

  if (!fieldState.visible) {
    // In dev mode, hidden fields render as a dimmed strip so you can see
    // they exist and why they're hidden. Otherwise they render nothing.
    return devMode ? (
      <div style={{ opacity: 0.45 }}>
        <FieldDevStrip id={id} />
      </div>
    ) : null;
  }

  // 1. Per-field override (completely replaces adapter rendering).
  // Row instances ("assets[0].sku") match an exact-id registration first,
  // then fall back to their template field id ("sku") so one override
  // serves every row of a repeat.
  const templateId = parseRowKey(id) ? templateFieldId(id) : undefined;
  const Override =
    fieldOverrides[id] ?? (templateId ? fieldOverrides[templateId] : undefined);
  if (Override) {
    return devMode ? (
      <>
        <FieldDevStrip id={id} />
        <Override id={id} />
      </>
    ) : (
      <Override id={id} />
    );
  }

  // `hidden` fields carry a value but render no UI (adapters never see them).
  if (fieldState.field.meta.type === "hidden") {
    return devMode ? <FieldDevStrip id={id} /> : null;
  }

  // 2. Adapter renderField (may return null to fall through)
  let rendered = adapter.renderField({ id, ...fieldState, darkMode });

  // 3. Fallback — minimal unstyled input
  if (rendered === null) {
    const { field, value, setValue, disabled, required, readOnly, messages } = fieldState;
    rendered = (
      <div data-field-id={id}>
        <label htmlFor={id}>
          {field.meta.label}
          {required && <span> *</span>}
        </label>
        <input
          id={id}
          name={id}
          type={HTML_INPUT_TYPES[field.meta.type] ?? "text"}
          value={field.meta.type === "checkbox" ? undefined : (value ?? "")}
          checked={field.meta.type === "checkbox" ? Boolean(value) : undefined}
          disabled={disabled}
          readOnly={readOnly}
          onChange={(e) =>
            field.meta.type === "checkbox"
              ? setValue(e.target.checked)
              : setValue(e.target.value)
          }
        />
        {messages.map((msg, i) => (
          <div key={i}>{msg.message}</div>
        ))}
      </div>
    );
  }

  // 4. Field wrapper — wraps the adapter's output (adds behavior on top).
  // Same resolution as overrides: exact id, then row-template id.
  const Wrapper =
    fieldWrappers[id] ?? (templateId ? fieldWrappers[templateId] : undefined);
  const output = Wrapper ? <Wrapper id={id}>{rendered}</Wrapper> : <>{rendered}</>;

  return devMode ? (
    <>
      <FieldDevStrip id={id} />
      {output}
    </>
  ) : (
    output
  );
};

/** Resolve the row array at a repeat path ("members[0].qualifications"). */
function rowsAtPath(values: Record<string, any>, path: string): any[] {
  const m = /^([a-zA-Z_]\w*)\[(\d+)\]\.(.+)$/.exec(path);
  if (!m) return Array.isArray(values[path]) ? values[path] : [];
  const rows = Array.isArray(values[m[1]]) ? values[m[1]] : [];
  const row = rows[Number(m[2])];
  return row == null ? [] : rowsAtPath(row, m[3]);
}

/** Renders one repeat instance-array: row fields plus nested repeats per
 * row, with add/remove controls. Adapters can take over via renderRepeat. */
const RepeatBlock: React.FC<{ rid: ContainerKey; path: string }> = ({ rid, path }) => {
  const { prepared, state, adapter, addRow, removeRow, darkMode } = useProtoForm();
  const spec = prepared.repeats[rid];
  const container = React.useMemo(() => {
    const find = (els: any[]): any => {
      for (const el of els) {
        if (!("children" in el)) continue;
        if (el.id === rid) return el;
        const found = find(el.children);
        if (found) return found;
      }
      return null;
    };
    return find(prepared.form.layout);
  }, [prepared, rid]);

  const rowValues = rowsAtPath(state.values, path);
  const canAdd = spec.max === null || rowValues.length < spec.max;
  const canRemove = rowValues.length > spec.min;
  const itemLabel = (index: number) =>
    String(container?.meta?.item_label ?? "Item {index}").replace(
      "{index}",
      String(index + 1)
    );

  const rows = rowValues.map((_, i) => (
    <React.Fragment key={i}>
      {spec.fields.map((f) => (
        <ProtoField key={f} id={`${path}[${i}].${f}`} />
      ))}
      {spec.childRepeats.map((childRid) => (
        <RepeatBlock key={childRid} rid={childRid} path={`${path}[${i}].${childRid}`} />
      ))}
    </React.Fragment>
  ));

  const repeatProps = {
    id: rid,
    path,
    container,
    rows,
    addRow: () => addRow(path),
    canAdd,
    removeRow: (index: number) => removeRow(path, index),
    canRemove,
    itemLabel,
    min: spec.min,
    max: spec.max,
    darkMode,
  };

  if (adapter.renderRepeat) return <>{adapter.renderRepeat(repeatProps)}</>;

  return (
    <div data-repeat-id={rid} data-repeat-path={path}>
      {container?.meta?.title && <h3>{container.meta.title}</h3>}
      {container?.meta?.sub_title && <p>{container.meta.sub_title}</p>}
      {rows.map((rowNode, i) => (
        <div
          key={i}
          data-repeat-row={i}
          style={{ border: "1px solid #ccc", borderRadius: "4px", padding: "12px", marginBottom: "8px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <strong>{itemLabel(i)}</strong>
            {canRemove && (
              <button type="button" onClick={() => removeRow(path, i)}>
                Remove
              </button>
            )}
          </div>
          {rowNode}
        </div>
      ))}
      {canAdd && (
        <button type="button" onClick={() => addRow(path)}>
          Add {String(container?.meta?.item_label ?? "item").replace("{index}", "").trim() || "item"}
        </button>
      )}
    </div>
  );
};

/** Top-level shell for a repeat container: visibility + devMode, then the
 * recursive RepeatBlock (nested repeats render inside their parent rows). */
export const RepeatContainer: React.FC<{ id: ContainerKey }> = ({ id }) => {
  const containerState = useContainerState(id);
  const { devMode } = useProtoForm();

  if (!containerState.visible) {
    return devMode ? (
      <div style={{ opacity: 0.45 }}>
        <ContainerDevStrip id={id} />
      </div>
    ) : null;
  }

  const block = <RepeatBlock rid={id} path={id} />;
  return devMode ? (
    <>
      <ContainerDevStrip id={id} />
      {block}
    </>
  ) : (
    block
  );
};

/** Thin shell — delegates to adapter.renderContainer */
export const ProtoContainer: React.FC<{ id: ContainerKey }> = ({ id }) => {
  const containerState = useContainerState(id);
  const { adapter, darkMode, devMode, prepared } = useProtoForm();

  // Repeat containers render rows, not children
  if (prepared.repeats[id]) return <RepeatContainer id={id} />;

  if (!containerState.visible) {
    return devMode ? (
      <div style={{ opacity: 0.45 }}>
        <ContainerDevStrip id={id} />
      </div>
    ) : null;
  }

  const { container } = containerState;
  const useLayout = container.layout && container.layout.length > 0;

  // Pre-render children so adapter receives ReactNode
  let children: React.ReactNode;
  if (useLayout) {
    children = (
      <>
        {container.layout!.map((row, rowIndex) => (
          <div key={rowIndex} style={{ display: "flex", flexWrap: "wrap", columnGap: "1rem" }}>
            {row.map((elementId) => {
              const element = container.children.find((child) => child.id === elementId);
              if (!element) return null;
              return (
                <div key={elementId} style={{ flex: 1, minWidth: "200px" }}>
                  {isField(element)
                    ? <ProtoField id={elementId} />
                    : <ProtoContainer id={elementId} />
                  }
                </div>
              );
            })}
          </div>
        ))}
      </>
    );
  } else {
    children = (
      <>
        {container.children.map((child) => {
          if (isField(child)) {
            return <ProtoField key={child.id} id={child.id} />;
          }
          return <ProtoContainer key={child.id} id={child.id} />;
        })}
      </>
    );
  }

  const output = <>{adapter.renderContainer({ id, ...containerState, children, darkMode })}</>;

  return devMode ? (
    <>
      <ContainerDevStrip id={id} />
      {output}
    </>
  ) : (
    output
  );
};
