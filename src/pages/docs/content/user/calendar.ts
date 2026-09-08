import { CalendarDays } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const calendarDocs: DocsEntry = {
    id: "calendar",
    title: "Kalender",
    menu: "Kalender",
    audience: "user",
    icon: CalendarDays,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Tampilan kalender untuk membaca agenda berdasarkan tanggal.",
    whenToUse: [
      "Melihat jadwal per hari, minggu, atau bulan.",
      "Mengecek benturan jadwal sebelum membuat agenda baru.",
      "Memantau agenda tim dalam satu tampilan waktu.",
    ],
    steps: [
      "Buka menu Kalender.",
      "Pilih rentang waktu yang ingin dilihat.",
      "Klik agenda untuk melihat detailnya.",
    ],
    examples: [
      "Sebelum menjadwalkan meeting, cek kalender minggu berjalan.",
      "Gunakan kalender untuk melihat agenda follow up dokumen yang jatuh tempo.",
    ],
    troubleshooting: [
      "Jika kalender terlihat kosong, cek filter tanggal dan data agenda.",
      "Jika detail tidak terbuka, coba refresh halaman lalu buka ulang agenda.",
    ],
  };

export const calendarDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Mode baca kalender",
      columns: ["Bagian", "Fungsi", "Kapan dipakai"],
      rows: [
        ["Hari", "Melihat agenda detail dalam satu tanggal.", "Saat mengecek jadwal hari ini."],
        ["Minggu", "Melihat kepadatan agenda Senin sampai Minggu.", "Saat mengatur jadwal meeting atau follow up."],
        ["Bulan", "Melihat sebaran agenda dalam satu bulan.", "Saat mencari hari yang masih longgar."],
        ["Detail agenda", "Membuka informasi agenda yang dipilih.", "Saat ingin membaca catatan, peserta, atau waktu lengkap."],
      ],
    },
    {
      type: "troubleshooting",
      title: "Kendala kalender",
      items: [
        {
          problem: "Agenda tidak muncul di tanggal yang diharapkan",
          solution: "Cek waktu mulai, waktu selesai, timezone browser, dan filter user atau tim yang aktif.",
        },
        {
          problem: "Detail agenda gagal dibuka",
          solution: "Refresh data. Jika masih gagal, agenda mungkin dihapus atau aksesnya berubah.",
        },
      ],
    },
  ];
