import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_DOCS as facadeAdminDocs,
  ALL_DOCS,
  getDocsEntryPath,
  getDocsEntrySections,
  getDocsEntrySlug,
  getDocsSectionSlug,
} from "../pages/docs/docsContent";
import { ADMIN_DETAIL_SECTIONS_BY_ID, ADMIN_DOCS } from "../pages/docs/content/admin";
import { adminAuditDocs, adminAuditDetailSections } from "../pages/docs/content/admin/audit";
import { adminDepartmentsDocs, adminDepartmentsDetailSections } from "../pages/docs/content/admin/departments";
import { adminEmailDocs, adminEmailDetailSections } from "../pages/docs/content/admin/email";
import { adminEntitiesDocs, adminEntitiesDetailSections } from "../pages/docs/content/admin/entities";
import { adminFormUsagesDocs, adminFormUsagesDetailSections } from "../pages/docs/content/admin/form-usages";
import { adminHierarchyDocs, adminHierarchyDetailSections } from "../pages/docs/content/admin/hierarchy";
import { adminIntegrationDocs, adminIntegrationDetailSections } from "../pages/docs/content/admin/integration";
import { adminJobTitleLabelsDocs, adminJobTitleLabelsDetailSections } from "../pages/docs/content/admin/job-title-labels";
import { adminLetterTypesDocs, adminLetterTypesDetailSections } from "../pages/docs/content/admin/letter-types";
import { adminMasterDataDocs } from "../pages/docs/content/admin/master-data";
import { adminMonitoringDocs, adminMonitoringDetailSections } from "../pages/docs/content/admin/monitoring";
import { adminNumberingDocs, adminNumberingDetailSections } from "../pages/docs/content/admin/numbering";
import { adminOfficesDocs, adminOfficesDetailSections } from "../pages/docs/content/admin/offices";
import { adminProjectsDocs, adminProjectsDetailSections } from "../pages/docs/content/admin/projects";
import { adminSlaDocs, adminSlaDetailSections } from "../pages/docs/content/admin/sla";
import { adminUsersDocs, adminUsersDetailSections } from "../pages/docs/content/admin/users";

const ids = [
  "admin-users", "admin-hierarchy", "admin-master-data", "admin-departments",
  "admin-entities", "admin-letter-types", "admin-offices", "admin-projects",
  "admin-form-usages", "admin-integration", "admin-numbering", "admin-job-title-labels",
  "admin-sla", "admin-monitoring", "admin-audit", "admin-email",
] as const;

const fileEntries = [
  adminUsersDocs, adminHierarchyDocs, adminMasterDataDocs, adminDepartmentsDocs,
  adminEntitiesDocs, adminLetterTypesDocs, adminOfficesDocs, adminProjectsDocs,
  adminFormUsagesDocs, adminIntegrationDocs, adminNumberingDocs, adminJobTitleLabelsDocs,
  adminSlaDocs, adminMonitoringDocs, adminAuditDocs, adminEmailDocs,
];

const fileDetails = {
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

const normalized = () => ({
  adminDocs: ADMIN_DOCS.map((entry) => {
    const { version: _version, updatedAt: _updatedAt, ...stableEntry } = entry;
    return { ...stableEntry, icon: entry.icon.displayName };
  }),
  resolved: Object.fromEntries(ADMIN_DOCS.map((entry) => [entry.id, {
    sections: getDocsEntrySections(entry),
    sectionSlugs: getDocsEntrySections(entry).map((section) => getDocsSectionSlug(section)),
    entrySlug: getDocsEntrySlug(entry),
    path: getDocsEntryPath(entry),
  }])),
  adminIds: ADMIN_DOCS.map((entry) => entry.id),
  allIds: ALL_DOCS.map((entry) => entry.id),
});

describe("docs-admin-content D2B", () => {
  it("preserves all 16 file-owned entries, order, audience, icons, and canonical paths", () => {
    expect(ADMIN_DOCS).toStrictEqual(fileEntries);
    expect(ADMIN_DOCS.map((entry) => entry.id)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ADMIN_DOCS.every((entry) => entry.audience === "admin")).toBe(true);
    expect(ADMIN_DOCS.every((entry) => entry.icon.displayName)).toBeTruthy();
    expect(facadeAdminDocs).toStrictEqual(ADMIN_DOCS);
    expect(ADMIN_DOCS.map((entry) => getDocsEntryPath(entry))).toEqual(
      ADMIN_DOCS.map((entry) => `/docs/${getDocsEntrySlug(entry)}/overview`),
    );
  });

  it("uses file-owned detail registries", () => {
    expect(ADMIN_DETAIL_SECTIONS_BY_ID).toStrictEqual(fileDetails);
    expect(Object.keys(ADMIN_DETAIL_SECTIONS_BY_ID)).toHaveLength(15);
  });

  it("matches documentation content after MRN-25 payload viewer updates", () => {
    expect(createHash("sha256").update(JSON.stringify(normalized())).digest("hex")).toBe(
      "e0dcf437f552db02aafb218de9f89d1d71b4f0595cc759eb3661118085f1e854",
    );
  });

  it("keeps facade boundary", () => {
    const facade = readFileSync("src/pages/docs/docsContent.ts", "utf8");
    expect(facade).not.toContain('audience: "admin"');
    expect(facade).not.toMatch(/export const ADMIN_DOCS/);
    for (const id of ids) {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(facade).not.toMatch(new RegExp(`^\\s*(?:${escapedId}|"${escapedId}")\\s*:\\s*\\[`, "m"));
    }
    for (const file of ["users", "hierarchy", "master-data", "departments", "entities", "letter-types", "offices", "projects", "form-usages", "integration", "numbering", "job-title-labels", "sla", "monitoring", "audit", "email"]) {
      expect(existsSync(`src/pages/docs/content/admin/${file}.ts`)).toBe(true);
    }
  });
});
