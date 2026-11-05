import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DocsEntry } from "../pages/docs/content/types";
import { describe, expect, it } from "vitest";
import { ALL_DOCS, ADMIN_DOCS, getDocsEntryPath, getDocsEntrySections, getDocsEntrySlug, getDocsSectionSlug, TROUBLESHOOTING_DOCS, USER_DOCS } from "../pages/docs/docsContent";
import { TROUBLESHOOTING_DETAIL_SECTIONS_BY_ID } from "../pages/docs/content/troubleshooting";
import { documentFileDetailSections, documentFileDocs } from "../pages/docs/content/troubleshooting/document-file";
import { loginAccessDetailSections, loginAccessDocs } from "../pages/docs/content/troubleshooting/login-access";
import { notificationDetailSections, notificationDocs } from "../pages/docs/content/troubleshooting/notification";
import { externalApiDocs } from "../pages/docs/content/troubleshooting/external-api";
import { deployProductionDocs } from "../pages/docs/content/troubleshooting/deploy-production";
import * as docsFacade from "../pages/docs/docsContent";

const ids = ["login-access", "document-file", "notification", "external-api", "deploy-production"];
const normalized = () => {
  const normalize = (docs: typeof ALL_DOCS) => docs.map((entry) => {
    const { version: _version, updatedAt: _updatedAt, ...stableEntry } = entry;
    return { ...stableEntry, icon: entry.icon.displayName, resolvedSections: getDocsEntrySections(entry), sectionSlugs: getDocsEntrySections(entry).map((section) => getDocsSectionSlug(section)), entrySlug: getDocsEntrySlug(entry), path: getDocsEntryPath(entry) };
  });
  return { user: normalize(USER_DOCS), admin: normalize(ADMIN_DOCS), troubleshooting: normalize(TROUBLESHOOTING_DOCS), allIds: ALL_DOCS.map((entry) => entry.id) };
};

describe("docs-troubleshooting-registry D2C", () => {
  it("preserves troubleshooting entries, order, icons, audience, and canonical paths", () => {
    expect(TROUBLESHOOTING_DOCS).toStrictEqual([loginAccessDocs, documentFileDocs, notificationDocs, externalApiDocs, deployProductionDocs]);
    expect(TROUBLESHOOTING_DOCS.map((entry) => entry.id)).toEqual(ids);
    expect(new Set(TROUBLESHOOTING_DOCS.map((entry) => entry.id)).size).toBe(ids.length);
    expect(TROUBLESHOOTING_DOCS.every((entry) => entry.audience === "troubleshooting" && entry.icon.displayName)).toBe(true);
    expect(TROUBLESHOOTING_DOCS.map((entry) => getDocsEntryPath(entry))).toEqual(TROUBLESHOOTING_DOCS.map((entry) => `/docs/${getDocsEntrySlug(entry)}/overview`));
  });

  it("uses three file-owned detail registries", () => {
    expect(TROUBLESHOOTING_DETAIL_SECTIONS_BY_ID).toStrictEqual({ "login-access": loginAccessDetailSections, "document-file": documentFileDetailSections, notification: notificationDetailSections });
  });

  it("preserves registry and resolver behavior", () => {
    expect(ALL_DOCS).toStrictEqual([...USER_DOCS, ...ADMIN_DOCS, ...TROUBLESHOOTING_DOCS]);
    expect(new Set(ALL_DOCS.map((entry) => entry.id)).size).toBe(ALL_DOCS.length);
    const login = TROUBLESHOOTING_DOCS[0];
    expect(getDocsEntrySections(login).map((section) => section.title)).toEqual(["Reset kata sandi", "Penyebab akses ditolak"]);

    const withExistingSection: DocsEntry = { ...login, sections: [{ type: "list", title: "Penyebab akses ditolak", items: ["existing"] }] };
    expect(getDocsEntrySections(withExistingSection)).toStrictEqual(withExistingSection.sections);

    const fallback: DocsEntry = { ...login, id: "no-detail", sections: undefined };
    expect(getDocsEntrySections(fallback).map((section) => section.title)).toEqual(["Fungsi utama", "Alur penggunaan", "Contoh penggunaan", "Kendala umum"]);
  });

  it("matches documentation content after SUR-39 user scope guidance", () => {
    expect(createHash("sha256").update(JSON.stringify(normalized())).digest("hex")).toBe("470471976ba8546dd02aa9518e8e72a06bfbb172fcccec6f813ee4208b92a372");
  });

  it("keeps facade and imports acyclic", () => {
    const facade = readFileSync("src/pages/docs/docsContent.ts", "utf8");
    expect(facade.trim()).toBe('export * from "./content";');
    expect(facade).not.toMatch(/lucide-react|DocsEntry|USER_DOCS|ADMIN_DOCS|TROUBLESHOOTING_DOCS|ALL_DOCS|getDocsEntrySections/);
    for (const consumer of ["src/pages/docs/PublicDocsPage.tsx", "src/pages/docs/DocsArticle.tsx"]) expect(readFileSync(consumer, "utf8")).toContain('from "./docsContent"');
    expect(readFileSync("src/pages/docs/content/section-resolver.ts", "utf8")).not.toContain("docsContent");
  });

  it("exports only public resolver from facade", () => {
    expect(docsFacade).toHaveProperty("getDocsEntrySections");
    expect(docsFacade).not.toHaveProperty("collectDocsSectionTitles");
    expect(docsFacade).not.toHaveProperty("getDocsEntrySupportSections");
  });
});
