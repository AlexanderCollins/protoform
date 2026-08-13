import { createContext, useContext, useEffect, useState } from "react";
import type {
  PreparedForm,
  FormRuntimeState,
  FieldKey,
  ContainerKey,
  Field,
  Container,
  MessageKind,
  SelectOption,
} from "@protoform/core";
import { findField, findContainer, isEmpty, parseRowKey, templateFieldId, resolveValuePath } from "@protoform/core";
import type { ProtoFormAdapter } from "./adapter";

export interface ProtoFormContextValue {
  prepared: PreparedForm;
  state: FormRuntimeState;
  setValue: (fieldId: FieldKey, value: any) => void;
  /** Write several fields of one repeat row in a single evaluation pass. */
  setRowValues: (repeatId: ContainerKey, index: number, partial: Record<FieldKey, any>) => void;
  addRow: (repeatId: ContainerKey, initial?: Record<FieldKey, any>) => void;
  removeRow: (repeatId: ContainerKey, index: number) => void;
  /** Merge server-provided values (spec §10) without touching fields. */
  applyServerValues: (partial: Record<FieldKey, any>) => void;
  setCurrentContainer: (id: ContainerKey | null) => void;
  touchField: (fieldId: FieldKey) => void;
  touchContainerFields: (containerId: ContainerKey) => void;
  showErrorsOnTouch: boolean;
  devMode?: boolean;
  adapter: ProtoFormAdapter;
  fieldOverrides: Record<string, React.ComponentType<{ id: FieldKey }>>;
  fieldWrappers: Record<string, React.ComponentType<{ id: FieldKey; children: React.ReactNode }>>;
  externalErrors: Record<FieldKey, string[]>;
  setExternalErrors: (errors: Record<string, string[]>) => void;
  clearExternalErrors: () => void;
  darkMode: boolean;
}

export const ProtoFormContext = createContext<ProtoFormContextValue | null>(
  null
);

export function useProtoForm(): ProtoFormContextValue {
  const context = useContext(ProtoFormContext);
  if (!context) {
    throw new Error("useProtoForm must be used within a ProtoForm component");
  }
  return context;
}

/** Substitute the search query into an options_url template. A template
 * without "{q}" is returned as-is (fetch-once URL). */
export function buildOptionsUrl(template: string, query: string): string {
  return template.replace("{q}", encodeURIComponent(query));
}

// Resolved option lists shared across every mount of the same URL, so ten
// fields pointing at one endpoint produce one request.
const remoteOptionsCache = new Map<string, SelectOption[]>();

/** For tests and long-lived apps that need to refetch. */
export function clearRemoteOptionsCache(): void {
  remoteOptionsCache.clear();
}

/**
 * Host-fetched options (spec §2): options_url is a rendering contract only.
 * The client fetches; the engines never do. A "{q}" placeholder makes the
 * control search-driven — the fetch re-runs (debounced) as the query
 * changes. Response body: a JSON array of {label, value}, or {"options":
 * [...]}. SSR-safe: no fetch happens during server rendering.
 */
function useRemoteOptions(optionsUrl: string | undefined): {
  options: SelectOption[] | null;
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
} {
  const searchable = typeof optionsUrl === "string" && optionsUrl.includes("{q}");
  const [query, setQuery] = useState("");
  const url = optionsUrl ? buildOptionsUrl(optionsUrl, searchable ? query : "") : null;
  const [options, setOptions] = useState<SelectOption[] | null>(
    url ? remoteOptionsCache.get(url) ?? null : null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    const cached = remoteOptionsCache.get(url);
    if (cached) {
      setOptions(cached);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    // Debounce search-driven fetches; plain URLs fetch immediately.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const opts: SelectOption[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.options)
            ? data.options
            : [];
        remoteOptionsCache.set(url, opts);
        if (!cancelled) setOptions(opts);
      } catch {
        // Aborted or network failure: keep whatever options we last had.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, searchable ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, searchable]);

  return { options, loading, query, setQuery };
}

export function useFieldState(id: FieldKey): {
  field: Field;
  value: any;
  visible: boolean;
  disabled: boolean;
  required: boolean;
  readOnly: boolean;
  messages: { type: MessageKind; message: string }[];
  touched: boolean;
  showErrors: boolean;
  setValue: (v: any) => void;
  /** True while an options_url fetch is in flight. */
  optionsLoading: boolean;
  /** Current search query for a search-driven options_url ("{q}"). */
  optionsQuery: string;
  setOptionsQuery: (q: string) => void;
} {
  const { prepared, state, setValue, showErrorsOnTouch, externalErrors } = useProtoForm();
  const { form } = prepared;
  const { values, derived, touchedFields } = state;

  // Row-addressed ids ("contacts[0].phone") resolve against the repeat's
  // template field for meta, and against the row for the value.
  const row = parseRowKey(id);
  const baseField = findField(form, row ? templateFieldId(id) : id);
  if (!baseField) throw new Error(`Field not found: ${id}`);

  // Options resolve in precedence order: rule-driven options affect
  // (spec §4) > options fetched from options_url (spec §2) > the static
  // options declared in properties. Whichever wins is patched into the
  // field's properties so every adapter picks it up without changes.
  const optionsUrl = baseField.meta.properties?.options_url;
  const remote = useRemoteOptions(typeof optionsUrl === "string" ? optionsUrl : undefined);
  const dynOptions = derived.options[id] ?? remote.options ?? undefined;
  const field = dynOptions
    ? {
        ...baseField,
        meta: {
          ...baseField.meta,
          properties: { ...(baseField.meta.properties ?? {}), options: dynOptions },
        },
      }
    : baseField;

  const visible = derived.visible.has(id);
  const disabled = derived.disabled.has(id);
  const required = derived.required.has(id);
  const readOnly = derived.readOnly.has(id);
  const touched = touchedFields.has(id);
  const ruleMessages = derived.messages[id] || [];
  const hasExternalErrors = Boolean(externalErrors[id]?.length);
  // External (server) errors bypass showErrorsOnTouch — if the server
  // returned an error, the user has already submitted (spec §10).
  const showErrors = !showErrorsOnTouch || touched || hasExternalErrors;
  const value = row ? resolveValuePath(values, id) : values[id];
  const setFieldValue = (v: any) => setValue(id, v);

  // Inject "required" error when field is required, empty, and errors are shown
  const valueEmpty = isEmpty(value);
  const baseMessages = (showErrors && required && valueEmpty)
    ? [...ruleMessages, { type: "error" as MessageKind, message: "This field is required." }]
    : ruleMessages;

  // Merge external (server) errors — always visible, bypass showErrorsOnTouch
  const fieldExternalErrors = externalErrors[id];
  const messages = fieldExternalErrors?.length
    ? [...baseMessages, ...fieldExternalErrors.map((msg) => ({ type: "error" as MessageKind, message: msg }))]
    : baseMessages;

  return {
    field,
    value,
    visible,
    disabled,
    required,
    readOnly,
    messages,
    touched,
    showErrors,
    setValue: setFieldValue,
    optionsLoading: remote.loading,
    optionsQuery: remote.query,
    setOptionsQuery: remote.setQuery,
  };
}

/**
 * All current validation errors, keyed by field id — rule-engine error
 * messages, "This field is required." for empty required fields, and any
 * external (server) errors. Ignores touch state: this is the "what is wrong
 * with the form right now" view, matching the Django engine's
 * collect_field_errors(). Only visible, non-disabled fields are included.
 */
export function useFormErrors(): Record<FieldKey, string[]> {
  const { prepared, state, externalErrors } = useProtoForm();
  const { values, derived } = state;

  const errors: Record<FieldKey, string[]> = {};
  for (const field of prepared.form.fields) {
    const id = field.id;
    if (!derived.visible.has(id)) continue;
    if (derived.disabled.has(id)) continue;

    const msgs = (derived.messages[id] || [])
      .filter((m) => m.type === "error")
      .map((m) => m.message);
    if (!derived.valid.has(id) && msgs.length === 0) msgs.push("This field is invalid.");
    if (derived.required.has(id) && isEmpty(values[id])) msgs.push("This field is required.");
    const ext = externalErrors[id];
    if (ext?.length) msgs.push(...ext);

    if (msgs.length) errors[id] = msgs;
  }

  // Repeat rows (all nesting depths) plus per-array row-count violations
  type Inst = { prefix: string; row: any };
  const instCache: Record<string, Inst[]> = {};
  const instances = (rid: string): Inst[] => {
    if (instCache[rid]) return instCache[rid];
    const spec = prepared.repeats[rid];
    const out: Inst[] = [];
    if (spec.parentId === null) {
      const rows = Array.isArray(values[rid]) ? values[rid] : [];
      rows.forEach((row: any, i: number) => out.push({ prefix: `${rid}[${i}].`, row: row ?? {} }));
    } else {
      for (const parent of instances(spec.parentId)) {
        const rows = Array.isArray(parent.row?.[rid]) ? parent.row[rid] : [];
        rows.forEach((row: any, i: number) =>
          out.push({ prefix: `${parent.prefix}${rid}[${i}].`, row: row ?? {} })
        );
      }
    }
    return (instCache[rid] = out);
  };
  const arrays = (rid: string): { prefixBase: string; rows: any[] }[] => {
    const spec = prepared.repeats[rid];
    if (spec.parentId === null) {
      return [{ prefixBase: "", rows: Array.isArray(values[rid]) ? values[rid] : [] }];
    }
    return instances(spec.parentId).map((parent) => ({
      prefixBase: parent.prefix,
      rows: Array.isArray(parent.row?.[rid]) ? parent.row[rid] : [],
    }));
  };

  for (const [rid, spec] of Object.entries(prepared.repeats)) {
    if (!derived.visible.has(rid)) continue;
    for (const arr of arrays(rid)) {
      const boundKey = arr.prefixBase ? `${arr.prefixBase}${rid}` : rid;
      if (arr.rows.length < spec.min) {
        (errors[boundKey] ??= []).push(`At least ${spec.min} entries are required.`);
      }
      if (spec.max !== null && arr.rows.length > spec.max) {
        (errors[boundKey] ??= []).push(`At most ${spec.max} entries are allowed.`);
      }
      arr.rows.forEach((row: any, i: number) => {
        for (const f of spec.fields) {
          const key = `${arr.prefixBase}${rid}[${i}].${f}`;
          if (!derived.visible.has(key)) continue;
          if (derived.disabled.has(key)) continue;
          const msgs = (derived.messages[key] || [])
            .filter((m) => m.type === "error")
            .map((m) => m.message);
          if (!derived.valid.has(key) && msgs.length === 0) msgs.push("This field is invalid.");
          if (derived.required.has(key) && isEmpty(row?.[f])) msgs.push("This field is required.");
          const ext = externalErrors[key];
          if (ext?.length) msgs.push(...ext);
          if (msgs.length) errors[key] = msgs;
        }
      });
    }
  }
  return errors;
}

/**
 * Find the first field with a validation error in a container (in layout order)
 * and scroll to it + focus it.
 */
export function scrollToFirstError(
  containerId: ContainerKey,
  prepared: PreparedForm,
  state: FormRuntimeState,
  externalErrors?: Record<FieldKey, string[]>,
): void {
  const fieldIds = prepared.containerDescendants[containerId] || [];
  const { derived, values } = state;

  for (const fieldId of fieldIds) {
    if (!derived.visible.has(fieldId)) continue;
    if (derived.disabled.has(fieldId)) continue;

    const hasError = !derived.valid.has(fieldId);
    const isRequiredEmpty =
      derived.required.has(fieldId) && isEmpty(values[fieldId]);
    const hasExternalError = externalErrors?.[fieldId]?.length;

    if (hasError || isRequiredEmpty || hasExternalError) {
      // Defer to next frame so the DOM has updated after touch
      requestAnimationFrame(() => {
        const el = document.getElementById(fieldId);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      });
      return;
    }
  }
}

export function useContainerState(id: ContainerKey): {
  container: Container;
  visible: boolean;
  disabled: boolean;
  isComplete: boolean;
  isCurrent: boolean;
} {
  const { prepared, state } = useProtoForm();
  const { form } = prepared;
  const { derived, progress } = state;

  const container = findContainer(form.layout, id);
  if (!container) throw new Error(`Container not found: ${id}`);

  const visible = derived.visible.has(id);
  const disabled = derived.disabled.has(id);
  const isComplete = progress.completeContainers.has(id);
  const isCurrent = progress.currentContainer === id;

  return { container, visible, disabled, isComplete, isCurrent };
}
