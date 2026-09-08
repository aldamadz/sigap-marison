import { Activity } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminAuditDocs: DocsEntry = {
    id: "admin-audit",
    title: "Audit Log",
    menu: "Audit Log",
    audience: "admin",
    icon: Activity,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Jejak perubahan sistem untuk admin, termasuk perubahan user, konfigurasi, dan data penting.",
    whenToUse: [
      "Melacak siapa yang mengubah data.",
      "Membandingkan nilai sebelum dan sesudah perubahan.",
      "Menyelidiki perubahan konfigurasi yang berdampak ke proses bisnis.",
    ],
    steps: [
      "Buka Audit Log.",
      "Filter data jika diperlukan.",
      "Klik item log untuk melihat detail perubahan.",
    ],
    examples: [
      "Saat departemen user berubah, audit menampilkan nilai lama dan baru dalam nama yang mudah dibaca.",
      "Saat password berubah, audit cukup mencatat bahwa password diubah tanpa membuka nilai rahasia.",
    ],
    troubleshooting: [
      "Jika aktivitas user biasa muncul di dashboard, itu bukan Audit Log. Dashboard hanya untuk aktivitas kerja.",
      "Jika perubahan tidak tercatat, cek apakah proses tersebut sudah memakai service audit terpadu.",
    ],
  };

export const adminAuditDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Isi audit log",
      columns: ["Data", "Arti"],
      rows: [
        ["Aktor", "User/admin/system yang memicu perubahan."],
        ["Objek", "Data yang berubah, misalnya user, surat, konfigurasi, atau master data."],
        ["Sebelum", "Nilai lama, kecuali data rahasia seperti password."],
        ["Sesudah", "Nilai baru yang tersimpan."],
        ["Waktu", "Tanggal dan jam perubahan."],
      ],
    },
  ];
