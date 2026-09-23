export type InitialAttachmentRequirement = {
  requirement_key: string;
  label?: string | null;
  is_required?: boolean | null;
  min_files?: number | null;
  max_files?: number | null;
  allowed_types?: string[] | null;
  max_size_bytes?: number | null;
};
export type PersistedInitialAttachment = {
  file_name: string;
  file_type?: string | null;
  file_size?: number | null;
  requirement_key?: string | null;
};
type NewFileMetadata = Record<
  string,
  { key?: string | null; label?: string | null } | undefined
>;

type ValidateInitialRegistrationAttachmentsInput = {
  requirements: InitialAttachmentRequirement[];
  newFiles: File[];
  newFileMetadata: NewFileMetadata;
  persistedFiles: PersistedInitialAttachment[];
};

type ValidatableAttachment = {
  name: string;
  type: string | null;
  size: number | null;
};

const validateAttachmentMetadata = (
  attachment: ValidatableAttachment,
  requirement: InitialAttachmentRequirement,
) => {
  const allowedTypes = Array.isArray(requirement.allowed_types)
    ? requirement.allowed_types
    : [];
  if (
    allowedTypes.length > 0 &&
    attachment.type &&
    !allowedTypes.includes(attachment.type)
  ) {
    throw new Error(`Tipe file ${attachment.name} tidak diizinkan.`);
  }

  const maximumSize = Number(requirement.max_size_bytes || 0);
  if (
    maximumSize > 0 &&
    attachment.size !== null &&
    attachment.size > maximumSize
  ) {
    throw new Error(`Ukuran file ${attachment.name} melebihi batas.`);
  }
};
export const validateInitialRegistrationAttachments = ({
  requirements,
  newFiles,
  newFileMetadata,
  persistedFiles,
}: ValidateInitialRegistrationAttachmentsInput): void => {
  const requirementsByKey = new Map(
    requirements.map((requirement) => [
      requirement.requirement_key,
      requirement,
    ]),
  );

  for (const file of newFiles) {
    const requirementKey = newFileMetadata[file.name]?.key;
    if (!requirementKey || !requirementsByKey.has(requirementKey)) {
      throw new Error(
        `Lampiran ${file.name} tidak memiliki konfigurasi yang valid.`,
      );
    }
  }

  for (const file of persistedFiles) {
    if (!file.requirement_key || !requirementsByKey.has(file.requirement_key)) {
      throw new Error(
        `Lampiran ${file.file_name} tidak memiliki konfigurasi yang valid.`,
      );
    }
  }

  for (const requirement of requirements) {
    const newFilesForRequirement = newFiles.filter(
      (file) => newFileMetadata[file.name]?.key === requirement.requirement_key,
    );
    const persistedFilesForRequirement = persistedFiles.filter(
      (file) => file.requirement_key === requirement.requirement_key,
    );
    const totalFiles =
      newFilesForRequirement.length + persistedFilesForRequirement.length;
    const minimum = requirement.is_required
      ? Math.max(1, Number(requirement.min_files || 1))
      : 0;
    const maximum = Math.max(minimum, Number(requirement.max_files || 1));
    const label = requirement.label || requirement.requirement_key;

    if (totalFiles < minimum) {
      throw new Error(`Lampiran pemohon belum lengkap: ${label}.`);
    }
    if (totalFiles > maximum) {
      throw new Error(`Lampiran ${label} melebihi batas.`);
    }

    newFilesForRequirement.forEach((file) =>
      validateAttachmentMetadata(
        { name: file.name, type: file.type || null, size: file.size },
        requirement,
      ),
    );
    persistedFilesForRequirement.forEach((file) =>
      validateAttachmentMetadata(
        {
          name: file.file_name,
          type: file.file_type || null,
          size: file.file_size ?? null,
        },
        requirement,
      ),
    );
  }
};
