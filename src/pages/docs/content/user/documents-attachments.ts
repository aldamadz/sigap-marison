import { FileCheck2 } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const documentsAttachmentsDocs: DocsEntry = {
    id: "documents-attachments",
    title: "Dokumen dan Lampiran",
    menu: "Surat",
    audience: "user",
    icon: FileCheck2,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Membuka PDF dokumen, snapshot, dan lampiran yang terkait dengan pengajuan.",
    whenToUse: [
      "Memeriksa tampilan akhir dokumen.",
      "Membuka lampiran pendukung yang diunggah pemohon, tim pemeriksa, atau approver.",
      "Membandingkan snapshot dokumen pada proses approval.",
    ],
    steps: [
      "Buka detail dokumen dari Persetujuan, Status Pengajuan, Riwayat Terlibat, atau Monitoring Admin.",
      "Pilih file yang ingin dibuka.",
      "Tunggu jika sistem sedang menyiapkan PDF.",
      "Jika file gagal dibuka, gunakan tombol coba lagi atau hubungi admin.",
    ],
    examples: [
      "Pada pengajuan Unit, lampiran rekap adendum dan kode produksi otomatis dapat dibuka dari daftar lampiran.",
      "Pada dokumen selesai, PDF utama berisi nomor surat, data pemohon, dan tanda tangan terbaru.",
    ],
    troubleshooting: [
      "Jika URL file berubah setiap klik, itu normal karena akses file dibuat aman per request.",
      "Jika file tidak ditemukan, dokumen mungkin belum selesai dibuat atau storage perlu dicek admin.",
      "Jika PDF lama masih tampil, tutup preview lalu buka ulang agar cache browser diperbarui.",
    ],
  };

export const documents_attachmentsDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Jenis file surat",
      columns: ["Jenis", "Isi", "Cara akses"],
      rows: [
        ["PDF dokumen", "Dokumen utama hasil template sistem.", "Dibuka melalui endpoint aman aplikasi."],
        ["Snapshot", "Salinan visual dokumen pada momen tertentu.", "Dibuka dari timeline/progress dokumen."],
        ["Lampiran pemohon", "File yang diunggah saat registrasi.", "Dibuka dari panel lampiran."],
        ["Lampiran tim pemeriksa/approval", "File pemeriksaan atau pendukung dari tahap approval.", "Dibuka dari detail persetujuan atau monitoring."],
        ["Lampiran otomatis Unit", "Kode produksi dan rekap adendum hasil input sistem.", "Dibuat otomatis dari data alokasi unit."],
      ],
    },
    {
      type: "table",
      title: "Keamanan akses file",
      columns: ["Aturan", "Penjelasan"],
      rows: [
        ["Bukan public storage URL", "User tidak diarahkan langsung ke URL storage publik."],
        ["Token per request", "URL file dapat berubah setiap klik karena akses dibuat sementara."],
        ["PDF tidak selalu dibuat ulang", "Token yang berubah bukan berarti file digenerate ulang."],
        ["Hak akses dicek server", "File hanya dibuka jika user berhak atas surat/lampiran tersebut."],
      ],
    },
  ];
