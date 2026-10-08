import type { SuratRegistrationDraft } from "@/services/surat.service";

export type DraftRequesterProfile = {
  id: string;
  office_id?: string | null;
  department_id?: string | null;
};

export function assertDraftRequesterLocation(
  draft: SuratRegistrationDraft,
  profile: DraftRequesterProfile,
  isAdmin: boolean,
): void {
  // Revisions retain the original document identity, not today's organization.
  if (isAdmin || draft.revision_event_id) return;
  const form = draft.payload?.formData;
  if (draft.created_by !== profile.id || !profile.office_id || !profile.department_id
    || form?.office_id !== profile.office_id || form?.dept_id !== profile.department_id) {
    throw new Error("Kantor atau departemen draft tidak sesuai profil akun saat ini. Batalkan draft lama dan buat pengajuan baru agar nomor surat sesuai kantor.");
  }
}
