// Base Identifiers
export type FieldKey = string;
export type ContainerKey = string;
export type ElementKey = FieldKey | ContainerKey;
export type RuleKey = string;

// Field Definition
export interface FieldMeta {
  type: string;
  label: string;
  description?: string;
  properties?: Record<string, any>;
  required?: boolean;
  disabled?: boolean;
}

export interface Field {
  id: FieldKey;
  meta: FieldMeta;
}

// Container Definition
export interface ContainerMeta {
  title: string;
  sub_title?: string;
  type?: string;
}

/** A layout child referencing a field declared in Form.fields.
 * The canonical form is a bare `{ id }` — inline `meta` is accepted for
 * backwards compatibility but engines only read `id`. */
export interface FieldRef {
  id: FieldKey;
  meta?: FieldMeta;
}

export interface Container {
  id: ContainerKey;
  children: (Container | FieldRef)[];
  meta: ContainerMeta;
  layout?: ElementKey[][];
}

// Expression System
export type ExpressionString = string;

export interface Expression {
  type?: "and" | "or";
  expressions: Expression | Expression[] | ExpressionString | ExpressionString[];
}

// Rule System
export type MessageKind = "error" | "info" | "warning";

export interface SelectOption {
  label: string;
  value: any;
}

export interface Affect {
  target: ElementKey;
  blocking?: boolean;
  required?: boolean;
  valid?: boolean;
  visible?: boolean;
  disabled?: boolean;
  read_only?: boolean;
  message?: string;
  type?: MessageKind;
  /** Replace the target select/radio field's options while the rule holds
   * (rule-driven dynamic options; last matching rule wins). */
  options?: SelectOption[];
}

export interface Rule {
  id: RuleKey;
  when: Expression | ExpressionString;
  affects: Affect[];
  required_parent?: RuleKey[];
}

// Form Schema
export interface Form {
  fields: Field[];
  layout: Container[];
  rules: Rule[];
}

// Runtime State Types
export type FormValues = Record<FieldKey, any>;

export interface DerivedState {
  required: Set<FieldKey>;
  visible: Set<ElementKey>;
  disabled: Set<ElementKey>;
  readOnly: Set<FieldKey>;
  valid: Set<ElementKey>;
  blockingTargets: Set<ElementKey>;
  messages: Record<ElementKey, { type: MessageKind; message: string }[]>;
  /** Rule-driven option overrides for select/radio fields. */
  options: Record<FieldKey, SelectOption[]>;
}

export interface FormProgress {
  currentContainer: ContainerKey | null;
  completeContainers: Set<ContainerKey>;
}

export interface FormRuntimeState {
  values: FormValues;
  derived: DerivedState;
  progress: FormProgress;
  touchedFields: Set<FieldKey>;
}

// Engine Types
export interface RuleDependencies {
  ruleToFields: Record<RuleKey, Set<FieldKey>>;
  fieldToRules: Record<FieldKey, Set<RuleKey>>;
}

export interface ExpressionContext {
  values: FormValues;
  env?: Record<string, any>;
  fieldIds?: FieldKey[];
}

export interface PreparedForm {
  form: Form;
  dependencies: RuleDependencies;
  containerDescendants: Record<ContainerKey, FieldKey[]>;
  fieldToContainer: Record<FieldKey, ContainerKey>;
  /** Computed fields (meta.type "computed") in dependency order. */
  computedOrder: FieldKey[];
  /** Computed field id → its meta.expr expression string. */
  computedExprs: Record<FieldKey, string>;
  /** Repeat containers: id → row-template field ids, row bounds, and
   * nesting links (child repeats render one array per parent row). */
  repeats: Record<
    ContainerKey,
    {
      fields: FieldKey[];
      min: number;
      max: number | null;
      parentId: ContainerKey | null;
      childRepeats: ContainerKey[];
    }
  >;
  /** Field ids that are row templates of some repeat (excluded from
   * top-level field semantics). */
  repeatFields: Set<FieldKey>;
  /** Container id → repeat container ids among its descendants
   * (including itself when it is a repeat). */
  containerRepeats: Record<ContainerKey, ContainerKey[]>;
}

export interface EvaluationResult {
  derived: DerivedState;
  progress: FormProgress;
  /** Input values augmented with computed field results. */
  values: FormValues;
}
