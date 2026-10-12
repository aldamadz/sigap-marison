import { getDescendantOfficeIds, type HierarchicalOffice } from '@/lib/office-hierarchy';

export function projectsForIssuingOffice<T extends { office_id?: string | null }>(
  projects: readonly T[], offices: HierarchicalOffice[], officeId: string,
): T[] {
  const office = offices.find(o => o.id === officeId);
  if (!office) return [];
  const allowed = office.kedudukan?.trim().toUpperCase() === 'KC'
    ? getDescendantOfficeIds(offices, officeId) : new Set([officeId]);
  return projects.filter(project => Boolean(project.office_id) && allowed.has(project.office_id!));
}
