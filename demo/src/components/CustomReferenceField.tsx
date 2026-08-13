import type { FC } from "react";
import type { FieldKey } from "@protoform/react";
import { useFieldState } from "@protoform/react";
import { registerFunction, registerTemplate } from "@protoform/core";

// ── ProtoForm extensibility API ─────────────────────────────
// Register a custom expression function, then a rule template that
// delegates to it. Schemas can then use "referralInvalid" as a rule's
// `when` expression (the fieldId is inferred from the rule's target).
// Register the same pair in every engine that evaluates the schema —
// in Python use protoform.register_function / register_template.

// A referral code is valid when it matches ABC-1234 format AND its
// digit sum is divisible by 7 (a toy checksum — try PFX-3400).
registerFunction("referralCodeInvalid", (code: unknown): boolean => {
  if (typeof code !== "string" || code === "") return false; // empty is handled by `required`
  if (!/^[A-Z]{3}-\d{4}$/.test(code)) return true;
  const sum = code.slice(4).split("").reduce((acc, d) => acc + Number(d), 0);
  return sum % 7 !== 0;
});

registerTemplate("referralInvalid", {
  params: ["fieldId"],
  expression: "referralCodeInvalid(value('${fieldId}'))",
});

export const CustomReferenceField: FC<{ id: FieldKey }> = ({ id }) => {
  const { field, value, setValue, visible, disabled, required, messages, showErrors } = useFieldState(id);

  if (!visible) return null;

  const errorMessages = showErrors ? messages.filter((m) => m.type === "error") : [];

  return (
    <div style={{ padding: "12px", border: "2px dashed #6366f1", borderRadius: "8px", marginBottom: "16px" }}>
      <div style={{ fontSize: "11px", color: "#6366f1", fontWeight: 600, marginBottom: "4px" }}>
        CUSTOM REFERRAL FIELD
      </div>
      <label style={{ display: "block", fontWeight: 500, marginBottom: "4px" }}>
        {field.meta.label}
        {required && <span style={{ color: "red" }}> *</span>}
      </label>
      {field.meta.description && (
        <p style={{ fontSize: "12px", color: "var(--pf-text-secondary)", marginBottom: "4px" }}>{field.meta.description}</p>
      )}
      <input
        type="text"
        value={value || ""}
        onChange={(e) => {
          const raw = e.target.value.toUpperCase().replace(/\s+/g, "");
          const formatted = raw.replace(/^([A-Z]{3})(?!-)(\d)/, "$1-$2");
          setValue(formatted);
        }}
        disabled={disabled}
        placeholder="PFX-3400"
        style={{
          width: "100%", padding: "8px", border: errorMessages.length > 0 ? "2px solid red" : "1px solid var(--pf-border-input)",
          borderRadius: "4px", fontFamily: "monospace", fontSize: "16px", letterSpacing: "2px",
          background: "var(--pf-bg-card)", color: "var(--pf-text)",
        }}
      />
      {errorMessages.map((msg, i) => (
        <div key={i} style={{ color: "red", fontSize: "12px", marginTop: "4px" }}>{msg.message}</div>
      ))}
    </div>
  );
};
