export type RegistrationDraftAttachment = {
  id: string;
  draft_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  requirement_key: string | null;
  requirement_label: string | null;
  created_at: string;
};

type ClassificationInput = {
  files: RegistrationDraftAttachment[];
  initialRequirementKeys: Set<string>;
  formInputData: unknown;
};

const LEGACY_RECOMMENDATION_KEY = /^recommendation_item_\d+$/;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export function formatCreateRegistrasiError(error: unknown): string {
  const detail = asRecord(error);
  const message = error instanceof Error
    ? error.message
    : String(detail?.message || detail?.error || "Gagal menyimpan surat.");
  const diagnostic = [detail?.code, detail?.details, detail?.hint]
    .filter(Boolean)
    .map(String)
    .join(" | ");
  return `Error in createRegistrasi: ${message}${diagnostic ? ` | ${diagnostic}` : ""}`;
}

export function getActiveRecommendationDraftFileIds(formInputData: unknown): Set<string> {
  const input = asRecord(formInputData);
  const rows = Array.isArray(input?.recommendation_items) ? input.recommendation_items : [];
  const ids = new Set<string>();

  rows.forEach((value) => {
    const row = asRecord(value);
    if (!row) return;
    const nested = asRecord(row.recommendation_attachment);
    const addId = (candidate: unknown) => {
      const id = String(asRecord(candidate)?.draft_file_id ?? "").trim();
      if (id) ids.add(id);
    };
    const singularIds = [
      nested?.draft_file_id,
      row.recommendation_attachment_draft_file_id,
    ];
    singularIds.forEach((candidate) => {
      const id = String(candidate ?? "").trim();
      if (id) ids.add(id);
    });
    if (Array.isArray(row.attachments)) row.attachments.forEach(addId);
    if (Array.isArray(nested?.attachments)) nested.attachments.forEach(addId);
  });

  return ids;
}

export function selectInitialRegistrationDraftAttachments(
  files: RegistrationDraftAttachment[],
  initialRequirementKeys: Set<string>,
  formInputData?: unknown,
): RegistrationDraftAttachment[] {
  const activeRecommendationIds = getActiveRecommendationDraftFileIds(formInputData);
  return files.filter((file) =>
    !activeRecommendationIds.has(file.id) &&
    Boolean(file.requirement_key && initialRequirementKeys.has(file.requirement_key)),
  );
}

export function classifyRegistrationDraftAttachments({
  files,
  initialRequirementKeys,
  formInputData,
}: ClassificationInput) {
  const activeRecommendationIds = getActiveRecommendationDraftFileIds(formInputData);
  const seenIds = new Set<string>();
  const initialAttachments: RegistrationDraftAttachment[] = [];
  const activeRecommendationAttachments: RegistrationDraftAttachment[] = [];
  const orphanRecommendationAttachments: RegistrationDraftAttachment[] = [];

  files.forEach((file) => {
    if (seenIds.has(file.id)) return;
    seenIds.add(file.id);

    if (activeRecommendationIds.has(file.id)) {
      activeRecommendationAttachments.push(file);
      return;
    }
    if (file.requirement_key && initialRequirementKeys.has(file.requirement_key)) {
      initialAttachments.push(file);
      return;
    }
    if (file.requirement_key && LEGACY_RECOMMENDATION_KEY.test(file.requirement_key)) {
      orphanRecommendationAttachments.push(file);
      return;
    }
    throw new Error(`Lampiran ${file.file_name} tidak memiliki konfigurasi yang valid.`);
  });

  return {
    initialAttachments,
    activeRecommendationAttachments,
    orphanRecommendationAttachments,
    attachmentsToCopy: [...initialAttachments, ...activeRecommendationAttachments],
  };
}

export function buildRegistrationAttachmentRows({
  suratId,
  userId,
  initialAttachments,
  recommendationAttachments,
}: {
  suratId: string;
  userId: string;
  initialAttachments: RegistrationDraftAttachment[];
  recommendationAttachments: RegistrationDraftAttachment[];
}) {
  const toRow = (
    attachment: RegistrationDraftAttachment,
    stage: "initial" | "recommendation_item",
  ) => ({
    surat_id: suratId,
    file_url: attachment.file_url,
    file_name: attachment.file_name,
    file_type: attachment.file_type,
    file_size: attachment.file_size,
    created_by: userId,
    stage,
    requirement_key: attachment.requirement_key,
    requirement_label: attachment.requirement_label,
  });

  return [
    ...initialAttachments.map((attachment) => toRow(attachment, "initial")),
    ...recommendationAttachments.map((attachment) => toRow(attachment, "recommendation_item")),
  ];
}
