/**
 * Extracted orchestration for the external revision submit flow.
 *
 * Pass K2B — extracted from SuratForm.tsx handleSubmit.
 */
import { suratRegistrationApi } from "@/features/surat/registration/services/surat-registration-api";
import { suratRecommendationApi } from "@/features/surat/recommendation/services/surat-recommendation-api";

export interface ExternalRevisionSubmitCommand {
  revisionEventId: string;
  draftId: string;
  formData: any;
  requesterNote?: string | null;
}

export function getExternalRevisionSuccessDescription(nextStep: string | undefined | null): string {
  if (nextStep === "recommendation") {
    return "Rekomendasi lama dibuka kembali dan menunggu penyesuaian tim rekomendasi.";
  }
  if (nextStep === "unit_allocation_or_approval") {
    return "Jumlah unit diperbarui. Alokasi akan diperiksa kembali sebelum approval.";
  }
  if (nextStep === "unit_reallocation") return "Jumlah unit diperbarui. Tim pemeriksa menyesuaikan alokasi sebelum pengajuan kembali ke penandatangan yang meminta perbaikan.";
  return "Approval dimulai ulang menggunakan data revisi terbaru.";
}

/**
 * Executes the external revision submission and handles conditional auto-approval.
 * Returns the raw result from the registration API.
 */
export async function executeExternalRevisionSubmit(
  command: ExternalRevisionSubmitCommand,
  dependencies = {
    submitRevision: suratRegistrationApi.submitExternalSubmissionRevision,
    autoApprove: suratRecommendationApi.autoApproveRequesterFirstStep,
  }
) {
  const result = await dependencies.submitRevision({
    revisionEventId: command.revisionEventId,
    draftId: command.draftId,
    formData: command.formData,
    requesterNote: String(command.requesterNote || "").trim(),
  });

  if (result.next_step !== "recommendation" && result.next_step !== "requesting_step" && result.next_step !== "unit_reallocation") {
    await dependencies.autoApprove(result.surat_id).catch((autoApproveError) => {
      console.error("Gagal melanjutkan auto-approval revisi pemohon:", autoApproveError);
    });
  }

  return result;
}
