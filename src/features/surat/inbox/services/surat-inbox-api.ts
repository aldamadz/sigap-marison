import { suratService } from "@/services/surat.service";

export const suratInboxApi = {
  getMyInbox: (...args: Parameters<typeof suratService.getMyInbox>) =>
    suratService.getMyInbox(...args),
  getMyInboxCompact: (...args: Parameters<typeof suratService.getMyInboxCompact>) =>
    suratService.getMyInboxCompact(...args),
  getMyInboxDetail: (...args: Parameters<typeof suratService.getMyInboxDetail>) =>
    suratService.getMyInboxDetail(...args),
  getLinkedDocuments: (...args: Parameters<typeof suratService.getLinkedDocuments>) =>
    suratService.getLinkedDocuments(...args),
  getRevisionHistory: (...args: Parameters<typeof suratService.getRevisionHistory>) =>
    suratService.getRevisionHistory(...args),
};
