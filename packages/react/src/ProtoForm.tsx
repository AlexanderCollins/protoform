import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type {
  Form,
  FormValues,
  FormRuntimeState,
  ContainerKey,
  FieldKey,
} from "@protoform/core";
import { prepareForm, evaluateRules, parseRowKey } from "@protoform/core";

/** Immutably write a (possibly row-addressed, possibly nested) field
 * value — "members[0].qualifications[1].qual_name" recurses naturally. */
function writeValue(values: FormValues, fieldId: FieldKey, value: any): FormValues {
  const row = parseRowKey(fieldId);
  if (!row) return { ...values, [fieldId]: value };
  const rows = Array.isArray(values[row.repeatId]) ? [...values[row.repeatId]] : [];
  rows[row.index] = writeValue(rows[row.index] ?? {}, row.fieldId, value);
  return { ...values, [row.repeatId]: rows };
}

/** Immutably transform the row array at a repeat path — either a root
 * repeat id ("contacts") or a nested instance path
 * ("members[0].qualifications"). */
function updateArrayAtPath(
  values: FormValues,
  path: string,
  fn: (rows: any[]) => any[]
): FormValues {
  const m = /^([a-zA-Z_]\w*)\[(\d+)\]\.(.+)$/.exec(path);
  if (!m) {
    const rows = Array.isArray(values[path]) ? [...values[path]] : [];
    return { ...values, [path]: fn(rows) };
  }
  const rows = Array.isArray(values[m[1]]) ? [...values[m[1]]] : [];
  rows[Number(m[2])] = updateArrayAtPath(rows[Number(m[2])] ?? {}, m[3], fn);
  return { ...values, [m[1]]: rows };
}

/** The repeat id a path addresses ("members[0].qualifications" → "qualifications"). */
function repeatIdOfPath(path: string): string {
  const m = /^[a-zA-Z_]\w*\[\d+\]\.(.+)$/.exec(path);
  return m ? repeatIdOfPath(m[1]) : path;
}
import { ProtoFormContext } from "./ProtoFormContext";
import { ProtoContainer, ProtoField } from "./renderers";
import type { ProtoFormAdapter } from "./adapter";

// Inline unstyled adapter as the default fallback
const unstyledAdapter: ProtoFormAdapter = {
  renderField: () => null, // falls through to the built-in fallback in ProtoField
  renderContainer: ({ container, isComplete, children }) => (
    <div data-container-id={container.id}>
      <div>
        {container.meta.title && (
          <h3>
            {container.meta.title}
            {isComplete && <span> ✓</span>}
          </h3>
        )}
        {container.meta.sub_title && <p>{container.meta.sub_title}</p>}
      </div>
      <div>{children}</div>
    </div>
  ),
  renderForm: ({ children, onSubmit }) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  ),
};

export interface ProtoFormProps {
  schema: Form;
  initialValues?: FormValues;
  env?: Record<string, any>;
  autoLayout?: boolean;
  adapter?: ProtoFormAdapter;
  fields?: Record<string, React.ComponentType<{ id: FieldKey }>>;
  /** Wraps the adapter's rendered field output with a custom component.
   * Unlike `fields` (which replaces the entire field), wrappers receive the
   * adapter's output as `children` and can add behavior on top (e.g. autocomplete dropdowns). */
  fieldWrappers?: Record<string, React.ComponentType<{ id: FieldKey; children: React.ReactNode }>>;
  onChange?: (values: FormValues) => void;
  onSubmit?: (values: FormValues) => void;
  devMode?: boolean;
  darkMode?: boolean;
  showErrorsOnTouch?: boolean;
  /** When false, setValue does not auto-touch fields. Use touchField/touchContainerFields to reveal errors manually (e.g. on Next/Submit click). Defaults to true. */
  autoTouch?: boolean;
  /** When false, the adapter's form renderer should not render a submit button. Useful for multi-step wizards that manage their own navigation. Defaults to true. */
  showSubmitButton?: boolean;
  children?:
    | React.ReactNode
    | ((components: {
        Container: React.ComponentType<{ id: ContainerKey }>;
        Field: React.ComponentType<{ id: FieldKey }>;
      }) => React.ReactNode);
}

export const ProtoForm: React.FC<ProtoFormProps> = ({
  schema,
  initialValues = {},
  env,
  autoLayout = true,
  adapter,
  fields: fieldOverrides = {},
  fieldWrappers = {},
  onChange,
  onSubmit,
  devMode = false,
  darkMode = false,
  showErrorsOnTouch = true,
  autoTouch = true,
  showSubmitButton = true,
  children,
}) => {
  const resolvedAdapter = adapter ?? unstyledAdapter;

  const prepared = useMemo(() => prepareForm(schema), [schema]);

  const initialState = useMemo(() => {
    // Seed each repeat with its minimum row count so users see the rows
    // they must fill rather than an empty list plus an error. Nested
    // repeats seed inside each created row, recursively.
    const seedRow = (rid: string): Record<string, any> => {
      const row: Record<string, any> = {};
      for (const childRid of prepared.repeats[rid].childRepeats) {
        row[childRid] = Array.from(
          { length: prepared.repeats[childRid].min },
          () => seedRow(childRid)
        );
      }
      return row;
    };
    const seeded: FormValues = { ...initialValues };
    for (const [rid, spec] of Object.entries(prepared.repeats)) {
      if (spec.parentId !== null) continue; // seeded within parent rows
      if (!Array.isArray(seeded[rid])) {
        seeded[rid] = Array.from({ length: spec.min }, () => seedRow(rid));
      }
    }
    const { derived, progress, values } = evaluateRules(prepared, seeded, env, null);
    const state: FormRuntimeState = {
      values,
      derived,
      progress,
      touchedFields: new Set<FieldKey>(),
    };
    return state;
  }, [prepared, initialValues, env]);

  const [state, setState] = useState<FormRuntimeState>(initialState);
  const [externalErrors, setExternalErrorsState] = useState<Record<FieldKey, string[]>>({});

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Fire onChange after commit, never during render — calling it inside the
  // setState updater forces consumers to defer their own setState calls.
  const lastNotifiedValues = useRef(state.values);
  useEffect(() => {
    if (state.values === lastNotifiedValues.current) return;
    lastNotifiedValues.current = state.values;
    onChangeRef.current?.(state.values);
  }, [state.values]);

  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const setExternalErrors = useCallback((errors: Record<string, string[]>) => {
    setExternalErrorsState(errors);
  }, []);

  const clearExternalErrors = useCallback(() => {
    setExternalErrorsState({});
  }, []);

  const autoTouchRef = useRef(autoTouch);
  useEffect(() => { autoTouchRef.current = autoTouch; }, [autoTouch]);

  const applyValues = useCallback(
    (
      update: (values: FormValues) => FormValues,
      touch?: FieldKey[] | ((prev: Set<FieldKey>) => Set<FieldKey>)
    ) => {
      setState((prevState) => {
        const newValues = update(prevState.values);
        const { derived, progress, values } = evaluateRules(
          prepared,
          newValues,
          env,
          prevState.progress.currentContainer
        );

        let newTouchedFields = prevState.touchedFields;
        if (typeof touch === "function") {
          newTouchedFields = touch(prevState.touchedFields);
        } else if (touch && autoTouchRef.current) {
          newTouchedFields = new Set([...prevState.touchedFields, ...touch]);
        }

        return { values, derived, progress, touchedFields: newTouchedFields };
      });
    },
    [prepared, env]
  );

  const setValue = useCallback(
    (fieldId: FieldKey, value: any) => {
      applyValues((prev) => writeValue(prev, fieldId, value), [fieldId]);

      // Clear external errors for the edited field
      setExternalErrorsState((prev) => {
        if (!(fieldId in prev)) return prev;
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    },
    [applyValues]
  );

  /** Write several fields of one repeat row in a single evaluation pass
   * (e.g. a lookup populating sibling fields). */
  const setRowValues = useCallback(
    (path: ContainerKey, index: number, partial: Record<FieldKey, any>) => {
      applyValues(
        (prev) =>
          updateArrayAtPath(prev, path, (rows) => {
            const next = [...rows];
            next[index] = { ...(next[index] ?? {}), ...partial };
            return next;
          }),
        Object.keys(partial).map((f) => `${path}[${index}].${f}`)
      );
    },
    [applyValues]
  );

  const addRow = useCallback(
    (path: ContainerKey, initial: Record<FieldKey, any> = {}) => {
      const rid = repeatIdOfPath(path);
      const spec = prepared.repeats[rid];
      // New rows carry their nested repeats pre-seeded to child minimums
      const seedRow = (r: string): Record<string, any> => {
        const row: Record<string, any> = {};
        for (const childRid of prepared.repeats[r]?.childRepeats ?? []) {
          row[childRid] = Array.from(
            { length: prepared.repeats[childRid].min },
            () => seedRow(childRid)
          );
        }
        return row;
      };
      applyValues((prev) =>
        updateArrayAtPath(prev, path, (rows) => {
          if (spec && spec.max !== null && rows.length >= spec.max) return rows;
          return [...rows, { ...seedRow(rid), ...initial }];
        })
      );
    },
    [applyValues, prepared]
  );

  /** Merge server-provided values (spec §10 wire format) without touching
   * fields — used for async integration results and server-authoritative
   * computed values arriving in step/submit responses. */
  const applyServerValues = useCallback(
    (partial: FormValues) => {
      if (!partial || Object.keys(partial).length === 0) return;
      applyValues((prev) => ({ ...prev, ...partial }));
    },
    [applyValues]
  );

  const removeRow = useCallback(
    (path: ContainerKey, index: number) => {
      // Row indices shift, so touched/external state under this path resets.
      applyValues(
        (prev) =>
          updateArrayAtPath(prev, path, (rows) => {
            if (index < 0 || index >= rows.length) return rows;
            const next = [...rows];
            next.splice(index, 1);
            return next;
          }),
        (prevTouched) =>
          new Set([...prevTouched].filter((k) => !k.startsWith(`${path}[`)))
      );
      setExternalErrorsState((prev) => {
        const next: Record<FieldKey, string[]> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!k.startsWith(`${path}[`)) next[k] = v;
        }
        return next;
      });
    },
    [applyValues]
  );

  const setCurrentContainer = useCallback((id: ContainerKey | null) => {
    setState((prevState) => {
      if (prevState.progress.currentContainer === id) return prevState;
      return {
        ...prevState,
        progress: { ...prevState.progress, currentContainer: id },
      };
    });
  }, []);

  const touchField = useCallback((fieldId: FieldKey) => {
    setState((prevState) => {
      const newTouchedFields = new Set(prevState.touchedFields);
      newTouchedFields.add(fieldId);
      return { ...prevState, touchedFields: newTouchedFields };
    });
  }, []);

  const touchContainerFields = useCallback(
    (containerId: ContainerKey) => {
      setState((prevState) => {
        const fieldIds = prepared.containerDescendants[containerId] || [];
        const newTouchedFields = new Set(prevState.touchedFields);
        fieldIds.forEach((fieldId) => newTouchedFields.add(fieldId));
        return { ...prevState, touchedFields: newTouchedFields };
      });
    },
    [prepared]
  );

  const handleSubmit = useCallback(() => {
    if (onSubmitRef.current) onSubmitRef.current(state.values);
  }, [state.values]);

  const contextValue = useMemo(
    () => ({
      prepared,
      state,
      setValue,
      setRowValues,
      addRow,
      removeRow,
      applyServerValues,
      setCurrentContainer,
      touchField,
      touchContainerFields,
      showErrorsOnTouch,
      devMode,
      darkMode,
      adapter: resolvedAdapter,
      fieldOverrides,
      fieldWrappers,
      externalErrors,
      setExternalErrors,
      clearExternalErrors,
    }),
    [prepared, state, setValue, setRowValues, addRow, removeRow, applyServerValues, setCurrentContainer, touchField, touchContainerFields, showErrorsOnTouch, devMode, darkMode, resolvedAdapter, fieldOverrides, fieldWrappers, externalErrors, setExternalErrors, clearExternalErrors]
  );

  const formContent =
    typeof children === "function"
      ? children({ Container: ProtoContainer, Field: ProtoField })
      : children
        ? children
        : autoLayout
          ? (schema.layout ?? []).map((container) => (
              <ProtoContainer key={container.id} id={container.id} />
            ))
          : null;

  return (
    <ProtoFormContext.Provider value={contextValue}>
      {resolvedAdapter.renderForm({
        children: formContent,
        onSubmit: handleSubmit,
        showSubmit: showSubmitButton,
        darkMode,
      })}
    </ProtoFormContext.Provider>
  );
};
