/**
 * Pure helper for preparing regular submit command payload.
 *
 * Pass K2A — extracted from SuratForm.tsx handleSubmit.
 * No React hooks, no fetch, no Supabase, no toast, no side effects.
 */

export interface AttachmentRequirementInput {
  requirement_key: string;
  label: string;
}

export interface AttachmentFileInput {
  name: string;
}

export interface InitialAttachmentMetaOutput {
  key: string;
  label: string;
}

/**
 * Builds the initial attachment metadata object.
 * Identical behavior to the inline Object.fromEntries logic in SuratForm.
 */
export function buildInitialAttachmentMeta(
  requirements: AttachmentRequirementInput[],
  filesByRequirementKey: Record<string, AttachmentFileInput[]>
): Record<string, InitialAttachmentMetaOutput> {
  return Object.fromEntries(
    requirements.flatMap((rule) =>
      (filesByRequirementKey[rule.requirement_key] || []).map((file) => [
        file.name,
        { key: rule.requirement_key, label: rule.label },
      ])
    )
  );
}

/**
 * Builds the main payload object for createRegistrasi.
 * Identical behavior to the inline object spread in SuratForm.
 */
export function buildRegistrationSubmitPayload(
  effectiveFormData: Record<string, unknown>,
  generatedNoSurat: string | undefined,
  activeDraftReservationId: string | null | undefined,
  activeDraftId: string | undefined,
  initialAttachmentMeta: Record<string, InitialAttachmentMetaOutput>
): Record<string, unknown> {
  return {
    ...effectiveFormData,
    no_surat: generatedNoSurat,
    reservation_id: activeDraftReservationId,
    draft_id: activeDraftId,
    initial_attachment_meta: initialAttachmentMeta,
  };
}
