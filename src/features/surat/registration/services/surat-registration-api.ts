import { suratService } from "@/services/surat.service";

export const suratRegistrationApi = {
  getMasterData: (...args: Parameters<typeof suratService.getMasterData>) =>
    suratService.getMasterData(...args),
  getActiveRegistrationDrafts: (...args: Parameters<typeof suratService.getActiveRegistrationDrafts>) =>
    suratService.getActiveRegistrationDrafts(...args),
  getRegistrationDraft: (...args: Parameters<typeof suratService.getRegistrationDraft>) =>
    suratService.getRegistrationDraft(...args),
  createExternalSubmissionRevisionDraft: (
    ...args: Parameters<typeof suratService.createExternalSubmissionRevisionDraft>
  ) => suratService.createExternalSubmissionRevisionDraft(...args),
  submitExternalSubmissionRevision: (...args: Parameters<typeof suratService.submitExternalSubmissionRevision>) =>
    suratService.submitExternalSubmissionRevision(...args),
  createRegistrationDraft: (...args: Parameters<typeof suratService.createRegistrationDraft>) =>
    suratService.createRegistrationDraft(...args),
  saveRegistrationDraft: (...args: Parameters<typeof suratService.saveRegistrationDraft>) =>
    suratService.saveRegistrationDraft(...args),
  finishRegistrationDraft: (...args: Parameters<typeof suratService.finishRegistrationDraft>) =>
    suratService.finishRegistrationDraft(...args),
  voidRegistrationDraft: (...args: Parameters<typeof suratService.voidRegistrationDraft>) =>
    suratService.voidRegistrationDraft(...args),
  uploadRegistrationDraftFiles: (...args: Parameters<typeof suratService.uploadRegistrationDraftFiles>) =>
    suratService.uploadRegistrationDraftFiles(...args),
  deleteRegistrationDraftFile: (...args: Parameters<typeof suratService.deleteRegistrationDraftFile>) =>
    suratService.deleteRegistrationDraftFile(...args),
  generateNoSurat: (...args: Parameters<typeof suratService.generateNoSurat>) =>
    suratService.generateNoSurat(...args),
  cancelRegistration: (...args: Parameters<typeof suratService.cancelRegistration>) =>
    suratService.cancelRegistration(...args),
  createRegistrasi: (...args: Parameters<typeof suratService.createRegistrasi>) =>
    suratService.createRegistrasi(...args),
  uploadFile: (...args: Parameters<typeof suratService.uploadFile>) =>
    suratService.uploadFile(...args),
  uploadAttachmentFiles: (...args: Parameters<typeof suratService.uploadAttachmentFiles>) =>
    suratService.uploadAttachmentFiles(...args),
};
