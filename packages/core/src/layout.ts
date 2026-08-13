import type {
  Form,
  Container,
  Field,
  FieldRef,
  ContainerKey,
  FieldKey,
  FormValues,
  DerivedState,
} from "./types";

// Container Descendant Computation

function collectDescendantFields(container: Container): FieldKey[] {
  const fields: FieldKey[] = [];

  for (const child of container.children) {
    if ("children" in child) {
      fields.push(...collectDescendantFields(child as Container));
    } else {
      fields.push((child as FieldRef).id);
    }
  }

  return fields;
}

export function buildContainerDescendants(
  containers: Container[]
): Record<ContainerKey, FieldKey[]> {
  const result: Record<ContainerKey, FieldKey[]> = {};

  function traverse(container: Container) {
    result[container.id] = collectDescendantFields(container);

    for (const child of container.children) {
      if ("children" in child) {
        traverse(child as Container);
      }
    }
  }

  for (const container of containers) {
    traverse(container);
  }

  return result;
}

// Field-to-Container Mapping

export function buildFieldToContainer(
  containers: Container[]
): Record<FieldKey, ContainerKey> {
  const result: Record<FieldKey, ContainerKey> = {};

  function traverse(container: Container) {
    for (const child of container.children) {
      if ("children" in child) {
        traverse(child as Container);
      } else {
        result[(child as FieldRef).id] = container.id;
      }
    }
  }

  for (const container of containers) {
    traverse(container);
  }

  return result;
}

// Completeness Checking

/** Protocol-wide empty check: null, undefined, "", [], {} (spec §7). */
export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return true;
  }
  return false;
}

export function isContainerComplete(
  containerId: ContainerKey,
  descendantFields: FieldKey[],
  values: FormValues,
  derived: DerivedState
): boolean {
  if (!derived.visible.has(containerId)) {
    return true;
  }

  for (const fieldId of descendantFields) {
    if (!derived.visible.has(fieldId)) continue;
    if (derived.disabled.has(fieldId)) continue;

    if (!derived.valid.has(fieldId)) {
      return false;
    }

    if (derived.required.has(fieldId)) {
      const value = values[fieldId];
      if (isEmpty(value)) {
        return false;
      }
    }
  }

  return true;
}

export function computeCompleteContainers(
  containerDescendants: Record<ContainerKey, FieldKey[]>,
  values: FormValues,
  derived: DerivedState
): Set<ContainerKey> {
  const complete = new Set<ContainerKey>();

  for (const [containerId, descendantFields] of Object.entries(containerDescendants)) {
    if (isContainerComplete(containerId, descendantFields, values, derived)) {
      complete.add(containerId);
    }
  }

  return complete;
}

export function findContainer(
  containers: Container[],
  id: ContainerKey
): Container | undefined {
  for (const container of containers) {
    if (container.id === id) return container;

    for (const child of container.children) {
      if ("children" in child) {
        const found = findContainer([child as Container], id);
        if (found) return found;
      }
    }
  }

  return undefined;
}

export function findField(form: Form, id: FieldKey): Field | undefined {
  return form.fields.find((f) => f.id === id);
}
