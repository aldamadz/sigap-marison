import { FileSignature } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminNumberingDocs: DocsEntry = {
    id: "admin-numbering",
    title: "Penomoran Surat",
    menu: "Konfigurasi > Penomoran",
    audience: "admin",
    icon: FileSignature,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur counter nomor surat per scope agar nomor sistem baru tidak bentrok dengan nomor lama.",
    whenToUse: [
      "Menentukan nomor awal saat sistem mulai dipakai produksi.",
      "Mengatur counter awal per departemen, entitas, jenis surat, proyek, atau scope lain.",
      "Mengecek penomoran saat pergantian tahun.",
    ],
    steps: [
      "Buka Konfigurasi Penomoran.",
      "Cari scope nomor yang ingin diatur.",
      "Isi counter awal sesuai nomor terakhir yang sudah dipakai secara manual.",
      "Simpan sebelum user membuat dokumen baru pada scope tersebut.",
    ],
    examples: [
      "Jika nomor manual terakhir adalah 125, set counter agar nomor berikutnya mulai 126.",
      "Saat tahun baru, counter dapat reset sesuai aturan penomoran tahunan.",
    ],
    troubleshooting: [
      "Jika ada risiko nomor duplikat, hentikan registrasi pada scope tersebut dan cek counter.",
      "Jika nomor sudah dipesan di draft, nomor tidak dipakai ulang meski draft dibatalkan.",
    ],
  };

export const adminNumberingDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Konfigurasi counter",
      columns: ["Field", "Arti"],
      rows: [
        ["Scope", "Pusat atau cabang."],
        ["Entitas", "Perusahaan/badan hukum yang memakai counter."],
        ["Departemen", "Wajib untuk scope pusat."],
        ["Proyek", "Wajib untuk scope cabang."],
        ["Tahun", "Tahun counter berlaku."],
        ["Start from", "Nomor awal yang akan dipakai generator."],
        ["Aktif", "Hanya satu konfigurasi aktif per scope unik."],
      ],
    },
    {
      type: "table",
      title: "Contoh penggunaan counter",
      columns: ["Kasus", "Pengaturan"],
      rows: [
        ["Nomor manual terakhir 124 untuk departemen PBO tahun 2026", "Buat scope pusat, departemen PBO, tahun 2026, start_from 125."],
        ["Nomor proyek TRA sudah berjalan sampai 004", "Buat scope cabang, proyek TRA, tahun 2026, start_from 5."],
        ["Tahun baru", "Buat/cek konfigurasi tahun baru jika tidak ingin mulai dari 001."],
      ],
    },
  ];
