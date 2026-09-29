/**
 * Helpers for traversing office hierarchy (KC → KCP, etc.) with cycle protection.
 */

export interface HierarchicalOffice {
  id: string;
  parent_id?: string | null;
  kedudukan?: string | null;
  [key: string]: unknown;
}

/**
 * Return a Set containing the given office id plus every descendant office id.
 * Traversal is bounded and cycle-safe; an parent/child cycle will not cause
 * infinite recursion.
 */
export function getDescendantOfficeIds(
  offices: HierarchicalOffice[],
  rootId: string,
): Set<string> {
  const result = new Set<string>();
  const byParent = new Map<string, HierarchicalOffice[]>();

  for (const office of offices) {
    const parentId = office.parent_id;
    if (!parentId) continue;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(office);
    byParent.set(parentId, siblings);
  }

  const visited = new Set<string>();

  function walk(currentId: string) {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    result.add(currentId);

    const children = byParent.get(currentId) ?? [];
    for (const child of children) {
      if (!result.has(child.id)) {
        walk(child.id);
      }
    }
  }

  walk(rootId);
  return result;
}

/**
 * True if the candidate office is the same as, or a descendant of, the root office.
 */
export function isOfficeOrDescendant(
  offices: HierarchicalOffice[],
  rootId: string,
  candidateId: string,
): boolean {
  return getDescendantOfficeIds(offices, rootId).has(candidateId);
}
