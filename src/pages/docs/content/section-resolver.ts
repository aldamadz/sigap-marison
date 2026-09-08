import type { DocsEntry, DocsSection } from "./types";
import { ADMIN_DETAIL_SECTIONS_BY_ID } from "./admin";
import { TROUBLESHOOTING_DETAIL_SECTIONS_BY_ID } from "./troubleshooting";
import { USER_DETAIL_SECTIONS_BY_ID } from "./user";

const DETAIL_SECTIONS_BY_ID: Record<string, DocsSection[]> = {
  ...USER_DETAIL_SECTIONS_BY_ID,
  ...ADMIN_DETAIL_SECTIONS_BY_ID,
  ...TROUBLESHOOTING_DETAIL_SECTIONS_BY_ID,
};

const collectDocsSectionTitles = (sections: DocsSection[]) => {
  const titles = new Set<string>();
  const visit = (section: DocsSection) => {
    titles.add(section.title);
    if (section.type === "group") section.sections.forEach(visit);
  };
  sections.forEach(visit);
  return titles;
};

const getDocsEntrySupportSections = (entry: DocsEntry): DocsSection[] => {
  const sections: DocsSection[] = [];
  if (entry.steps.length) {
    sections.push({ type: "steps", title: `Menggunakan ${entry.title}`, items: entry.steps });
  }
  if (entry.examples.length || entry.troubleshooting.length) {
    sections.push({
      type: "group",
      title: `Contoh dan pemeriksaan ${entry.title}`,
      description: "Gunakan bagian ini saat ingin mencocokkan kasus nyata atau mencari penyebab ketika hasilnya tidak sesuai.",
      sections: [
        ...(entry.examples.length ? [{ type: "list" as const, title: "Contoh penggunaan", items: entry.examples }] : []),
        ...(entry.troubleshooting.length ? [{ type: "list" as const, title: "Jika bermasalah", items: entry.troubleshooting }] : []),
      ],
    });
  }
  return sections;
};

export const getDocsEntrySections = (entry: DocsEntry): DocsSection[] => {
  const detailSections = DETAIL_SECTIONS_BY_ID[entry.id] ?? [];
  if (entry.sections?.length) {
    const existingTitles = collectDocsSectionTitles(entry.sections);
    return [...entry.sections, ...detailSections.filter((section) => !existingTitles.has(section.title))];
  }
  if (detailSections.length) return [...detailSections, ...getDocsEntrySupportSections(entry)];
  const sections: DocsSection[] = [];
  if (entry.whenToUse.length) sections.push({ type: "list", title: "Fungsi utama", items: entry.whenToUse });
  if (entry.steps.length) sections.push({ type: "steps", title: "Alur penggunaan", items: entry.steps });
  if (entry.examples.length) sections.push({ type: "list", title: "Contoh penggunaan", items: entry.examples });
  if (entry.troubleshooting.length) sections.push({ type: "list", title: "Kendala umum", items: entry.troubleshooting });
  return sections;
};
