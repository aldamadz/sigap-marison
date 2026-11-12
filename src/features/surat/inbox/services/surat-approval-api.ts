import { suratService } from "@/services/surat.service";

export const suratApprovalApi = {
  claimExamination: (...args: Parameters<typeof suratService.claimExamination>) =>
    suratService.claimExamination(...args),
  approveSurat: (...args: Parameters<typeof suratService.approveSurat>) =>
    suratService.approveSurat(...args),
  rejectSurat: (...args: Parameters<typeof suratService.rejectSurat>) =>
    suratService.rejectSurat(...args),
  verifySignature: (...args: Parameters<typeof suratService.verifySignature>) =>
    suratService.verifySignature(...args),
  requestVerificationRevision: (...args: Parameters<typeof suratService.requestVerificationRevision>) =>
    suratService.requestVerificationRevision(...args),
  saveVerificationDraft: (...args: Parameters<typeof suratService.saveVerificationDraft>) =>
    suratService.saveVerificationDraft(...args),
  requestProcessRevision: (...args: Parameters<typeof suratService.requestProcessRevision>) =>
    suratService.requestProcessRevision(...args),
  resolveProcessRevision: (...args: Parameters<typeof suratService.resolveProcessRevision>) =>
    suratService.resolveProcessRevision(...args),
  acceptProcessRevision: (...args: Parameters<typeof suratService.acceptProcessRevision>) =>
    suratService.acceptProcessRevision(...args),
  cancelAfterRevision: (...args: Parameters<typeof suratService.cancelAfterRevision>) =>
    suratService.cancelAfterRevision(...args),
  replaceSignatureAttachmentFiles: (...args: Parameters<typeof suratService.replaceSignatureAttachmentFiles>) =>
    suratService.replaceSignatureAttachmentFiles(...args),
};
