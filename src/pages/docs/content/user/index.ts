import { dashboardDocs } from "./dashboard";
import { agendaDocs, agendaDetailSections } from "./agenda";
import { calendarDocs, calendarDetailSections } from "./calendar";
import { suratRegistrationDocs, surat_registrationDetailSections } from "./surat-registration";
import { requestCategoriesDocs } from "./request-categories";
import { approvalInboxDocs, approval_inboxDetailSections } from "./approval-inbox";
import { followUpDocs } from "./follow-up";
import { recommendationTasksDocs } from "./recommendation-tasks";
import { monitoringDocs } from "./monitoring";
import { documentsAttachmentsDocs, documents_attachmentsDetailSections } from "./documents-attachments";
import { historyDocs } from "./history";
import { settingsDocs } from "./settings";
import type { DocsEntry, DocsSection } from "../types";

export type UserDocsId =
  | "dashboard"
  | "agenda"
  | "calendar"
  | "surat-registration"
  | "request-categories"
  | "approval-inbox"
  | "follow-up"
  | "recommendation-tasks"
  | "monitoring"
  | "documents-attachments"
  | "history"
  | "settings";

export const USER_DOCS: DocsEntry[] = [
  dashboardDocs,
  agendaDocs,
  calendarDocs,
  suratRegistrationDocs,
  requestCategoriesDocs,
  approvalInboxDocs,
  followUpDocs,
  recommendationTasksDocs,
  monitoringDocs,
  documentsAttachmentsDocs,
  historyDocs,
  settingsDocs,
];

export const USER_DETAIL_SECTIONS_BY_ID: Readonly<Partial<Record<UserDocsId, DocsSection[]>>> = {
  "agenda": agendaDetailSections,
  "calendar": calendarDetailSections,
  "surat-registration": surat_registrationDetailSections,
  "approval-inbox": approval_inboxDetailSections,
  "documents-attachments": documents_attachmentsDetailSections,
};
