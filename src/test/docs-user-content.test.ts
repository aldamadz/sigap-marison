import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_DOCS,
  ADMIN_DOCS,
  TROUBLESHOOTING_DOCS,
  getDocsEntrySlug,
  slugifyDocsSegment,
  USER_DOCS as FACADE_USER_DOCS,
  getDocsEntryPath,
  getDocsEntrySections,
  getDocsSectionSlug,
} from "../pages/docs/docsContent";
import { USER_DETAIL_SECTIONS_BY_ID, USER_DOCS } from "../pages/docs/content";
import { dashboardDocs } from "../pages/docs/content/user/dashboard";
import { agendaDetailSections, agendaDocs } from "../pages/docs/content/user/agenda";
import { calendarDetailSections, calendarDocs } from "../pages/docs/content/user/calendar";
import { suratRegistrationDetailSections, suratRegistrationDocs } from "../pages/docs/content/user/surat-registration";
import { requestCategoriesDocs } from "../pages/docs/content/user/request-categories";
import { approvalInboxDetailSections, approvalInboxDocs } from "../pages/docs/content/user/approval-inbox";
import { followUpDocs } from "../pages/docs/content/user/follow-up";
import { recommendationTasksDocs } from "../pages/docs/content/user/recommendation-tasks";
import { monitoringDetailSections, monitoringDocs } from "../pages/docs/content/user/monitoring";
import { documentsAttachmentsDetailSections, documentsAttachmentsDocs } from "../pages/docs/content/user/documents-attachments";
import { historyDetailSections, historyDocs } from "../pages/docs/content/user/history";
import { settingsDetailSections, settingsDocs } from "../pages/docs/content/user/settings";

const expectedIds = [
  "dashboard", "agenda", "calendar", "surat-registration", "request-categories", "approval-inbox",
  "follow-up", "recommendation-tasks", "monitoring", "documents-attachments", "history", "settings",
] as const;
const topicEntries = [dashboardDocs, agendaDocs, calendarDocs, suratRegistrationDocs, requestCategoriesDocs,
  approvalInboxDocs, followUpDocs, recommendationTasksDocs, monitoringDocs, documentsAttachmentsDocs, historyDocs, settingsDocs];
const canonicalSlugs = {
  dashboard: "dashboard",
  agenda: "agenda",
  calendar: "kalender",
  "surat-registration": "registrasi-surat",
  "request-categories": "kategori-pengajuan",
  "approval-inbox": "persetujuan",
  "recommendation-tasks": "rekomendasi",
  monitoring: "status-pengajuan",
  "documents-attachments": "dokumen-lampiran",
  history: "riwayat-terlibat",
  settings: "pengaturan",
} as const;
const canonicalIcons = {
  dashboard: "ChartColumn", agenda: "ClipboardList", calendar: "CalendarDays", "surat-registration": "FilePenLine",
  "request-categories": "Tag", "approval-inbox": "Inbox", "follow-up": "ClipboardCheck", "recommendation-tasks": "FileCheck2",
  monitoring: "SearchCheck", "documents-attachments": "FileCheck2", history: "History", settings: "Settings",
} as const;
const detailSectionsById = {
  agenda: agendaDetailSections,
  calendar: calendarDetailSections,
  "surat-registration": suratRegistrationDetailSections,
  "approval-inbox": approvalInboxDetailSections,
  monitoring: monitoringDetailSections,
  "documents-attachments": documentsAttachmentsDetailSections,
  history: historyDetailSections,
  settings: settingsDetailSections,
};
const normalizedRuntime = () => ({
  userDocs: USER_DOCS.map((entry) => ({ ...entry, icon: entry.icon.displayName })),
  resolved: Object.fromEntries(USER_DOCS.map((entry) => [entry.id, {
    sections: getDocsEntrySections(entry),
    sectionSlugs: getDocsEntrySections(entry).map(getDocsSectionSlug),
    entrySlug: getDocsEntrySlug(entry),
    path: getDocsEntryPath(entry),
  }])),
  allIds: ALL_DOCS.map((entry) => entry.id),
});

describe("docs-user-content D2A characterization", () => {
  it("preserves twelve user entries, order, audience, uniqueness, URLs, and slugs", () => {
    expect(USER_DOCS.map((entry) => entry.id)).toEqual(expectedIds);
    expect(USER_DOCS.every((entry) => entry.audience === "user")).toBe(true);
    expect(new Set(USER_DOCS.map((entry) => entry.id)).size).toBe(USER_DOCS.length);
    expect(USER_DOCS.filter((entry) => entry.id !== "follow-up").map((entry) => getDocsEntrySlug(entry))).toEqual(
      expectedIds.filter((id) => id !== "follow-up").map((id) => canonicalSlugs[id as keyof typeof canonicalSlugs]),
    );
    const followUp = USER_DOCS.find((entry) => entry.id === "follow-up")!;
    expect(getDocsEntrySlug(followUp)).toBe(slugifyDocsSegment(followUp.title || followUp.id));
    expect(USER_DOCS.map((entry) => getDocsEntryPath(entry))).toEqual(
      USER_DOCS.map((entry) => `/docs/${getDocsEntrySlug(entry)}/overview`),
    );
    expect(USER_DOCS.map((entry) => entry.icon.displayName)).toEqual(
      expectedIds.map((id) => canonicalIcons[id as keyof typeof canonicalIcons]),
    );
  });

  it("keeps topic registry and facade entries identical by reference", () => {
    expect(USER_DOCS).toStrictEqual(FACADE_USER_DOCS);
    expect(USER_DOCS).toEqual(topicEntries);
  });

  it("resolves every user topic sections and retains eight topic-owned detail registries", () => {
    expect(Object.keys(USER_DETAIL_SECTIONS_BY_ID)).toEqual([
      "agenda", "calendar", "surat-registration", "approval-inbox", "monitoring", "documents-attachments", "history", "settings",
    ]);
    expect(USER_DETAIL_SECTIONS_BY_ID).toStrictEqual(detailSectionsById);
    for (const entry of USER_DOCS) {
      expect(getDocsEntrySections(entry).length).toBeGreaterThan(0);
    }
  });

  it("matches exact-base normalized runtime characterization", () => {
    expect(createHash("sha256").update(JSON.stringify(normalizedRuntime())).digest("hex"))
      .toBe("08b97a9ff6832d2e8c3e91eb26b8c87c662e9a26b3fe03bfca8735c17a1b6cf6");
  });

  it("keeps ALL_DOCS user prefix and legacy composition", () => {
    expect(ALL_DOCS.slice(0, USER_DOCS.length)).toStrictEqual(USER_DOCS);
    expect(ALL_DOCS).toStrictEqual([...USER_DOCS, ...ADMIN_DOCS, ...TROUBLESHOOTING_DOCS]);
  });
});

describe("docs-user-content D2A boundaries", () => {
  it("has every one-topic user file and loads it through static registry imports", () => {
    for (const id of expectedIds) expect(existsSync(`src/pages/docs/content/user/${id}.ts`)).toBe(true);
    expect(topicEntries.map((entry) => entry.id)).toEqual(expectedIds);
  });

  it("leaves facade as registry compatibility layer and UI consumers on it", () => {
    const facade = readFileSync("src/pages/docs/docsContent.ts", "utf8");
    expect(facade).not.toContain('audience: "user"');
    for (const id of Object.keys(detailSectionsById)) {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(facade).not.toMatch(new RegExp(`^\\s*(?:${escapedId}|"${escapedId}")\\s*:\\s*\\[`, "m"));
    }
    expect(facade).not.toMatch(/export const USER_DOCS/);
    expect(readFileSync("src/pages/docs/PublicDocsPage.tsx", "utf8")).toContain('from "./docsContent"');
    expect(readFileSync("src/pages/docs/DocsArticle.tsx", "utf8")).toContain('from "./docsContent"');
  });
});
