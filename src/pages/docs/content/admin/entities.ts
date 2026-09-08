import { Database } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminEntitiesDocs: DocsEntry = {
    id: "admin-entities",
    title: "Master Entitas",
    menu: "Master Data > Master Entitas",
    audience: "admin",
    icon: Database,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur perusahaan atau entitas yang dipakai pada nomor surat dan dokumen.",
    whenToUse: [
      "Menambah entitas perusahaan baru.",
      "Mengubah kode entitas pada format nomor surat.",
      "Menjaga entitas tetap konsisten pada template dokumen.",
    ],
    steps: [
      "Buka Master Entitas.",
      "Tambah atau edit nama dan kode entitas.",
      "Pastikan kode entitas sesuai format nomor yang berlaku.",
    ],
    examples: [
      "Kode `UAI` dapat dipakai pada format nomor surat seperti `001/UAI/MKT.1.JST 3/VI/2026`.",
    ],
    troubleshooting: [
      "Jika nomor surat memakai kode perusahaan salah, cek entitas yang dipilih saat registrasi.",
      "Jika entitas tidak muncul, pastikan data aktif dan tersimpan.",
    ],
  };

export const adminEntitiesDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Data entitas",
      columns: ["Field", "Fungsi"],
      rows: [
        ["Nama entitas", "Nama perusahaan/badan hukum penerbit surat."],
        ["Kode entitas", "Segmen kedua nomor surat, misalnya UAI."],
        ["Status aktif", "Menentukan apakah entitas bisa dipilih saat registrasi."],
      ],
    },
  ];
