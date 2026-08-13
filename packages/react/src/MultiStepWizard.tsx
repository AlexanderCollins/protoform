import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ContainerKey, FormValues } from "@protoform/core";
import { canProgress } from "@protoform/core";
import { useProtoForm, scrollToFirstError } from "./ProtoFormContext";
import { ProtoContainer } from "./renderers";

/**
 * Result a host may return from onStepComplete / onSubmit. Errors follow
 * the server error wire format (spec §10) and are applied as external
 * errors without advancing; values are merged via applyServerValues.
 */
export interface WizardStepResult {
  errors?: Record<string, string[]>;
  values?: FormValues;
}

export interface MultiStepWizardProps {
  /** Called when a step passes client validation. Return {errors} to block
   * advancement with server errors; return {values} to merge
   * server-provided values (async results, authoritative computed data). */
  onStepComplete?: (
    stepId: ContainerKey,
    values: FormValues
  ) => void | WizardStepResult | Promise<void | WizardStepResult>;
  /** Called on final submission after client validation passes. Same
   * result contract as onStepComplete. */
  onSubmit?: (
    values: FormValues
  ) => void | WizardStepResult | Promise<void | WizardStepResult>;
  /** "stepper" renders the built-in indicator, "adapter" uses the
   * adapter's renderStepper (falling back to built-in), "none" hides it. */
  progressStyle?: "stepper" | "adapter" | "none";
  /** Allow navigating forward past incomplete steps. Default false. */
  freeNavigation?: boolean;
  labels?: { back?: string; next?: string; submit?: string };
  onStepChange?: (stepId: ContainerKey, index: number) => void;
}

/**
 * Multi-step wizard over the schema's top-level containers. Each visible
 * container is a step; completeness and progression come from the engine
 * (spec §7/§8). Must render inside <ProtoForm> (use autoLayout={false}
 * and showSubmitButton={false}).
 */
export const MultiStepWizard: React.FC<MultiStepWizardProps> = ({
  onStepComplete,
  onSubmit,
  progressStyle = "stepper",
  freeNavigation = false,
  labels,
  onStepChange,
}) => {
  const {
    prepared,
    state,
    adapter,
    darkMode,
    setCurrentContainer,
    touchContainerFields,
    externalErrors,
    setExternalErrors,
    applyServerValues,
  } = useProtoForm();

  const steps = useMemo(
    () => prepared.form.layout.filter((c) => state.derived.visible.has(c.id)),
    [prepared, state.derived.visible]
  );

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = Math.min(index, Math.max(steps.length - 1, 0));
  const step = steps[current];

  useEffect(() => {
    if (step) setCurrentContainer(step.id);
  }, [step?.id, setCurrentContainer]);

  const isComplete = useCallback(
    (i: number) => state.progress.completeContainers.has(steps[i]?.id),
    [state.progress.completeContainers, steps]
  );

  const canNavigateTo = useCallback(
    (i: number) => {
      if (i <= current) return true;
      if (freeNavigation) return true;
      for (let j = current; j < i; j++) {
        if (!isComplete(j)) return false;
      }
      return true;
    },
    [current, freeNavigation, isComplete]
  );

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= steps.length || !canNavigateTo(i)) return;
      setIndex(i);
      onStepChange?.(steps[i].id, i);
    },
    [steps, canNavigateTo, onStepChange]
  );

  const applyResult = (result: void | WizardStepResult): boolean => {
    if (result?.values) applyServerValues(result.values);
    if (result?.errors && Object.keys(result.errors).length > 0) {
      setExternalErrors(result.errors);
      if (step) scrollToFirstError(step.id, prepared, state, result.errors);
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (!step || busy) return;
    touchContainerFields(step.id);
    if (!isComplete(current)) {
      scrollToFirstError(step.id, prepared, state, externalErrors);
      return;
    }
    setBusy(true);
    try {
      const ok = applyResult(await onStepComplete?.(step.id, state.values));
      if (ok) goTo(current + 1);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!step || busy) return;
    touchContainerFields(step.id);
    if (!isComplete(current) || !canProgress(state.derived, state.values)) {
      scrollToFirstError(step.id, prepared, state, externalErrors);
      return;
    }
    setBusy(true);
    try {
      const ok = applyResult(await onStepComplete?.(step.id, state.values));
      if (!ok) return;
      applyResult(await onSubmit?.(state.values));
    } finally {
      setBusy(false);
    }
  };

  if (steps.length === 0) return null;

  const stepperProps = {
    steps: steps.map((s, i) => ({
      id: s.id,
      title: s.meta.title,
      subtitle: s.meta.sub_title,
      isComplete: isComplete(i),
      isCurrent: i === current,
    })),
    currentStep: current,
    onStepClick: goTo,
    canNavigateTo,
    darkMode,
  };

  const stepper =
    progressStyle === "none" ? null : progressStyle === "adapter" && adapter.renderStepper ? (
      adapter.renderStepper(stepperProps)
    ) : (
      <ol
        style={{ display: "flex", gap: "4px", listStyle: "none", padding: 0, margin: "0 0 16px" }}
        data-wizard-stepper
      >
        {steps.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => goTo(i)}
              disabled={!canNavigateTo(i)}
              aria-current={i === current ? "step" : undefined}
              style={{
                padding: "6px 12px",
                fontWeight: i === current ? "bold" : "normal",
                opacity: canNavigateTo(i) ? 1 : 0.5,
              }}
            >
              {i + 1}. {s.meta.title}
              {isComplete(i) && " ✓"}
            </button>
          </li>
        ))}
      </ol>
    );

  const isLast = current === steps.length - 1;

  return (
    <div data-wizard>
      {stepper}
      <ProtoContainer id={step.id} />
      <div style={{ display: "flex", gap: "8px", marginTop: "16px" }} data-wizard-nav>
        {current > 0 && (
          <button type="button" onClick={() => goTo(current - 1)} disabled={busy}>
            {labels?.back ?? "Back"}
          </button>
        )}
        {!isLast && (
          <button type="button" onClick={handleNext} disabled={busy}>
            {labels?.next ?? "Next"}
          </button>
        )}
        {isLast && (
          <button type="button" onClick={handleSubmit} disabled={busy}>
            {labels?.submit ?? "Submit"}
          </button>
        )}
      </div>
    </div>
  );
};
