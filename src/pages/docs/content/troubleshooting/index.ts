import { loginAccessDocs, loginAccessDetailSections } from "./login-access";
import { documentFileDocs, documentFileDetailSections } from "./document-file";
import { notificationDocs, notificationDetailSections } from "./notification";
import { externalApiDocs } from "./external-api";
import { deployProductionDocs } from "./deploy-production";
import type { DocsEntry, DocsSection } from "../types";

export type TroubleshootingDocsId =
  | "login-access"
  | "document-file"
  | "notification"
  | "external-api"
  | "deploy-production";

export const TROUBLESHOOTING_DOCS: DocsEntry[] = [
  loginAccessDocs,
  documentFileDocs,
  notificationDocs,
  externalApiDocs,
  deployProductionDocs,
];

export const TROUBLESHOOTING_DETAIL_SECTIONS_BY_ID: Readonly<Partial<Record<TroubleshootingDocsId, DocsSection[]>>> = {
  "login-access": loginAccessDetailSections,
  "document-file": documentFileDetailSections,
  "notification": notificationDetailSections,
};
