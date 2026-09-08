/**
 * Characterization + boundary tests for Pass D1: docs content foundation refactor.
 * These tests lock public API and structural rules. No behaviour may change.
 */
import { describe, it, expect } from "vitest";

// ── Import from compatibility facade ────────────────────────────────────────
import {
  DOCS_VERSION,
  DOCS_UPDATED_AT,
  DOCS_OVERVIEW_SLUG,
  slugifyDocsSegment,
  DOCS_ENTRY_SLUGS,
  DOCS_SECTION_SLUGS,
  getDocsEntrySlug,
  getDocsSectionSlug,
  getDocsEntryPath,
  getDocsVersionPath,
  DOCS_CHANGELOG,
  DOCS_PRINCIPLES,
  USER_DOCS,
  ADMIN_DOCS,
  TROUBLESHOOTING_DOCS,
  getDocsEntrySections,
  ALL_DOCS,
  type DocsAudience,
  type DocsSection,
  type DocsEntry,
  type DocsChangelogEntry,
} from "../pages/docs/docsContent";

// ── Import directly from content modules ────────────────────────────────────
import {
  DOCS_VERSION as CONTENT_DOCS_VERSION,
  DOCS_UPDATED_AT as CONTENT_DOCS_UPDATED_AT,
  DOCS_ENTRY_SLUGS as CONTENT_DOCS_ENTRY_SLUGS,
  DOCS_SECTION_SLUGS as CONTENT_DOCS_SECTION_SLUGS,
  getDocsEntryPath as CONTENT_getDocsEntryPath,
  getDocsVersionPath as CONTENT_getDocsVersionPath,
  DOCS_CHANGELOG as CONTENT_DOCS_CHANGELOG,
  DOCS_PRINCIPLES as CONTENT_DOCS_PRINCIPLES,
} from "../pages/docs/content";

// ── Characterization tests ───────────────────────────────────────────────────

describe("docs-content-foundation – compatibility facade exports", () => {
  it("exports DOCS_VERSION and DOCS_UPDATED_AT with correct values", () => {
    expect(DOCS_VERSION).toBe("v1.26.0");
    expect(DOCS_UPDATED_AT).toBe("8 September 2026");
  });

  it("exports DOCS_OVERVIEW_SLUG as 'overview'", () => {
    expect(DOCS_OVERVIEW_SLUG).toBe("overview");
  });

  it("exports USER_DOCS, ADMIN_DOCS, TROUBLESHOOTING_DOCS, ALL_DOCS as arrays", () => {
    expect(Array.isArray(USER_DOCS)).toBe(true);
    expect(Array.isArray(ADMIN_DOCS)).toBe(true);
    expect(Array.isArray(TROUBLESHOOTING_DOCS)).toBe(true);
    expect(Array.isArray(ALL_DOCS)).toBe(true);
    expect(ALL_DOCS.length).toBe(USER_DOCS.length + ADMIN_DOCS.length + TROUBLESHOOTING_DOCS.length);
  });

  it("exports getDocsEntrySections as function", () => {
    expect(typeof getDocsEntrySections).toBe("function");
  });

  it("entry slugs identik antara facade dan content module", () => {
    expect(DOCS_ENTRY_SLUGS).toEqual(CONTENT_DOCS_ENTRY_SLUGS);
  });

  it("section slugs identik antara facade dan content module", () => {
    expect(DOCS_SECTION_SLUGS).toEqual(CONTENT_DOCS_SECTION_SLUGS);
  });

  it("getDocsEntryPath identik antara facade dan content module", () => {
    const entry = USER_DOCS[0];
    expect(getDocsEntryPath(entry)).toBe(CONTENT_getDocsEntryPath(entry));
  });

  it("getDocsVersionPath identik antara facade dan content module", () => {
    expect(getDocsVersionPath()).toBe(CONTENT_getDocsVersionPath());
    expect(getDocsVersionPath()).toBe("/docs/versi/changelog");
  });

  it("DOCS_CHANGELOG identik: referensi sama dari facade dan content module", () => {
    expect(DOCS_CHANGELOG).toStrictEqual(CONTENT_DOCS_CHANGELOG);
  });

  it("DOCS_PRINCIPLES identik antara facade dan content module", () => {
    expect(DOCS_PRINCIPLES).toStrictEqual(CONTENT_DOCS_PRINCIPLES);
  });
});

describe("docs-content-foundation – DOCS_VERSION matches latest changelog", () => {
  it("latest changelog is combined D1-D2 closure", () => {
    expect(DOCS_CHANGELOG[0]).toStrictEqual({
      version: "v1.26.0",
      date: "8 September 2026",
      changes: [
        "Menata dokumentasi Pengguna, Admin, dan Bantuan menjadi modul per topik agar pembaruan tidak lagi bergantung pada satu file besar.",
        "Memisahkan registry topik dan penyusun bagian dokumentasi agar navigasi, pencarian, serta pengembangan dokumentasi lebih mudah dipelihara.",
        "Mempertahankan URL, urutan topik, ikon, isi, dan perilaku pencarian dokumentasi selama penataan struktur.",
      ],
    });
    expect(DOCS_CHANGELOG[1].version).toBe("v1.25.0");
    expect(DOCS_CHANGELOG[1].date).toBe("18 Agustus 2026");
  });

  it("no duplicate changelog versions", () => {
    const versions = DOCS_CHANGELOG.map((e) => e.version);
    const unique = new Set(versions);
    expect(versions.length).toBe(unique.size);
  });

  it("changelog entries have non-empty changes arrays", () => {
    for (const entry of DOCS_CHANGELOG) {
      expect(entry.changes.length).toBeGreaterThan(0);
    }
  });
});

describe("docs-content-foundation – DOCS_PRINCIPLES content", () => {
  it("is a non-empty string array", () => {
    expect(Array.isArray(DOCS_PRINCIPLES)).toBe(true);
    expect(DOCS_PRINCIPLES.length).toBeGreaterThan(0);
    for (const p of DOCS_PRINCIPLES) {
      expect(typeof p).toBe("string");
    }
  });
});

describe("docs-content-foundation – slug helpers", () => {
  it("slugifyDocsSegment lowercases and replaces special chars", () => {
    expect(slugifyDocsSegment("Alur Registrasi")).toBe("alur-registrasi");
  });

  it("slugifyDocsSegment replaces & with 'dan'", () => {
    expect(slugifyDocsSegment("A & B")).toBe("a-dan-b");
  });

  it("getDocsEntrySlug returns slug from DOCS_ENTRY_SLUGS for known entry", () => {
    const entry = USER_DOCS.find((e) => e.id === "dashboard")!;
    expect(getDocsEntrySlug(entry)).toBe("dashboard");
  });

  it("getDocsSectionSlug returns slug from DOCS_SECTION_SLUGS for known title", () => {
    const section: DocsSection = {
      type: "list",
      title: "Alur registrasi dokumen",
      items: [],
    };
    expect(getDocsSectionSlug(section)).toBe("alur-registrasi");
  });

  it("getDocsEntryPath produces correct URL", () => {
    const entry = USER_DOCS.find((e) => e.id === "dashboard")!;
    expect(getDocsEntryPath(entry)).toBe("/docs/dashboard/overview");
    expect(getDocsEntryPath(entry, "bagian-dashboard")).toBe("/docs/dashboard/bagian-dashboard");
  });
});

// ── Boundary tests ───────────────────────────────────────────────────────────

describe("docs-content-foundation – boundary: five content modules exist", () => {
  it("types module exports DocsEntry shape (type-level check via runtime usage)", () => {
    const entry: DocsEntry = USER_DOCS[0];
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.title).toBe("string");
    expect(typeof entry.audience).toBe("string");
  });

  it("DocsChangelogEntry has version, date, changes", () => {
    const entry: DocsChangelogEntry = DOCS_CHANGELOG[0];
    expect(entry.version).toBeDefined();
    expect(entry.date).toBeDefined();
    expect(Array.isArray(entry.changes)).toBe(true);
  });

  it("metadata module: DOCS_VERSION and DOCS_UPDATED_AT from content module", () => {
    expect(CONTENT_DOCS_VERSION).toBe("v1.26.0");
    expect(CONTENT_DOCS_UPDATED_AT).toBe("8 September 2026");
  });

  it("navigation module: getDocsVersionPath from content module", () => {
    expect(CONTENT_getDocsVersionPath()).toBe("/docs/versi/changelog");
  });

  it("changelog module: DOCS_CHANGELOG from content module has entries", () => {
    expect(CONTENT_DOCS_CHANGELOG.length).toBeGreaterThan(0);
  });

  it("principles module: DOCS_PRINCIPLES from content module has entries", () => {
    expect(CONTENT_DOCS_PRINCIPLES.length).toBeGreaterThan(0);
  });
});
