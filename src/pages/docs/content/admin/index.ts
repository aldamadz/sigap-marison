import { adminUsersDocs, adminUsersDetailSections } from "./users";
import { adminHierarchyDocs, adminHierarchyDetailSections } from "./hierarchy";
import { adminMasterDataDocs } from "./master-data";
import { adminDepartmentsDocs, adminDepartmentsDetailSections } from "./departments";
import { adminEntitiesDocs, adminEntitiesDetailSections } from "./entities";
import { adminLetterTypesDocs, adminLetterTypesDetailSections } from "./letter-types";
import { adminOfficesDocs, adminOfficesDetailSections } from "./offices";
import { adminProjectsDocs, adminProjectsDetailSections } from "./projects";
import { adminFormUsagesDocs, adminFormUsagesDetailSections } from "./form-usages";
import { adminIntegrationDocs, adminIntegrationDetailSections } from "./integration";
import { adminNumberingDocs, adminNumberingDetailSections } from "./numbering";
import { adminJobTitleLabelsDocs, adminJobTitleLabelsDetailSections } from "./job-title-labels";
import { adminSlaDocs, adminSlaDetailSections } from "./sla";
import { adminMonitoringDocs, adminMonitoringDetailSections } from "./monitoring";
import { adminAuditDocs, adminAuditDetailSections } from "./audit";
import { adminEmailDocs, adminEmailDetailSections } from "./email";
import type { DocsEntry, DocsSection } from "../types";

export type AdminDocsId =
  | "admin-users"
  | "admin-hierarchy"
  | "admin-master-data"
  | "admin-departments"
  | "admin-entities"
  | "admin-letter-types"
  | "admin-offices"
  | "admin-projects"
  | "admin-form-usages"
  | "admin-integration"
  | "admin-numbering"
  | "admin-job-title-labels"
  | "admin-sla"
  | "admin-monitoring"
  | "admin-audit"
  | "admin-email";

export const ADMIN_DOCS: DocsEntry[] = [
  adminUsersDocs,
  adminHierarchyDocs,
  adminMasterDataDocs,
  adminDepartmentsDocs,
  adminEntitiesDocs,
  adminLetterTypesDocs,
  adminOfficesDocs,
  adminProjectsDocs,
  adminFormUsagesDocs,
  adminIntegrationDocs,
  adminNumberingDocs,
  adminJobTitleLabelsDocs,
  adminSlaDocs,
  adminMonitoringDocs,
  adminAuditDocs,
  adminEmailDocs,
];

export const ADMIN_DETAIL_SECTIONS_BY_ID: Readonly<Partial<Record<AdminDocsId, DocsSection[]>>> = {
  "admin-users": adminUsersDetailSections,
  "admin-hierarchy": adminHierarchyDetailSections,
  "admin-departments": adminDepartmentsDetailSections,
  "admin-entities": adminEntitiesDetailSections,
  "admin-letter-types": adminLetterTypesDetailSections,
  "admin-offices": adminOfficesDetailSections,
  "admin-projects": adminProjectsDetailSections,
  "admin-form-usages": adminFormUsagesDetailSections,
  "admin-integration": adminIntegrationDetailSections,
  "admin-numbering": adminNumberingDetailSections,
  "admin-job-title-labels": adminJobTitleLabelsDetailSections,
  "admin-sla": adminSlaDetailSections,
  "admin-monitoring": adminMonitoringDetailSections,
  "admin-audit": adminAuditDetailSections,
  "admin-email": adminEmailDetailSections,
};
