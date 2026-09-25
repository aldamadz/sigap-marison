export const REQUESTER_ADDITIONAL_ATTACHMENT_KEY = "requester_additional";
export const VERIFIER_ADDITIONAL_ATTACHMENT_KEY = "verifier_additional";

export const OPTIONAL_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const OPTIONAL_ATTACHMENT_MAX_FILES = 5;
export const OPTIONAL_ATTACHMENT_MAX_SIZE_BYTES = 4 * 1024 * 1024;

export function validateOptionalAttachmentFiles(files: Array<Pick<File, "name" | "type" | "size">>): void {
  if (files.length > OPTIONAL_ATTACHMENT_MAX_FILES) {
    throw new Error(`Maksimal ${OPTIONAL_ATTACHMENT_MAX_FILES} lampiran tambahan.`);
  }
  for (const file of files) {
    if (!OPTIONAL_ATTACHMENT_TYPES.includes(file.type)) {
      throw new Error(`Tipe file ${file.name} tidak diizinkan. Gunakan PDF, JPG, atau PNG.`);
    }
    if (file.size > OPTIONAL_ATTACHMENT_MAX_SIZE_BYTES || file.size === 0) {
      throw new Error(`Ukuran file ${file.name} harus antara 1 byte dan 4 MB.`);
    }
  }
}

export const REQUESTER_ADDITIONAL_ATTACHMENT_REQUIREMENT = {
  id: REQUESTER_ADDITIONAL_ATTACHMENT_KEY,
  stage_order: 0,
  requirement_key: REQUESTER_ADDITIONAL_ATTACHMENT_KEY,
  label: "Lampiran tambahan",
  is_required: false,
  allow_multiple: true,
  min_files: 0,
  max_files: OPTIONAL_ATTACHMENT_MAX_FILES,
  allowed_types: OPTIONAL_ATTACHMENT_TYPES,
  max_size_bytes: OPTIONAL_ATTACHMENT_MAX_SIZE_BYTES,
};

export const VERIFIER_ADDITIONAL_ATTACHMENT_REQUIREMENT = {
  requirement_key: VERIFIER_ADDITIONAL_ATTACHMENT_KEY,
  label: "Lampiran tambahan pemeriksaan",
  is_required: false,
  allow_multiple: true,
  max_files: OPTIONAL_ATTACHMENT_MAX_FILES,
  allowed_types: OPTIONAL_ATTACHMENT_TYPES,
};

export function withOptionalVerifierAttachmentRequirement<T extends { requirement_key: string }>(
  requirements: T[],
  isVerification: boolean,
): Array<T | typeof VERIFIER_ADDITIONAL_ATTACHMENT_REQUIREMENT> {
  if (!isVerification || requirements.some(item => item.requirement_key === VERIFIER_ADDITIONAL_ATTACHMENT_KEY)) {
    return requirements;
  }
  return [...requirements, VERIFIER_ADDITIONAL_ATTACHMENT_REQUIREMENT];
}
