import { Database } from "lucide-react";
import type { DocsEntry } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminMasterDataDocs: DocsEntry = {
    id: "admin-master-data",
    title: "Master Data",
    menu: "Master Data",
    audience: "admin",
    icon: Database,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengelola data dasar seperti departemen, entitas, jenis surat, kantor cabang, dan proyek.",
    whenToUse: [
      "Menambah departemen, kantor, proyek, atau entitas baru.",
      "Mengatur jenis surat dan kode per departemen.",
      "Menjaga data dasar agar registrasi surat tidak menampilkan pilihan yang salah.",
    ],
    steps: [
      "Buka menu Master Data yang sesuai.",
      "Tambah atau edit data master.",
      "Simpan dan cek dampaknya pada registrasi surat.",
    ],
    examples: [
      "Jika jenis surat Penagihan tidak berlaku untuk PO, jangan aktifkan pada departemen PO.",
      "Jika index Permohonan berbeda antara PGD dan PO, atur index per departemen.",
    ],
    troubleshooting: [
      "Jika pilihan muncul di registrasi padahal tidak seharusnya, cek relasi jenis surat dan departemen.",
      "Jika proyek tidak muncul, cek master proyek dan koneksi data source proyek.",
    ],
    related: ["Master Departemen", "Master Jenis Surat", "Master Proyek"],
  };
