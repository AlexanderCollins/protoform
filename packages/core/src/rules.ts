import type {
  Form,
  PreparedForm,
  EvaluationResult,
  FormValues,
  DerivedState,
  FormProgress,
  Field,
  RuleKey,
  ElementKey,
  FieldKey,
  ContainerKey,
} from "./types";

import { buildRuleDependencies, evaluateExpression } from "./expressions";
import { safeEvaluateValue, formatValue } from "./parser";
import {
  buildContainerDescendants,
  buildFieldToContainer,
  isEmpty,
} from "./layout";
import { resolveRuleTemplates } from "./templates";

// ---------------------------------------------------------------------------
// prepareForm
// ---------------------------------------------------------------------------

function collectRepeats(form: Form): {
  repeats: PreparedForm["repeats"];
  repeatFields: Set<FieldKey>;
  containerRepeats: Record<ContainerKey, ContainerKey[]>;
} {
  const repeats: PreparedForm["repeats"] = {};
  const repeatFields = new Set<FieldKey>();
  const containerRepeats: Record<ContainerKey, ContainerKey[]> = {};

  function registerRepeat(container: any, parentId: ContainerKey | null): ContainerKey[] {
    const fields: FieldKey[] = [];
    const childRepeats: ContainerKey[] = [];
    const found: ContainerKey[] = [container.id];
    for (const child of container.children ?? []) {
      if ("children" in child) {
        if (child.meta?.type !== "repeat") {
          throw new Error(
            `Repeat container "${container.id}" may only contain field references or nested repeat containers`
          );
        }
        childRepeats.push(child.id);
        found.push(...registerRepeat(child, container.id));
      } else {
        fields.push(child.id);
        repeatFields.add(child.id);
      }
    }
    repeats[container.id] = {
      fields,
      childRepeats,
      parentId,
      min: typeof container.meta.min === "number" ? container.meta.min : 0,
      max: typeof container.meta.max === "number" ? container.meta.max : null,
    };
    containerRepeats[container.id] = found;
    return found;
  }

  function walk(container: any): ContainerKey[] {
    if (container.meta?.type === "repeat") {
      return registerRepeat(container, null);
    }
    const found: ContainerKey[] = [];
    for (const child of container.children ?? []) {
      if ("children" in child) found.push(...walk(child));
    }
    containerRepeats[container.id] = found;
    return found;
  }

  for (const container of form.layout) walk(container);
  return { repeats, repeatFields, containerRepeats };
}

function collectComputed(
  form: Form,
  repeatFields: Set<FieldKey>
): { computedOrder: FieldKey[]; computedExprs: Record<FieldKey, string> } {
  const computedExprs: Record<FieldKey, string> = {};
  for (const field of form.fields) {
    if (field.meta.type !== "computed") continue;
    if (repeatFields.has(field.id)) {
      throw new Error(`Computed field "${field.id}" cannot be a repeat row field`);
    }
    const expr = (field.meta as any).expr;
    if (typeof expr === "string" && expr.trim() !== "") {
      computedExprs[field.id] = expr;
    }
  }

  // Topological order over computed→computed references; cycles are a
  // schema error and rejected here rather than mis-evaluating later.
  const ids = Object.keys(computedExprs);
  const idSet = new Set(ids);
  const deps: Record<FieldKey, FieldKey[]> = {};
  for (const id of ids) {
    const referenced = new Set<string>();
    const expr = computedExprs[id];
    const valueRefs = expr.match(/value\(\s*['"]([^'"]+)['"]\s*\)/g) ?? [];
    for (const ref of valueRefs) {
      const m = /value\(\s*['"]([^'"]+)['"]\s*\)/.exec(ref);
      if (m) referenced.add(m[1]);
    }
    for (const ident of expr.match(/\b[a-zA-Z_]\w*\b/g) ?? []) {
      if (idSet.has(ident)) referenced.add(ident);
    }
    deps[id] = [...referenced].filter((r) => idSet.has(r) && r !== id);
  }

  const order: FieldKey[] = [];
  const state: Record<FieldKey, 0 | 1 | 2> = {}; // 0 unvisited, 1 visiting, 2 done
  function visit(id: FieldKey, chain: FieldKey[]) {
    if (state[id] === 2) return;
    if (state[id] === 1) {
      throw new Error(`Computed field cycle: ${[...chain, id].join(" -> ")}`);
    }
    state[id] = 1;
    for (const dep of deps[id]) visit(dep, [...chain, id]);
    state[id] = 2;
    order.push(id);
  }
  for (const id of ids) visit(id, []);

  return { computedOrder: order, computedExprs };
}

export function prepareForm(form: Form): PreparedForm {
  const safeForm = {
    ...form,
    fields: form.fields ?? [],
    layout: form.layout ?? [],
    rules: resolveRuleTemplates(form.rules ?? []),
  };

  const { repeats, repeatFields, containerRepeats } = collectRepeats(safeForm);
  const { computedOrder, computedExprs } = collectComputed(safeForm, repeatFields);

  return {
    form: safeForm,
    dependencies: buildRuleDependencies(safeForm),
    containerDescendants: buildContainerDescendants(safeForm.layout),
    fieldToContainer: buildFieldToContainer(safeForm.layout),
    computedOrder,
    computedExprs,
    repeats,
    repeatFields,
    containerRepeats,
  };
}

// ---------------------------------------------------------------------------
// evaluateRules
// ---------------------------------------------------------------------------

const ROW_KEY_RE = /^(.+?)\[(\d+)\]\.(.+)$/;

export function rowKey(repeatId: ContainerKey, index: number, fieldId: FieldKey): string {
  return `${repeatId}[${index}].${fieldId}`;
}

/** Parse a row-addressed key ("contacts[0].phone") or return null. */
export function parseRowKey(
  key: string
): { repeatId: ContainerKey; index: number; fieldId: FieldKey } | null {
  const m = ROW_KEY_RE.exec(key);
  if (!m) return null;
  return { repeatId: m[1], index: Number(m[2]), fieldId: m[3] };
}

/** The innermost (template) field id of a possibly-nested row key:
 * "teams[0].members[1].member_name" resolves to "member_name". */
export function templateFieldId(key: string): FieldKey {
  const m = ROW_KEY_RE.exec(key);
  return m ? templateFieldId(m[3]) : key;
}

/** Resolve a (possibly row-addressed, possibly nested) target to its
 * current value, e.g. "members[0].qualifications[1].qual_name". */
export function resolveValuePath(values: FormValues, target: ElementKey): any {
  const m = ROW_KEY_RE.exec(target);
  if (!m) return values[target];
  const rows = values[m[1]];
  if (!Array.isArray(rows)) return undefined;
  const row = rows[Number(m[2])];
  if (row == null) return undefined;
  return resolveValuePath(row, m[3]); // recurse: inner key may itself be row-addressed
}

/** Interpolate {field_id} placeholders in rule messages with current values. */
function interpolateMessage(message: string, values: FormValues): string {
  return message.replace(/\{([a-zA-Z_]\w*)\}/g, (whole, name) =>
    name in values ? formatValue(values[name] ?? null) : whole
  );
}

function applyAffect(
  derived: DerivedState,
  affect: any,
  target: ElementKey,
  messageValues: FormValues
): void {
  if (affect.visible !== undefined) {
    if (affect.visible) derived.visible.add(target);
    else derived.visible.delete(target);
  }
  if (affect.disabled !== undefined) {
    if (affect.disabled) derived.disabled.add(target);
    else derived.disabled.delete(target);
  }
  if (affect.read_only !== undefined) {
    if (affect.read_only) derived.readOnly.add(target as FieldKey);
    else derived.readOnly.delete(target as FieldKey);
  }
  if (affect.required !== undefined) {
    if (affect.required) derived.required.add(target as FieldKey);
    else derived.required.delete(target as FieldKey);
  }
  if (affect.valid !== undefined) {
    if (affect.valid) derived.valid.add(target);
    else derived.valid.delete(target);
  }
  if (affect.blocking) {
    derived.blockingTargets.add(target);
  }
  if (affect.options !== undefined) {
    derived.options[target as FieldKey] = affect.options;
  }
  if (affect.message) {
    const messageType = affect.type || (affect.valid === false ? "error" : "info");
    if (!derived.messages[target]) derived.messages[target] = [];
    derived.messages[target].push({
      type: messageType,
      message: interpolateMessage(affect.message, messageValues),
    });
  }
}

function applyContainerCascade(
  elements: any[],
  derived: DerivedState,
  ancestorHidden: boolean
): void {
  for (const el of elements) {
    if ("children" in el) {
      const hidden = ancestorHidden || !derived.visible.has(el.id);
      if (hidden) derived.visible.delete(el.id);
      applyContainerCascade(el.children, derived, hidden);
    } else if (ancestorHidden) {
      derived.visible.delete(el.id);
    }
  }
}

export function evaluateRules(
  prepared: PreparedForm,
  values: FormValues,
  env?: Record<string, any>,
  currentContainer?: string | null
): EvaluationResult {
  const { form, repeats, repeatFields, computedOrder, computedExprs } = prepared;

  // Working copy: repeat arrays normalized, computed fields evaluated in
  // dependency order before anything else runs.
  const workingValues: FormValues = { ...values };
  for (const rid of Object.keys(repeats)) {
    if (!Array.isArray(workingValues[rid])) workingValues[rid] = [];
  }
  for (const id of computedOrder) {
    workingValues[id] = safeEvaluateValue(computedExprs[id], {
      values: workingValues,
      env,
    });
  }

  // ---- Base derived state ----
  const derived: DerivedState = {
    required: new Set<FieldKey>(),
    visible: new Set<ElementKey>(),
    disabled: new Set<ElementKey>(),
    readOnly: new Set<FieldKey>(),
    valid: new Set<ElementKey>(),
    blockingTargets: new Set<ElementKey>(),
    messages: {},
    options: {},
  };

  const fieldById: Record<FieldKey, Field> = {};
  for (const field of form.fields) fieldById[field.id] = field;

  for (const field of form.fields) {
    if (repeatFields.has(field.id)) continue; // instantiated per row below
    derived.visible.add(field.id);
    derived.valid.add(field.id);
    if (field.meta.type === "computed") {
      derived.readOnly.add(field.id); // computed values are never editable
      continue; // and never required/disabled by meta
    }
    if (field.meta.required) derived.required.add(field.id);
    if (field.meta.disabled) derived.disabled.add(field.id);
  }

  function markContainersVisible(containers: any[]) {
    for (const container of containers) {
      if ("children" in container) {
        derived.visible.add(container.id);
        markContainersVisible(container.children);
      }
    }
  }
  markContainersVisible(form.layout);

  // ---- Repeat instance enumeration ----
  // An "instance" is one row of one repeat, at any nesting depth. Its
  // prefix ("members[0].qualifications[1].") addresses its fields, and its
  // chain is the lexical value scope (globals, then each ancestor row,
  // then the row itself — inner shadows outer).
  interface RepeatInstance {
    prefix: string;
    row: any;
    chain: FormValues;
  }
  const instancesByRepeat: Record<ContainerKey, RepeatInstance[]> = {};
  function getInstances(rid: ContainerKey): RepeatInstance[] {
    if (instancesByRepeat[rid]) return instancesByRepeat[rid];
    const spec = repeats[rid];
    const out: RepeatInstance[] = [];
    if (spec.parentId === null) {
      const rows: any[] = workingValues[rid];
      rows.forEach((row, i) => {
        out.push({
          prefix: `${rid}[${i}].`,
          row: row ?? {},
          chain: { ...workingValues, ...(row ?? {}) },
        });
      });
    } else {
      for (const parent of getInstances(spec.parentId)) {
        const rows: any[] = Array.isArray(parent.row?.[rid]) ? parent.row[rid] : [];
        rows.forEach((row, i) => {
          out.push({
            prefix: `${parent.prefix}${rid}[${i}].`,
            row: row ?? {},
            chain: { ...parent.chain, ...(row ?? {}) },
          });
        });
      }
    }
    instancesByRepeat[rid] = out;
    return out;
  }

  // Row-instance base state (all depths)
  for (const [rid, spec] of Object.entries(repeats)) {
    for (const inst of getInstances(rid)) {
      for (const f of spec.fields) {
        const key = inst.prefix + f;
        derived.visible.add(key);
        derived.valid.add(key);
        const template = fieldById[f];
        if (template?.meta.required) derived.required.add(key);
        if (template?.meta.disabled) derived.disabled.add(key);
      }
    }
  }

  // ---- Rule evaluation (pass 1: truth) ----
  const ruleTruth: Record<RuleKey, boolean> = {};
  const scopedTruth: Record<RuleKey, boolean[]> = {};

  for (const rule of form.rules as any[]) {
    const scope: string | undefined = rule.scope;

    if (scope && repeats[scope]) {
      const insts = getInstances(scope);
      const truths: boolean[] = [];
      for (let i = 0; i < insts.length; i++) {
        // Parent gating: same-scope parents check per-instance, other
        // parents check their global truth.
        let parentsOk = true;
        for (const pid of rule.required_parent ?? []) {
          const ok = pid in scopedTruth ? scopedTruth[pid][i] === true : ruleTruth[pid] === true;
          if (!ok) {
            parentsOk = false;
            break;
          }
        }
        if (!parentsOk) {
          truths.push(false);
          continue;
        }
        try {
          truths.push(evaluateExpression(rule.when, { values: insts[i].chain, env }));
        } catch {
          truths.push(false);
        }
      }
      scopedTruth[rule.id] = truths;
      ruleTruth[rule.id] = truths.some(Boolean);
      continue;
    }

    if (rule.required_parent && rule.required_parent.length > 0) {
      const allParentsTruthy = rule.required_parent.every(
        (parentId: RuleKey) => ruleTruth[parentId] === true
      );
      if (!allParentsTruthy) {
        ruleTruth[rule.id] = false;
        continue;
      }
    }
    try {
      ruleTruth[rule.id] = evaluateExpression(rule.when, { values: workingValues, env });
    } catch (error) {
      console.error(`Error evaluating rule ${rule.id}:`, error);
      ruleTruth[rule.id] = false;
    }
  }

  // ---- Rule evaluation (pass 2: affects) ----
  for (const rule of form.rules as any[]) {
    const scope: string | undefined = rule.scope;

    if (scope && repeats[scope]) {
      const truths = scopedTruth[rule.id] ?? [];
      const insts = getInstances(scope);
      for (let i = 0; i < truths.length; i++) {
        if (!truths[i]) continue;
        for (const affect of rule.affects) {
          const target = repeats[scope].fields.includes(affect.target)
            ? insts[i].prefix + affect.target
            : affect.target;
          applyAffect(derived, affect, target, insts[i].chain);
        }
      }
      continue;
    }

    if (!ruleTruth[rule.id]) continue;
    for (const affect of rule.affects) {
      applyAffect(derived, affect, affect.target, workingValues);
    }
  }

  // ---- Visibility cascade ----
  applyContainerCascade(form.layout, derived, false);
  for (const [rid, spec] of Object.entries(repeats)) {
    if (derived.visible.has(rid)) continue;
    for (const inst of getInstances(rid)) {
      for (const f of spec.fields) derived.visible.delete(inst.prefix + f);
    }
  }

  // ---- Completeness ----
  const completeContainers = new Set<ContainerKey>();

  /** One repeat's instance-arrays: min/max apply per parent row for
   * nested repeats (each parent row's own array must satisfy them). */
  function instanceArrays(rid: ContainerKey): { rows: any[]; prefixBase: string }[] {
    const spec = repeats[rid];
    if (spec.parentId === null) {
      return [{ rows: workingValues[rid], prefixBase: "" }];
    }
    return getInstances(spec.parentId).map((parent) => ({
      rows: Array.isArray(parent.row?.[rid]) ? parent.row[rid] : [],
      prefixBase: parent.prefix,
    }));
  }

  function repeatComplete(rid: ContainerKey): boolean {
    if (!derived.visible.has(rid)) return true;
    const spec = repeats[rid];
    for (const arr of instanceArrays(rid)) {
      if (arr.rows.length < spec.min) return false;
      if (spec.max !== null && arr.rows.length > spec.max) return false;
      for (let i = 0; i < arr.rows.length; i++) {
        for (const f of spec.fields) {
          const key = `${arr.prefixBase}${rid}[${i}].${f}`;
          if (!derived.visible.has(key)) continue;
          if (derived.disabled.has(key)) continue;
          if (!derived.valid.has(key)) return false;
          if (derived.required.has(key) && isEmpty(arr.rows[i]?.[f])) return false;
        }
      }
    }
    return true;
  }

  for (const [cid, descendantFields] of Object.entries(prepared.containerDescendants)) {
    if (repeats[cid]) {
      // containerRepeats[cid] lists this repeat plus every nested repeat,
      // so a parent is complete only when its descendants are too.
      if ((prepared.containerRepeats[cid] ?? [cid]).every(repeatComplete)) {
        completeContainers.add(cid);
      }
      continue;
    }
    if (!derived.visible.has(cid)) {
      completeContainers.add(cid);
      continue;
    }
    let complete = true;
    for (const fieldId of descendantFields) {
      if (repeatFields.has(fieldId)) continue; // row fields checked via repeats
      if (!derived.visible.has(fieldId)) continue;
      if (derived.disabled.has(fieldId)) continue;
      if (!derived.valid.has(fieldId)) {
        complete = false;
        break;
      }
      if (derived.required.has(fieldId) && isEmpty(workingValues[fieldId])) {
        complete = false;
        break;
      }
    }
    if (complete) {
      for (const rid of prepared.containerRepeats[cid] ?? []) {
        if (!repeatComplete(rid)) {
          complete = false;
          break;
        }
      }
    }
    if (complete) completeContainers.add(cid);
  }

  const progress: FormProgress = {
    currentContainer: currentContainer ?? null,
    completeContainers,
  };

  return { derived, progress, values: workingValues };
}

export function canProgress(derived: DerivedState, values: FormValues): boolean {
  for (const target of derived.blockingTargets) {
    if (!derived.visible.has(target)) continue;
    if (derived.disabled.has(target)) continue;

    if (!derived.valid.has(target)) return false;

    if (isEmpty(resolveValuePath(values, target))) return false;
  }

  return true;
}
