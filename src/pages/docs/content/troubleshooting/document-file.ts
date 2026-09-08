import { BookOpenText } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const documentFileDocs: DocsEntry = {
    id: "document-file",
    title: "Dokumen atau lampiran tidak bisa dibuka",
    menu: "Surat",
    audience: "troubleshooting",
    icon: BookOpenText,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Langkah pemeriksaan ketika preview PDF, snapshot, atau lampiran gagal dibuka.",
    whenToUse: [
      "Muncul pesan dokumen tidak ditemukan.",
      "PDF masih loading terlalu lama.",
      "Lampiran tidak dapat diakses.",
    ],
    steps: [
      "Coba buka ulang dokumen setelah beberapa detik.",
      "Pastikan dokumen sudah selesai diproses worker PDF.",
      "Cek apakah file berada di storage self-hosted dan endpoint file aktif.",
    ],
    examples: [
      "Token akses file dapat berubah setiap klik, tetapi itu bukan berarti PDF selalu dibuat ulang.",
      "Jika file baru diunggah pada approval, tunggu indikator upload selesai sebelum menyetujui.",
      "Admin memakai Buat Ulang PDF jika surat lama harus mengikuti renderer atau formasi tanda tangan terbaru.",
    ],
    troubleshooting: [
      "Jika masih gagal, admin perlu cek storage bucket, service role, dan log server.",
      "Jika PDF lama masih tampil, tutup tab PDF dan buka ulang dokumen.",
      "Jika bentuk PDF atau kotak tanda tangan surat lama masih memakai versi lama, admin perlu memilih Buat Ulang PDF dari detail Monitoring.",
    ],
    sections: [
      {
        type: "table",
        title: "Buka PDF dan Buat Ulang PDF",
        columns: ["Aksi", "Yang dikerjakan sistem", "Kapan digunakan"],
        rows: [
          ["Buka dokumen", "Membuka PDF siap pakai atau mengantrekan konversi dari workbook yang tersimpan.", "Pemeriksaan dokumen sehari-hari."],
          ["Buat Ulang PDF", "Menjalankan kembali renderer dokumen dari snapshot database dan menerapkan status tanda tangan yang sudah selesai.", "Surat lama perlu mengikuti renderer atau formasi tanda tangan terbaru."],
        ],
      },
      {
        type: "callout",
        title: "Khusus admin",
        description: "Buat Ulang PDF tidak mengulang approval dan tidak mengubah status surat. Sistem mempertahankan identitas serta waktu tanda tangan yang sudah tercatat.",
        tone: "warning",
      },
    ],
  };

export const documentFileDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Checklist file gagal dibuka",
      columns: ["Gejala", "Pemeriksaan"],
      rows: [
        ["Dokumen tidak ditemukan", "Pastikan file sudah dibuat worker PDF dan path tersimpan."],
        ["Lampiran gagal dibuka", "Cek bucket storage self-hosted dan token akses."],
        ["PDF lama tampil", "Tutup preview dan buka ulang agar token/cache baru dipakai."],
        ["Loading lama", "Cek antrian worker PDF dan log server."],
      ],
    },
  ];
