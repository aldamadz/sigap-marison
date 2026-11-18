import { ClipboardList } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const agendaDocs: DocsEntry = {
  id: "agenda",
  title: "Agenda (arsip)",
  menu: "Kalender Kerja",
  audience: "user",
  icon: ClipboardList,
  version: DOCS_VERSION,
  updatedAt: DOCS_UPDATED_AT,
  summary: "Menu Agenda lama tidak lagi digunakan untuk pekerjaan harian.",
  whenToUse: [],
  steps: ["Buka Kalender Kerja untuk mencatat, memantau, atau memperbarui pekerjaan."],
  examples: [],
  troubleshooting: [],
  related: ["Kalender Kerja"],
};

export const agendaDetailSections: DocsSection[] = [
  {
    type: "callout",
    title: "Data agenda",
    description: "Gunakan Kalender Kerja untuk mencatat pekerjaan baru, bukan menu Agenda lama.",
  },
  {
    type: "callout",
    title: "Membaca status agenda",
    description: "Lihat tanggal, status, dan hasil pekerjaan dari detail di Kalender Kerja.",
  },
];
