import { useState, useEffect, useCallback, useMemo } from "react";
import { useProtoForm, ProtoContainer, scrollToFirstError } from "@protoform/react";
import type { StepperRenderProps } from "@protoform/react";
import type { Container } from "@protoform/core";

export type ProgressStyle = "adapter" | "buttons" | "circles" | "bar";

interface MultiStepWizardProps {
  progressStyle?: ProgressStyle;
  onSubmit?: () => void;
}

// --- Built-in progress indicator variants ---

function ButtonProgress({ steps, currentStep, completedSet, onStepClick, canNavigateTo, theme: t }: BuiltinProgressProps) {
  const primary = t?.primary ?? "#3b82f6";
  const accent = t?.accent ?? "#22c55e";
  const textColor = t?.text ?? "#333";
  const lightBg = t?.light ?? "#f3f4f6";
  const borderColor = t?.border ?? "#ccc";
  return (
    <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
      {steps.map((step, idx) => {
        const isComplete = completedSet.has(step.id);
        const navigable = canNavigateTo(idx);
        return (
          <button
            key={step.id}
            onClick={() => navigable && onStepClick(idx)}
            disabled={!navigable}
            style={{
              padding: "6px 14px", borderRadius: "4px", border: `1px solid ${borderColor}`,
              background: idx === currentStep ? primary : isComplete ? accent : lightBg,
              color: idx === currentStep || isComplete ? "white" : textColor,
              cursor: navigable ? "pointer" : "not-allowed",
              opacity: navigable ? 1 : 0.5,
              fontSize: "13px",
            }}
          >
            {idx + 1}. {step.meta.title}
            {isComplete && " \u2713"}
          </button>
        );
      })}
    </div>
  );
}

function CircleProgress({ steps, currentStep, completedSet, onStepClick, canNavigateTo, theme: t }: BuiltinProgressProps) {
  const primary = t?.primary ?? "#3b82f6";
  const accent = t?.accent ?? "#22c55e";
  const textColor = t?.text ?? "#1e293b";
  const mutedColor = t?.muted ?? "#94a3b8";
  const trackColor = t?.border ?? "#e2e8f0";
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "28px", padding: "0 8px" }}>
      {steps.map((step, idx) => {
        const isComplete = completedSet.has(step.id);
        const isCurrent = idx === currentStep;
        const navigable = canNavigateTo(idx);
        const bg = isCurrent ? primary : isComplete ? accent : trackColor;
        const fg = isCurrent || isComplete ? "white" : mutedColor;
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center", flex: idx < steps.length - 1 ? 1 : "none" }}>
            <div
              onClick={() => navigable && onStepClick(idx)}
              style={{
                width: 36, height: 36, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", background: bg,
                color: fg, fontSize: "13px", fontWeight: 600,
                cursor: navigable ? "pointer" : "not-allowed",
                opacity: navigable ? 1 : 0.5,
                border: isCurrent ? `2px solid ${primary}` : "2px solid transparent",
                transition: "all 150ms", flexShrink: 0,
              }}
              title={step.meta.title}
            >
              {isComplete ? "\u2713" : idx + 1}
            </div>
            <div style={{
              position: "absolute", marginTop: "52px", width: "80px", textAlign: "center",
              marginLeft: "-22px", fontSize: "11px", color: isCurrent ? textColor : mutedColor,
              fontWeight: isCurrent ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden",
              textOverflow: "ellipsis", pointerEvents: "none",
            }}>
              {step.meta.title}
            </div>
            {idx < steps.length - 1 && (
              <div style={{
                flex: 1, height: "2px", margin: "0 8px",
                background: completedSet.has(step.id) ? accent : trackColor,
                transition: "background 150ms",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BarProgress({ steps, currentStep, completedSet, theme: t }: BuiltinProgressProps) {
  const completedCount = steps.filter((s) => completedSet.has(s.id)).length;
  const pct = Math.round((completedCount / steps.length) * 100);
  const currentTitle = steps[currentStep]?.meta.title ?? "";
  const primary = t?.primary ?? "#3b82f6";
  const accent = t?.accent ?? "#22c55e";
  const textColor = t?.text ?? "#1e293b";
  const mutedColor = t?.muted ?? "#64748b";
  const trackColor = t?.border ?? "#e2e8f0";
  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px" }}>
        <span style={{ fontWeight: 600, color: textColor }}>
          Step {currentStep + 1} of {steps.length}: {currentTitle}
        </span>
        <span style={{ color: mutedColor }}>{pct}%</span>
      </div>
      <div style={{ height: "8px", background: trackColor, borderRadius: "4px", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${primary}, ${accent})`,
          borderRadius: "4px", transition: "width 300ms ease",
        }} />
      </div>
    </div>
  );
}

export interface BuiltinProgressProps {
  steps: Container[];
  currentStep: number;
  completedSet: Set<string>;
  onStepClick: (idx: number) => void;
  canNavigateTo: (idx: number) => boolean;
  theme?: { primary: string; accent: string; text: string; muted: string; border: string; card: string; light: string };
}

export const BUILTIN_PROGRESS: Record<Exclude<ProgressStyle, "adapter">, (props: BuiltinProgressProps) => JSX.Element> = {
  buttons: ButtonProgress,
  circles: CircleProgress,
  bar: BarProgress,
};

// --- Navigation restriction logic ---

/** Can only go to completed steps, the first incomplete step, or the current step. No skipping ahead. */
function makeCanNavigateTo(steps: Container[], currentStep: number, completedSet: Set<string>) {
  return (idx: number): boolean => {
    if (idx === currentStep) return true;
    if (idx < currentStep) return true; // can always go back
    // Can go forward only if all previous steps are complete
    for (let i = 0; i < idx; i++) {
      if (!completedSet.has(steps[i].id)) return false;
    }
    return true;
  };
}

// --- Button styles ---

const navBtnBase: React.CSSProperties = {
  padding: "8px 20px",
  fontSize: "14px",
  fontWeight: 500,
  borderRadius: "6px",
  cursor: "pointer",
  border: "1px solid var(--pf-nav-btn-border)",
  background: "var(--pf-nav-btn-bg)",
  color: "var(--pf-nav-btn-text)",
};

// --- Main wizard ---

export function MultiStepWizard({ progressStyle = "adapter", onSubmit }: MultiStepWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const { prepared, state, touchContainerFields, setCurrentContainer, adapter, externalErrors } = useProtoForm();

  const steps = prepared.form.layout;
  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);
  const isLastStep = currentStep === steps.length - 1;

  useEffect(() => {
    setCurrentContainer(stepIds[currentStep]);
  }, [currentStep, stepIds, setCurrentContainer]);

  const canNavigateTo = useCallback(
    (idx: number) => makeCanNavigateTo(steps, currentStep, state.progress.completeContainers)(idx),
    [steps, currentStep, state.progress.completeContainers],
  );

  const handleStepClick = useCallback((idx: number) => {
    if (canNavigateTo(idx)) setCurrentStep(idx);
  }, [canNavigateTo]);

  const handleNext = useCallback(() => {
    const currentStepId = stepIds[currentStep];
    if (!state.progress.completeContainers.has(currentStepId)) {
      touchContainerFields(currentStepId);
      scrollToFirstError(currentStepId, prepared, state, externalErrors);
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  }, [stepIds, currentStep, state.progress.completeContainers, touchContainerFields, steps.length, prepared, state, externalErrors]);

  const handlePrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleSubmit = useCallback(() => {
    const currentStepId = stepIds[currentStep];
    if (!state.progress.completeContainers.has(currentStepId)) {
      touchContainerFields(currentStepId);
      scrollToFirstError(currentStepId, prepared, state, externalErrors);
      return;
    }
    if (onSubmit) onSubmit();
  }, [stepIds, currentStep, touchContainerFields, state.progress.completeContainers, onSubmit, prepared, state, externalErrors]);

  // Build adapter stepper props
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

  // Determine which stepper to render
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
          />
        );
      })();

  return (
    <div style={{ position: "relative" }}>
      {stepperContent}

      {/* Spacing for circle labels which use absolute positioning */}
      {(progressStyle === "circles" || (useAdapterStepper && progressStyle === "adapter")) && <div style={{ height: "20px" }} />}

      <ProtoContainer id={stepIds[currentStep]} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}>
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          style={{
            ...navBtnBase,
            opacity: currentStep === 0 ? 0.4 : 1,
            cursor: currentStep === 0 ? "not-allowed" : "pointer",
          }}
        >
          Previous
        </button>
        {isLastStep ? (
          <button
            onClick={handleSubmit}
            style={{
              ...navBtnBase,
              background: "#22c55e",
              color: "white",
              border: "none",
            }}
          >
            Submit
          </button>
        ) : (
          <button
            onClick={handleNext}
            style={{
              ...navBtnBase,
              background: "#3b82f6",
              color: "white",
              border: "none",
            }}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
