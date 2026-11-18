import { CalendarDays } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const calendarDocs: DocsEntry = {
  id: "calendar",
  title: "Kalender Kerja",
  menu: "Kalender Kerja",
  audience: "user",
  icon: CalendarDays,
  version: DOCS_VERSION,
  updatedAt: DOCS_UPDATED_AT,
  summary: "Kelola jadwal, progres, hasil, dan pengingat pekerjaan.",
  whenToUse: ["Menjadwalkan pekerjaan pribadi.", "Memantau pekerjaan tim sesuai lingkup akses."],
  steps: [
    "Buka Kalender Kerja, lalu pilih Hari, Minggu, atau Bulan.",
    "Tambah pekerjaan dan isi judul, tanggal, serta rincian yang diperlukan.",
    "Buka pekerjaan untuk memperbarui status, menjadwalkan ulang, atau mengisi hasil.",
    "Untuk melihat hasil yang terpotong di daftar, klik judul pekerjaan untuk membuka detail lengkap.",
  ],
  examples: ["Catat hasil sebagai daftar bernomor atau bullet agar setiap poin mudah dibaca."],
  troubleshooting: [
    "Jika pekerjaan tidak terlihat, periksa tanggal dan tampilan Pribadi atau Tim yang sedang aktif.",
    "Jika popup pengingat tidak muncul, periksa izin notifikasi browser dan pastikan popup diaktifkan pada pengingat.",
  ],
};

export const calendarDetailSections: DocsSection[] = [
  {
    type: "table",
    title: "Mode baca kalender",
    columns: ["Bagian", "Fungsi"],
    rows: [
      ["Hari", "Lihat pekerjaan terjadwal dan tertunda pada tanggal yang dipilih."],
      ["Minggu / Bulan", "Lihat sebaran pekerjaan menurut periode."],
      ["Tim", "Lihat kalender sesuai lingkup departemen atau kantor. KC dapat memantau KCP di bawahnya; akses melihat tidak memberi hak mengedit pekerjaan rekan."],
    ],
  },
  {
    type: "steps",
    title: "Atur pengingat pribadi",
    description: "Pengingat nonaktif secara bawaan dan diatur per pekerjaan.",
    items: [
      "Buka detail pekerjaan milik Anda lalu pilih ikon Atur pengingat pribadi.",
      "Aktifkan pengingat dan pilih tanggal serta waktu (WIB).",
      "Nyalakan popup jika ingin notifikasi browser, lalu simpan. Pengingat bisa diubah atau dinonaktifkan dari pekerjaan yang sama.",
    ],
  },
];
