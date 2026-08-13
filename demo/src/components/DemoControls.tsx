
import type { ProgressStyle } from "./MultiStepWizard";

interface DemoControlsProps {
  adapterName: string;
  adapterNames: string[];
  onAdapterChange: (name: string) => void;
  demoType: "single" | "multi";
  onDemoTypeChange: (type: "single" | "multi") => void;
  showCustomReferral: boolean;
  onCustomReferralChange: (show: boolean) => void;
  progressStyle: ProgressStyle;
  onProgressStyleChange: (style: ProgressStyle) => void;
}

export function DemoControls({
  adapterName, adapterNames, onAdapterChange,
  demoType, onDemoTypeChange,
  showCustomReferral, onCustomReferralChange,
  progressStyle, onProgressStyleChange,
}: DemoControlsProps) {
  return (
    <div style={{
      display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center",
      padding: "12px 16px", background: "var(--pf-bg-control)", borderRadius: "8px", border: "1px solid var(--pf-border)",
    }}>
      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--pf-text)" }}>
        Adapter:
        <select
          value={adapterName}
          onChange={(e) => onAdapterChange(e.target.value)}
          style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--pf-border-input)", background: "var(--pf-bg-card)", color: "var(--pf-text)" }}
        >
          {adapterNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--pf-text)" }}>
        Demo:
        <select
          value={demoType}
          onChange={(e) => onDemoTypeChange(e.target.value as "single" | "multi")}
          style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--pf-border-input)", background: "var(--pf-bg-card)", color: "var(--pf-text)" }}
        >
          <option value="single">Single Page (demo1)</option>
          <option value="multi">Multi-Step Wizard (demo2)</option>
        </select>
      </label>

      {demoType === "single" && (
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", cursor: "pointer", color: "var(--pf-text)" }}>
          <input
            type="checkbox"
            checked={showCustomReferral}
            onChange={(e) => onCustomReferralChange(e.target.checked)}
          />
          Custom referral field
        </label>
      )}

      {demoType === "multi" && (
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--pf-text)" }}>
          Progress:
          <select
            value={progressStyle}
            onChange={(e) => onProgressStyleChange(e.target.value as ProgressStyle)}
            style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--pf-border-input)", background: "var(--pf-bg-card)", color: "var(--pf-text)" }}
          >
            <option value="adapter">Adapter Stepper</option>
            <option value="buttons">Buttons (built-in)</option>
            <option value="circles">Circles (built-in)</option>
            <option value="bar">Progress Bar (built-in)</option>
          </select>
        </label>
      )}
    </div>
  );
}
