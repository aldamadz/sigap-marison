type UnitDispatch = {
  id: string;
  surat_id: string;
  environment: string;
  kind: string;
  status?: string;
  generation?: number;
  external_reference?: string | null;
  replacement_of_dispatch_id?: string | null;
};

const conflict = (message: string, code: string) => Object.assign(new Error(message), { status: 409, code });

export const unitRevisionContractMessage =
  "Revisi Unit memerlukan bukti pengembalian external dan persetujuan ulang yang valid sebelum dikirim kembali.";

export const classifyUnitDispatchIntent = (job: UnitDispatch, previous: UnitDispatch | null) => {
  if (job.kind !== "unit" || !job.replacement_of_dispatch_id) return "initial" as const;
  if (!previous || previous.id !== job.replacement_of_dispatch_id || previous.id === job.id
    || previous.surat_id !== job.surat_id || previous.environment !== job.environment || previous.kind !== "unit"
    || (job.generation != null && previous.generation != null && previous.generation >= job.generation)) {
    throw conflict("Riwayat pengiriman Unit tidak cocok. Pengiriman ditahan untuk pemeriksaan admin.", "unit_dispatch_history_mismatch");
  }
  if (previous.status === "succeeded") return "accepted_submission_revision" as const;
  if (previous.status === "failed_terminal" && !previous.external_reference) return "rejected_replacement" as const;
  throw conflict("Hasil pengiriman Unit sebelumnya belum dapat dipastikan. Jangan membuat pengiriman baru.", "unit_previous_outcome_unconfirmed");
};

export const assertUnitDispatchContract = (job: UnitDispatch, previous: UnitDispatch | null) => {
  const intent = classifyUnitDispatchIntent(job, previous);
  if (intent === "accepted_submission_revision") {
    throw conflict(unitRevisionContractMessage, "unit_external_revision_contract_required");
  }
  return intent;
};
