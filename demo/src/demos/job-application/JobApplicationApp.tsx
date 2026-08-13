import { useState, useCallback, useEffect, useMemo } from "react";
import { ProtoForm, useProtoForm, ProtoContainer, scrollToFirstError } from "@protoform/react";
import type { ProtoFormAdapter, StepperRenderProps, FieldRenderProps, ContainerRenderProps, FormRenderProps } from "@protoform/react";
import type { FormValues } from "@protoform/core";
import { unstyledAdapter } from "@protoform/adapter-unstyled";
import { tailwindAdapter } from "@protoform/adapter-tailwind";
import { shadcnAdapter } from "@protoform/adapter-shadcn";
import { daisyuiAdapter } from "@protoform/adapter-daisyui";
import { antdAdapter } from "@protoform/adapter-antd";
import { jobApplicationSchema } from "./schema";
import type { ProgressStyle } from "../../components/MultiStepWizard";
import { BUILTIN_PROGRESS } from "../../components/MultiStepWizard";
import { darken, lighten } from "../../lib/color";

const API_BASE = "http://localhost:8000";

// ── Meridian brand colours (used by custom adapter) ─────────
const BRAND = {
  primary: "#0C4F58",
  primaryDark: "#093E45",
  accent: "#2a9b76",
  accentLight: "#6BA948",
  bg: "#efefef",
  card: "#ffffff",
  border: "#ddd",
  text: "#2d3a2e",
  muted: "#6b7c6b",
  light: "#f5f5f5",
  error: "#d94444",
  buttonRadius: "100px",
  cardRadius: "6px",
};

// ── Adapter registry ───────────────────────────────────────
type AdapterKey = "meridian" | "unstyled" | "tailwind" | "shadcn" | "daisyui" | "antd";

const ADAPTER_LABELS: Record<AdapterKey, string> = {
  meridian: "Meridian (custom)",
  unstyled: "Unstyled",
  tailwind: "Tailwind",
  shadcn: "Shadcn",
  daisyui: "DaisyUI",
  antd: "Ant Design",
};

const PROGRESS_LABELS: Record<ProgressStyle, string> = {
  adapter: "Adapter Stepper",
  buttons: "Buttons (built-in)",
  circles: "Circles (built-in)",
  bar: "Progress Bar (built-in)",
};

// ── Font registry ──────────────────────────────────────────
type FontKey = "system" | "inter" | "roboto";

const FONT_LABELS: Record<FontKey, string> = {
  system: "System Default",
  inter: "Inter",
  roboto: "Roboto",
};

const FONT_FAMILIES: Record<FontKey, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  inter: "'Inter', sans-serif",
  roboto: "'Roboto', sans-serif",
};

// ── Color mode ──────────────────────────────────────────────
type ColorMode = "system" | "light" | "dark";

function useResolvedColorMode(mode: ColorMode): "light" | "dark" {
  const [sys, setSys] = useState<"light" | "dark">(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e: MediaQueryListEvent) => setSys(e.matches ? "dark" : "light");
    mql.addEventListener("change", h);
    return () => mql.removeEventListener("change", h);
  }, []);
  return mode === "system" ? sys : mode;
}

// ── Per-adapter theme — drives the demo shell appearance ───
type DemoTheme = typeof BRAND;

const THEMES: Record<AdapterKey, DemoTheme> = {
  meridian: BRAND,
  unstyled: {
    primary: "#333333", primaryDark: "#222222",
    accent: "#555555", accentLight: "#888888",
    bg: "#ffffff", card: "#ffffff", border: "#cccccc",
    text: "#111111", muted: "#666666", light: "#f5f5f5", error: "#cc0000",
    buttonRadius: "4px", cardRadius: "4px",
  },
  tailwind: {
    primary: "#4f46e5", primaryDark: "#4338ca",
    accent: "#06b6d4", accentLight: "#22d3ee",
    bg: "#f1f5f9", card: "#ffffff", border: "#e2e8f0",
    text: "#0f172a", muted: "#64748b", light: "#f8fafc", error: "#ef4444",
    buttonRadius: "8px", cardRadius: "12px",
  },
  shadcn: {
    primary: "#18181b", primaryDark: "#09090b",
    accent: "#18181b", accentLight: "#52525b",
    bg: "#fafafa", card: "#ffffff", border: "#e4e4e7",
    text: "#09090b", muted: "#71717a", light: "#f4f4f5", error: "#ef4444",
    buttonRadius: "6px", cardRadius: "12px",
  },
  daisyui: {
    primary: "#570df8", primaryDark: "#4506cb",
    accent: "#37cdbe", accentLight: "#66efda",
    bg: "#f2f2f2", card: "#ffffff", border: "#e5e7eb",
    text: "#1f2937", muted: "#6b7280", light: "#f9fafb", error: "#f87272",
    buttonRadius: "100px", cardRadius: "16px",
  },
  antd: {
    primary: "#1677ff", primaryDark: "#0958d9",
    accent: "#1677ff", accentLight: "#4096ff",
    bg: "#f5f5f5", card: "#ffffff", border: "#d9d9d9",
    text: "rgba(0,0,0,0.88)", muted: "rgba(0,0,0,0.45)", light: "#fafafa", error: "#ff4d4f",
    buttonRadius: "6px", cardRadius: "8px",
  },
};

function toDarkTheme(t: DemoTheme): DemoTheme {
  return { ...t, bg: "#0f1117", card: "#1a1d27", border: "#2a2d3a",
    text: "#e2e4e9", muted: "#8b8fa3", light: "#1e2130" };
}

// ── LocalStorage persistence ───────────────────────────────
const STORAGE_KEY = "protoform_jobapp_settings";

interface DemoSettings {
  adapterKey: AdapterKey;
  progressStyle: ProgressStyle;
  showErrorsOnTouch: boolean;
  useServer: boolean;
  fontFamily: FontKey;
  colorMode: ColorMode;
  customPrimary: string | null;
  customAccent: string | null;
}

function loadSettings(): Partial<DemoSettings> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch { return {}; }
}

// ── Built-in Meridian adapter ──────────────────────────────
function makeMeridianAdapter(t: DemoTheme): ProtoFormAdapter {
  return {
    renderField: (props: FieldRenderProps) => {
      const { id, field, value, setValue, disabled, required, readOnly, messages, showErrors, visible } = props;
      if (!visible) return null;

      const errors = showErrors ? messages.filter((m) => m.type === "error") : [];
      const hasError = errors.length > 0;
      const meta = field.meta;

      const labelEl = meta.type !== "checkbox" ? (
        <label htmlFor={id} style={{ display: "block", fontSize: "13px", fontWeight: 300, color: t.text, marginBottom: "5px" }}>
          {meta.label}{required && <span style={{ color: t.error, marginLeft: "3px" }}>*</span>}
        </label>
      ) : null;

      const errorEl = hasError ? (
        <div style={{ marginTop: "4px" }}>
          {errors.map((e, i) => (
            <div key={i} style={{ fontSize: "12px", color: t.error, fontWeight: 300 }}>{e.message}</div>
          ))}
        </div>
      ) : null;

      const inputStyle: React.CSSProperties = {
        width: "100%", padding: "10px 14px", fontSize: "14px", fontWeight: 300,
        border: `1px solid ${hasError ? t.error : t.border}`,
        borderRadius: "6px", outline: "none", background: disabled ? t.light : t.card,
        color: t.text, transition: "border-color 150ms",
      };

      if (meta.type === "checkbox") {
        return (
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor={id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: disabled ? "not-allowed" : "pointer" }}>
              <input id={id} type="checkbox" checked={!!value} disabled={disabled} readOnly={readOnly}
                onChange={(e) => setValue(e.target.checked)}
                style={{ marginTop: "3px", width: "18px", height: "18px", accentColor: t.accent, flexShrink: 0 }}
              />
              <span style={{ fontSize: "14px", fontWeight: 300, color: t.text, lineHeight: "1.5" }}>
                {meta.label}{required && <span style={{ color: t.error, marginLeft: "3px" }}>*</span>}
              </span>
            </label>
            {errorEl}
          </div>
        );
      }

      if (meta.type === "select") {
        const options = (meta.properties?.options as { label: string; value: string }[]) || [];
        return (
          <div style={{ marginBottom: "16px" }}>
            {labelEl}
            <select id={id} value={value ?? ""} disabled={disabled}
              onChange={(e) => setValue(e.target.value || null)}
              style={{ ...inputStyle, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: "36px" }}
            >
              <option value="">Select...</option>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errorEl}
          </div>
        );
      }

      if (meta.type === "textarea") {
        return (
          <div style={{ marginBottom: "16px" }}>
            {labelEl}
            <textarea
              id={id} value={value ?? ""} disabled={disabled} readOnly={readOnly}
              placeholder={meta.properties?.placeholder as string}
              rows={6}
              onChange={(e) => setValue(e.target.value)}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              onFocus={(e) => { e.target.style.borderColor = t.accent; }}
              onBlur={(e) => { e.target.style.borderColor = hasError ? t.error : t.border; }}
            />
            {errorEl}
          </div>
        );
      }

      if (meta.type === "file") {
        const files: { name?: string }[] = Array.isArray(value) ? value : [];
        return (
          <div style={{ marginBottom: "16px" }}>
            {labelEl}
            <label htmlFor={id} style={{
              display: "block", border: `2px dashed ${hasError ? t.error : t.border}`,
              borderRadius: "6px", padding: "20px", textAlign: "center",
              cursor: disabled ? "not-allowed" : "pointer",
              background: disabled ? t.light : t.card, color: t.muted,
              fontSize: "13px", fontWeight: 300,
            }}>
              {files.length > 0
                ? files.map((f, i) => f.name || `File ${i + 1}`).join(", ")
                : "Drop a file here or click to browse"}
              {meta.properties?.accept && (
                <div style={{ fontSize: "11px", marginTop: "4px" }}>{meta.properties.accept as string}</div>
              )}
              <input id={id} type="file" style={{ display: "none" }} disabled={disabled}
                accept={meta.properties?.accept as string}
                onChange={(e) => {
                  const fl = e.target.files;
                  setValue(fl && fl.length > 0 ? Array.from(fl) : null);
                  e.target.value = "";
                }}
              />
            </label>
            {errorEl}
          </div>
        );
      }

      return (
        <div style={{ marginBottom: "16px" }}>
          {labelEl}
          <input
            id={id} type={meta.type === "number" ? "number" : meta.type === "date" ? "date" : meta.type === "email" ? "email" : "text"}
            value={value ?? ""} disabled={disabled} readOnly={readOnly}
            placeholder={meta.properties?.placeholder as string}
            min={meta.properties?.min as number} max={meta.properties?.max as number}
            step={meta.properties?.step as number}
            onChange={(e) => {
              const v = e.target.value;
              setValue(meta.type === "number" ? (v === "" ? null : parseFloat(v)) : v);
            }}
            style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = t.accent; }}
            onBlur={(e) => { e.target.style.borderColor = hasError ? t.error : t.border; }}
          />
          {errorEl}
        </div>
      );
    },

    renderContainer: (props: ContainerRenderProps) => {
      if (!props.visible) return null;
      return (
        <div>
          {props.container.meta.sub_title && (
            <p style={{ fontSize: "14px", color: t.muted, margin: "0 0 24px" }}>{props.container.meta.sub_title}</p>
          )}
          {props.children}
        </div>
      );
    },

    renderForm: (props: FormRenderProps) => (
      <form onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>{props.children}</form>
    ),

    renderStepper: (props: StepperRenderProps) => {
      const { steps, currentStep, onStepClick, canNavigateTo } = props;
      return (
        <div style={{ display: "flex", alignItems: "center", padding: "0 0 32px" }}>
          {steps.map((step, idx) => {
            const isCurrent = idx === currentStep;
            const isComplete = step.isComplete;
            const navigable = canNavigateTo(idx);
            return (
              <div key={step.id} style={{ display: "flex", alignItems: "center", flex: idx < steps.length - 1 ? 1 : "none" }}>
                <div onClick={() => navigable && onStepClick(idx)}
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isComplete ? t.accent : isCurrent ? t.primary : t.border,
                    color: isComplete || isCurrent ? "#fff" : t.muted,
                    fontSize: "13px", fontWeight: 500, flexShrink: 0,
                    cursor: navigable ? "pointer" : "default", transition: "all 200ms",
                    border: isCurrent ? `2px solid ${t.primaryDark}` : "2px solid transparent",
                  }}
                >
                  {isComplete ? "✓" : idx + 1}
                </div>
                <div style={{
                  position: "absolute", marginTop: "52px", width: "80px", textAlign: "center",
                  marginLeft: "-22px", fontSize: "11px", fontWeight: isCurrent ? 500 : 300,
                  color: isCurrent ? t.text : t.muted,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {step.title}
                </div>
                {idx < steps.length - 1 && (
                  <div style={{ flex: 1, height: "2px", margin: "0 8px", background: isComplete ? t.accent : t.border, transition: "background 200ms" }} />
                )}
              </div>
            );
          })}
        </div>
      );
    },
  };
}

// ── CustomColorStyles — accent/focus overrides for custom color pickers ──
function CustomColorStyles({ theme }: { theme: DemoTheme }) {
  const css = `
.pf-form-area input:focus,
.pf-form-area select:focus,
.pf-form-area textarea:focus {
  border-color: ${theme.accent} !important;
}
.pf-form-area input[type="checkbox"],
.pf-form-area input[type="radio"] {
  accent-color: ${theme.accent} !important;
}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

// ── Settings drawer ────────────────────────────────────────
function SettingsDrawer({ open, onClose, adapterKey, onAdapterChange, progressStyle, onProgressStyleChange, showErrorsOnTouch, onShowErrorsChange, useServer, onUseServerChange, serverConnected, fontFamily, onFontChange, colorMode, onColorModeChange, customPrimary, onCustomPrimaryChange, customAccent, onCustomAccentChange, theme }: {
  open: boolean;
  onClose: () => void;
  adapterKey: AdapterKey;
  onAdapterChange: (k: AdapterKey) => void;
  progressStyle: ProgressStyle;
  onProgressStyleChange: (s: ProgressStyle) => void;
  showErrorsOnTouch: boolean;
  onShowErrorsChange: (v: boolean) => void;
  useServer: boolean;
  onUseServerChange: (v: boolean) => void;
  serverConnected: boolean;
  fontFamily: FontKey;
  onFontChange: (f: FontKey) => void;
  colorMode: ColorMode;
  onColorModeChange: (m: ColorMode) => void;
  customPrimary: string | null;
  onCustomPrimaryChange: (c: string | null) => void;
  customAccent: string | null;
  onCustomAccentChange: (c: string | null) => void;
  theme: DemoTheme;
}) {
  const sectionLabel: React.CSSProperties = { fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: theme.muted, marginBottom: "10px" };
  const optionBtn = (active: boolean): React.CSSProperties => ({
    display: "block", width: "100%", padding: "10px 14px", fontSize: "13px", fontWeight: active ? 500 : 300,
    textAlign: "left", border: `1px solid ${active ? theme.primary : theme.border}`,
    borderRadius: "6px", background: active ? theme.light : theme.card,
    color: active ? theme.primary : theme.text, cursor: "pointer",
    marginBottom: "6px", transition: "all 100ms",
  });
  const modeBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "8px 0", fontSize: "12px", fontWeight: active ? 600 : 400,
    border: `1px solid ${active ? theme.primary : theme.border}`,
    borderRadius: "6px", background: active ? theme.light : theme.card,
    color: active ? theme.primary : theme.text, cursor: "pointer", transition: "all 100ms",
  });

  return (
    <>
      {/* Backdrop */}
      {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 200, transition: "opacity 200ms" }} />}

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "320px",
        background: theme.card, borderLeft: `1px solid ${theme.border}`,
        boxShadow: open ? "-8px 0 24px rgba(0,0,0,0.08)" : "none",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 201, display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: theme.text }}>Settings</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", color: theme.muted, cursor: "pointer", padding: "4px", lineHeight: 1 }}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", flex: 1, overflowY: "auto" }}>
          {/* Adapter */}
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionLabel}>UI Framework</div>
            {(Object.keys(ADAPTER_LABELS) as AdapterKey[]).map((k) => (
              <button key={k} onClick={() => onAdapterChange(k)} style={optionBtn(adapterKey === k)}>
                {adapterKey === k && <span style={{ marginRight: "6px" }}>&#10003;</span>}
                {ADAPTER_LABELS[k]}
              </button>
            ))}
          </div>

          {/* Font */}
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionLabel}>Font</div>
            {(Object.keys(FONT_LABELS) as FontKey[]).map((f) => (
              <button key={f} onClick={() => onFontChange(f)} style={optionBtn(fontFamily === f)}>
                {fontFamily === f && <span style={{ marginRight: "6px" }}>&#10003;</span>}
                <span style={{ fontFamily: FONT_FAMILIES[f] }}>{FONT_LABELS[f]}</span>
              </button>
            ))}
          </div>

          {/* Color Mode */}
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionLabel}>Color Mode</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["system", "light", "dark"] as ColorMode[]).map((m) => (
                <button key={m} onClick={() => onColorModeChange(m)} style={modeBtn(colorMode === m)}>
                  {m === "system" ? "System" : m === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Color */}
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionLabel}>Primary Color</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input type="color" value={customPrimary ?? theme.primary}
                onChange={(e) => onCustomPrimaryChange(e.target.value)}
                style={{ width: "36px", height: "36px", border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "2px", cursor: "pointer", background: theme.card }}
              />
              <code style={{ fontSize: "12px", color: theme.muted, background: theme.light, padding: "4px 8px", borderRadius: "4px" }}>
                {customPrimary ?? theme.primary}
              </code>
              {customPrimary && (
                <button onClick={() => onCustomPrimaryChange(null)}
                  style={{ fontSize: "11px", color: theme.muted, background: "none", border: `1px solid ${theme.border}`, borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}>
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Accent Color */}
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionLabel}>Accent Color</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input type="color" value={customAccent ?? theme.accent}
                onChange={(e) => onCustomAccentChange(e.target.value)}
                style={{ width: "36px", height: "36px", border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "2px", cursor: "pointer", background: theme.card }}
              />
              <code style={{ fontSize: "12px", color: theme.muted, background: theme.light, padding: "4px 8px", borderRadius: "4px" }}>
                {customAccent ?? theme.accent}
              </code>
              {customAccent && (
                <button onClick={() => onCustomAccentChange(null)}
                  style={{ fontSize: "11px", color: theme.muted, background: "none", border: `1px solid ${theme.border}`, borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}>
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Progress style */}
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionLabel}>Progress Indicator</div>
            {(Object.keys(PROGRESS_LABELS) as ProgressStyle[]).map((s) => (
              <button key={s} onClick={() => onProgressStyleChange(s)} style={optionBtn(progressStyle === s)}>
                {progressStyle === s && <span style={{ marginRight: "6px" }}>&#10003;</span>}
                {PROGRESS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Error display */}
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionLabel}>Error Display</div>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", color: theme.text }}>
              <input type="checkbox" checked={showErrorsOnTouch} onChange={(e) => onShowErrorsChange(e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: theme.primary }}
              />
              Show errors only after interaction
            </label>
            <p style={{ fontSize: "11px", color: theme.muted, margin: "6px 0 0", lineHeight: "1.4" }}>
              When enabled, validation errors appear only after the user has interacted with a field or tried to advance.
            </p>
          </div>

          {/* Server validation */}
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionLabel}>Server Validation</div>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", color: theme.text }}>
              <input type="checkbox" checked={useServer} onChange={(e) => onUseServerChange(e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: theme.primary }}
              />
              Enable Django backend
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: serverConnected ? theme.accent : theme.error,
              }} />
              <span style={{ fontSize: "11px", color: theme.muted }}>
                {serverConnected ? "Connected to localhost:8000" : "Server not reachable"}
              </span>
            </div>
            <p style={{ fontSize: "11px", color: theme.muted, margin: "6px 0 0", lineHeight: "1.4" }}>
              Run <code style={{ background: theme.light, padding: "1px 4px", borderRadius: "3px", fontSize: "10px" }}>cd demo/server && python manage.py runserver</code> to start the backend.
              Enables server-side screening checks the rule engine can't express.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${theme.border}`, fontSize: "11px", color: theme.muted, textAlign: "center" }}>
          Powered by ProtoForm
        </div>
      </div>
    </>
  );
}

// ── Form content (inside ProtoForm context) ────────────────
function ApplicationFormContent({ onSubmit, useServer, progressStyle, theme }: { onSubmit: (values: FormValues) => void; useServer: boolean; progressStyle: ProgressStyle; theme: DemoTheme }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const { prepared, state, touchContainerFields, setCurrentContainer, adapter, externalErrors, setExternalErrors } = useProtoForm();

  const steps = prepared.form.layout;
  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);
  const isLastStep = currentStep === steps.length - 1;

  useEffect(() => {
    setCurrentContainer(stepIds[currentStep]);
  }, [currentStep, stepIds, setCurrentContainer]);

  const canNavigateTo = useCallback(
    (idx: number) => {
      if (idx <= currentStep) return true;
      for (let i = 0; i < idx; i++) {
        if (!state.progress.completeContainers.has(steps[i].id)) return false;
      }
      return true;
    },
    [steps, currentStep, state.progress.completeContainers],
  );

  const handleStepClick = useCallback((idx: number) => {
    if (canNavigateTo(idx)) setCurrentStep(idx);
  }, [canNavigateTo]);

  const validateStepOnServer = useCallback(async (stepId: string, values: FormValues): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/application/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepId, values }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.errors) {
          setExternalErrors(data.errors);
          scrollToFirstError(stepId, prepared, state, data.errors);
        }
        return false;
      }
      return true;
    } catch {
      console.error("Server validation unavailable");
      return true;
    } finally {
      setLoading(false);
    }
  }, [prepared, state, setExternalErrors]);

  const submitToServer = useCallback(async (values: FormValues): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/application/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.errors) {
          setExternalErrors(data.errors);
          const firstField = Object.keys(data.errors)[0];
          if (firstField) {
            const el = document.getElementById(firstField);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
        return false;
      }
      return true;
    } catch {
      console.error("Server submission unavailable");
      return true;
    } finally {
      setLoading(false);
    }
  }, [setExternalErrors]);

  const handleNext = useCallback(async () => {
    const id = stepIds[currentStep];
    if (!state.progress.completeContainers.has(id)) {
      touchContainerFields(id);
      scrollToFirstError(id, prepared, state, externalErrors);
      return;
    }
    if (useServer) {
      const ok = await validateStepOnServer(id, state.values);
      if (!ok) return;
    }
    setCurrentStep((p) => Math.min(p + 1, steps.length - 1));
  }, [stepIds, currentStep, state, touchContainerFields, prepared, steps.length, externalErrors, useServer, validateStepOnServer]);

  const handlePrev = useCallback(() => {
    setCurrentStep((p) => Math.max(p - 1, 0));
  }, []);

  const handleSubmit = useCallback(async () => {
    const id = stepIds[currentStep];
    if (!state.progress.completeContainers.has(id)) {
      touchContainerFields(id);
      scrollToFirstError(id, prepared, state, externalErrors);
      return;
    }
    if (useServer) {
      const ok = await submitToServer(state.values);
      if (!ok) return;
    }
    onSubmit(state.values);
  }, [stepIds, currentStep, state, touchContainerFields, prepared, externalErrors, onSubmit, useServer, submitToServer]);

  // ── Progress indicator ──
  const stepperProps: StepperRenderProps = useMemo(() => ({
    steps: steps.map((s) => ({
      id: s.id,
      title: s.meta.title || s.id,
      subtitle: s.meta.sub_title,
      isComplete: state.progress.completeContainers.has(s.id),
      isCurrent: s.id === stepIds[currentStep],
    })),
    currentStep,
    onStepClick: handleStepClick,
    canNavigateTo,
  }), [steps, state.progress.completeContainers, stepIds, currentStep, handleStepClick, canNavigateTo]);

  const useAdapterStepper = progressStyle === "adapter" && adapter.renderStepper;
  const stepperContent = useAdapterStepper
    ? adapter.renderStepper!(stepperProps)
    : (() => {
        const style = progressStyle === "adapter" ? "buttons" : progressStyle;
        const BuiltinComponent = BUILTIN_PROGRESS[style];
        return (
          <BuiltinComponent
            steps={steps}
            currentStep={currentStep}
            completedSet={state.progress.completeContainers}
            onStepClick={handleStepClick}
            canNavigateTo={canNavigateTo}
            theme={theme}
          />
        );
      })();

  const needsExtraSpacing = progressStyle === "circles" || (useAdapterStepper && progressStyle === "adapter");

  const btnBase: React.CSSProperties = {
    padding: "12px 32px", fontSize: "14px", fontWeight: 500, borderRadius: theme.buttonRadius,
    cursor: "pointer", border: "none", transition: "all 150ms", letterSpacing: "0.01em",
  };

  return (
    <>
      {/* Sub-nav: full-width progress bar */}
      <nav style={{
        background: theme.card, borderBottom: `1px solid ${theme.border}`,
        position: "sticky", top: 60, zIndex: 99,
        transition: "background 300ms",
        animation: "fadeSlideDown 0.5s cubic-bezier(.29,.79,.42,.98) 0.8s both",
      }}>
        {/* subnav-progress class strips child marginBottom via CSS */}
        <div className="subnav-progress" style={{ maxWidth: "720px", margin: "0 auto", padding: needsExtraSpacing ? "16px 24px 32px" : "16px 24px" }}>
          {stepperContent}
        </div>
      </nav>

      {/* Main content */}
      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 500, color: theme.text, margin: "0 0 6px" }}>Job Application</h1>
          <p style={{ fontSize: "14px", fontWeight: 300, color: theme.muted, margin: 0 }}>Complete the steps below to submit your application. All fields marked with * are required.</p>
        </div>

        <ProtoContainer id={stepIds[currentStep]} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "32px", paddingTop: "24px", borderTop: `1px solid ${theme.border}` }}>
          <button type="button" onClick={handlePrev} disabled={currentStep === 0 || loading}
            style={{ ...btnBase, background: "transparent", color: theme.primary, border: `1px solid ${theme.primary}`, opacity: currentStep === 0 ? 0.3 : 1, cursor: currentStep === 0 ? "not-allowed" : "pointer" }}
          >
            Previous
          </button>
          {isLastStep ? (
            <button type="button" onClick={handleSubmit} disabled={loading} style={{ ...btnBase, background: theme.accent, color: "#fff", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Submitting..." : "Submit Application"}
            </button>
          ) : (
            <button type="button" onClick={handleNext} disabled={loading} style={{ ...btnBase, background: theme.primary, color: "#fff", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Validating..." : "Next"}
            </button>
          )}
        </div>
      </main>
    </>
  );
}

// ── Success screen ─────────────────────────────────────────
function SuccessScreen({ onReset, theme }: { onReset: () => void; theme: DemoTheme }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: theme.light, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
        <span style={{ fontSize: "36px", color: theme.accent }}>&#10003;</span>
      </div>
      <h2 style={{ fontSize: "24px", fontWeight: 500, color: theme.text, margin: "0 0 12px" }}>Application Submitted</h2>
      <p style={{ fontSize: "15px", fontWeight: 300, color: theme.muted, maxWidth: "400px", margin: "0 auto 32px", lineHeight: "1.6" }}>
        Thank you for applying. Our hiring team will review your details and get back to you within a few business days.
      </p>
      <button onClick={onReset} style={{ padding: "12px 32px", fontSize: "14px", fontWeight: 500, borderRadius: theme.buttonRadius, background: theme.primary, color: "#fff", border: "none", cursor: "pointer" }}>
        Start New Application
      </button>
    </div>
  );
}

// ── Gear icon SVG ──────────────────────────────────────────
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Main app shell ─────────────────────────────────────────
export function JobApplicationApp({ onExit }: { onExit: () => void }) {
  const saved = useMemo(() => loadSettings(), []);

  const [submitted, setSubmitted] = useState(false);
  const [key, setKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [adapterKey, setAdapterKey] = useState<AdapterKey>((saved.adapterKey as AdapterKey) || "meridian");
  const [progressStyle, setProgressStyle] = useState<ProgressStyle>((saved.progressStyle as ProgressStyle) || "bar");
  const [showErrorsOnTouch, setShowErrorsOnTouch] = useState(saved.showErrorsOnTouch ?? true);
  const [useServer, setUseServer] = useState(saved.useServer ?? false);
  const [fontFamily, setFontFamily] = useState<FontKey>((saved.fontFamily as FontKey) || "inter");
  const [colorMode, setColorMode] = useState<ColorMode>((saved.colorMode as ColorMode) || "system");
  const [customPrimary, setCustomPrimary] = useState<string | null>(saved.customPrimary ?? null);
  const [customAccent, setCustomAccent] = useState<string | null>(saved.customAccent ?? null);
  const [serverConnected, setServerConnected] = useState(false);

  const resolvedMode = useResolvedColorMode(colorMode);

  // Compute effective theme: base → custom colors → dark mode
  const theme = useMemo(() => {
    const base = { ...THEMES[adapterKey] };
    if (customPrimary) {
      base.primary = customPrimary;
      base.primaryDark = darken(customPrimary, 0.08);
    }
    if (customAccent) {
      base.accent = customAccent;
      base.accentLight = lighten(customAccent, 0.12);
    }
    return resolvedMode === "dark" ? toDarkTheme(base) : base;
  }, [adapterKey, customPrimary, customAccent, resolvedMode]);

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ adapterKey, progressStyle, showErrorsOnTouch, useServer, fontFamily, colorMode, customPrimary, customAccent }));
  }, [adapterKey, progressStyle, showErrorsOnTouch, useServer, fontFamily, colorMode, customPrimary, customAccent]);

  // Ping server on mount and periodically
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch(`${API_BASE}/api/application/`, { method: "GET" })
        .then((r) => { if (!cancelled) setServerConnected(r.ok); })
        .catch(() => { if (!cancelled) setServerConnected(false); });
    };
    check();
    const interval = setInterval(check, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const adapter = useMemo((): ProtoFormAdapter => {
    switch (adapterKey) {
      case "unstyled": return unstyledAdapter;
      case "tailwind": return tailwindAdapter;
      case "shadcn": return shadcnAdapter;
      case "daisyui": return daisyuiAdapter;
      case "antd": return antdAdapter;
      default: return makeMeridianAdapter(theme);
    }
  }, [adapterKey, theme]);

  const handleSubmit = useCallback((values: FormValues) => {
    console.log("Application submitted:", values);
    setSubmitted(true);
  }, []);

  const handleReset = useCallback(() => {
    setSubmitted(false);
    setKey((k) => k + 1);
  }, []);

  // Reset form when adapter changes so the new adapter renders cleanly
  useEffect(() => {
    setKey((k) => k + 1);
    setSubmitted(false);
  }, [adapterKey]);

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, fontFamily: FONT_FAMILIES[fontFamily], transition: "background 300ms" }}>
      <CustomColorStyles theme={theme} />

      {/* Header */}
      <header style={{
        background: theme.primary, borderBottom: `1px solid ${theme.primaryDark}`,
        padding: "0 24px", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        animation: "slideDown 0.8s cubic-bezier(.29,.79,.42,.98)",
        transition: "background 300ms",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "18px", fontWeight: 500, color: "#fff", letterSpacing: "0.02em" }}>Meridian Talent</span>
          {useServer && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "100px", background: serverConnected ? "rgba(255,255,255,0.15)" : "rgba(255,100,100,0.2)", fontSize: "10px", fontWeight: 400, color: "#fff" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: serverConnected ? theme.accentLight : "#ff6b6b" }} />
              {serverConnected ? "API" : "offline"}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={onExit}
            style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 400, borderRadius: "100px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "rgba(255,255,255,0.8)", cursor: "pointer" }}
          >
            Exit
          </button>
          <button onClick={() => setDrawerOpen(true)}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)",
              background: "transparent", color: "rgba(255,255,255,0.8)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* Settings drawer */}
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        adapterKey={adapterKey}
        onAdapterChange={setAdapterKey}
        progressStyle={progressStyle}
        onProgressStyleChange={setProgressStyle}
        showErrorsOnTouch={showErrorsOnTouch}
        onShowErrorsChange={setShowErrorsOnTouch}
        useServer={useServer}
        onUseServerChange={setUseServer}
        serverConnected={serverConnected}
        fontFamily={fontFamily}
        onFontChange={setFontFamily}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        customPrimary={customPrimary}
        onCustomPrimaryChange={setCustomPrimary}
        customAccent={customAccent}
        onCustomAccentChange={setCustomAccent}
        theme={theme}
      />

      {/* Content */}
      {submitted ? (
        <main style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px 80px" }}>
          <SuccessScreen onReset={handleReset} theme={theme} />
        </main>
      ) : (
        <div className="pf-form-area">
          <ProtoForm
            key={key}
            schema={jobApplicationSchema}
            initialValues={{}}
            adapter={adapter}
            darkMode={resolvedMode === "dark"}
            showSubmitButton={false}
            showErrorsOnTouch={showErrorsOnTouch}
            autoLayout={false}
            onSubmit={handleSubmit}
          >
            {() => <ApplicationFormContent onSubmit={handleSubmit} useServer={useServer} progressStyle={progressStyle} theme={theme} />}
          </ProtoForm>
        </div>
      )}

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "16px 24px", fontSize: "12px", fontWeight: 300, color: theme.muted, borderTop: `1px solid ${theme.border}` }}>
        Meridian Talent is a demo application powered by ProtoForm. Not a real company.
      </footer>
    </div>
  );
}
