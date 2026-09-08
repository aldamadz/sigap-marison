import { Building2 } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminDepartmentsDocs: DocsEntry = {
    id: "admin-departments",
    title: "Master Departemen",
    menu: "Master Data > Master Departemen",
    audience: "admin",
    icon: Building2,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur departemen, email departemen, alias import, dan relasi yang dipakai pada workflow.",
    whenToUse: [
      "Menambah atau memperbaiki data departemen.",
      "Mengatur email departemen untuk notifikasi.",
      "Menyesuaikan alias departemen dari data HRD agar import karyawan masuk ke departemen yang benar.",
    ],
    steps: [
      "Buka Master Departemen.",
      "Tambah atau edit nama, kode, email, dan metadata yang diperlukan.",
      "Cek kembali workflow yang memakai departemen tersebut.",
    ],
    examples: [
      "Departemen `Direksi` menampung Direktur Utama, Direktur I, Dirut, dan sejenisnya.",
      "Departemen `Branch Manager` dipakai untuk relasi cabang/BM.",
    ],
    troubleshooting: [
      "Jika import karyawan masuk departemen salah, cek alias departemen.",
      "Jika email notifikasi tidak terkirim ke departemen, cek email departemen dan SMTP.",
    ],
  };

export const adminDepartmentsDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Data departemen",
      columns: ["Field", "Fungsi"],
      rows: [
        ["Nama", "Nama resmi departemen yang tampil di profil, surat, dan filter."],
        ["Kode", "Kode untuk penomoran surat dan identitas departemen pusat."],
        ["Alias", "Mapping nama dari data HRD agar import tetap masuk ke departemen yang benar."],
        ["Email departemen", "Penerima notifikasi jika ada dokumen perlu ditindaklanjuti."],
        ["Status/urutan", "Menjaga tampilan dan pilihan konfigurasi tetap rapi."],
      ],
    },
  ];
