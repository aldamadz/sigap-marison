import { History } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const historyDocs: DocsEntry = {
    id: "history",
    title: "Riwayat Terlibat",
    menu: "Layanan Surat > Riwayat Terlibat",
    audience: "user",
    icon: History,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Riwayat dokumen yang pernah Anda buat, cek, setujui, atau tolak.",
    whenToUse: [
      "Mencari kembali dokumen yang pernah diproses.",
      "Melihat dokumen berdasarkan tanggal, status setuju, atau status tolak.",
      "Mengecek jejak keterlibatan tanpa masuk ke antrean aktif.",
    ],
    steps: [
      "Buka Riwayat Terlibat.",
      "Gunakan filter tanggal, status, atau pencarian.",
      "Buka detail untuk membaca ringkasan dan timeline.",
    ],
    examples: [
      "Cari semua dokumen yang Anda tolak bulan berjalan.",
      "Gunakan rentang tanggal untuk melihat riwayat approval periode tertentu.",
    ],
    troubleshooting: [
      "Jika riwayat kosong, periksa filter tanggal karena default memakai bulan berjalan.",
      "Jika dokumen lama tidak muncul, perluas rentang tanggal pencarian.",
    ],
  };

export const historyDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Filter riwayat",
      columns: ["Filter", "Default", "Fungsi"],
      rows: [
        ["Tanggal", "Bulan berjalan, tanggal 1 sampai hari ini.", "Membatasi riwayat agar daftar tidak terlalu panjang."],
        ["Tindakan", "Semua.", "Memisahkan riwayat Setuju dan Tolak."],
        ["Pencarian", "Kosong.", "Mencari berdasarkan judul atau nomor surat."],
        ["Detail", "Dibuka per item.", "Menampilkan ringkasan, timeline, dokumen, dan lampiran."],
      ],
    },
    {
      type: "table",
      title: "Data yang muncul",
      columns: ["Data", "Arti"],
      rows: [
        ["Nomor surat", "Nomor resmi atau nomor draft yang pernah melibatkan user."],
        ["Judul", "Nama permohonan/dokumen."],
        ["Peran", "User sebagai pembuat, tim pemeriksa, signer, atau pihak yang pernah memproses."],
        ["Waktu aksi", "Tanggal ketika user terlibat atau dokumen berubah status."],
      ],
    },
  ];
