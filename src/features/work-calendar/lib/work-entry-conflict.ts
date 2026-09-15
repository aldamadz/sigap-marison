export const WORK_ENTRY_CONFLICT_CODE = "WORK_ENTRY_CONFLICT" as const;

export class WorkEntryConflictError extends Error {
  readonly code = WORK_ENTRY_CONFLICT_CODE;

  constructor(
    message = "Pembaruan gagal karena data telah berubah atau tidak ditemukan. Muat ulang halaman.",
  ) {
    super(message);
    this.name = "WorkEntryConflictError";
  }
}

export function isWorkEntryConflictError(error: unknown): error is WorkEntryConflictError {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === WORK_ENTRY_CONFLICT_CODE;
}
