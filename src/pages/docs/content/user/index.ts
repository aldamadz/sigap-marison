import { dashboardDocs } from "./dashboard";
import { agendaDocs, agendaDetailSections } from "./agenda";
import { calendarDocs, calendarDetailSections } from "./calendar";
import { suratRegistrationDocs, suratRegistrationDetailSections } from "./surat-registration";
import { requestCategoriesDocs } from "./request-categories";
import { approvalInboxDocs, approvalInboxDetailSections } from "./approval-inbox";
import { followUpDocs } from "./follow-up";
import { recommendationTasksDocs } from "./recommendation-tasks";
import { monitoringDocs, monitoringDetailSections } from "./monitoring";
import { documentsAttachmentsDocs, documentsAttachmentsDetailSections } from "./documents-attachments";
import { historyDocs, historyDetailSections } from "./history";
import { settingsDocs, settingsDetailSections } from "./settings";
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
  "surat-registration": suratRegistrationDetailSections,
  "approval-inbox": approvalInboxDetailSections,
  "monitoring": monitoringDetailSections,
  "documents-attachments": documentsAttachmentsDetailSections,
  "history": historyDetailSections,
  "settings": settingsDetailSections,
};
