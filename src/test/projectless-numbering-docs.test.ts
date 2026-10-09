import { describe, expect, it } from "vitest";
import { suratRegistrationDocs, suratRegistrationDetailSections } from "../pages/docs/content/user/surat-registration";
import { requestCategoriesDocs } from "../pages/docs/content/user/request-categories";
import type { DocsSection } from "../pages/docs/content/types";

function rows(sections: DocsSection[]): string[][] {
  return sections.flatMap(section => section.type === "group" ? rows(section.sections)
    : section.type === "table" ? section.rows : []);
}

describe("projectless numbering documentation", () => {
  it.each([
    ["overview", suratRegistrationDocs.sections ?? []],
    ["numbering detail", suratRegistrationDetailSections],
  ] as const)("documents the same virtual code scope in %s", (_name, sections) => {
    const virtual = rows([...sections]).find(row => row[0] === "Kode proyek virtual");
    expect(virtual?.[1]).toBe("000");
    expect(virtual?.[2]).toContain("Aset");
    expect(virtual?.[2]).toContain("Dana Umum");
    expect(virtual?.[2]).toContain("Kas Kecil");
    expect(virtual?.[2]).not.toContain("non-unit");
    expect(virtual?.[3]).toContain("bukan master proyek baru");
  });
  it("makes external projects mandatory for Non Unit and forbids 000 fallback", () => {
    const nonUnit = requestCategoriesDocs.sections?.find(section => section.type === "group" && section.title === "Non Unit");
    if (!nonUnit || nonUnit.type !== "group") throw new Error("Missing Non Unit documentation");
    const project = rows(nonUnit.sections).find(row => row[0] === "Proyek wajib");
    expect(project?.[1]).toContain("API external");
    expect(project?.[2]).toContain("tidak dapat memakai 000");
    expect(JSON.stringify(nonUnit)).not.toContain("Nomor surat memakai kode proyek virtual 000");
  });
  it("documents Non Unit project selection before number and work entry", () => {
    const nonUnit = requestCategoriesDocs.sections?.find(section => section.type === "group" && section.title === "Non Unit");
    if (!nonUnit || nonUnit.type !== "group") throw new Error("Missing Non Unit documentation");
    const flow = nonUnit.sections.find(section => section.type === "steps");
    if (!flow || flow.type !== "steps") throw new Error("Missing Non Unit steps");
    expect(flow.items[0]).toContain("Proyek Tujuan");
    expect(flow.items[1]).toContain("Dapatkan Nomor Surat");
    expect(flow.items[2]).toContain("API external");
  });
});
