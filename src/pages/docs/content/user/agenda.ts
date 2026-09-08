import { ClipboardList } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const agendaDocs: DocsEntry = {
    id: "agenda",
    title: "Agenda",
    menu: "Agenda",
    audience: "user",
    icon: ClipboardList,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mencatat dan mengelola agenda kerja pribadi atau tim sesuai hak akses.",
    whenToUse: [
      "Membuat jadwal kerja, rapat, atau aktivitas follow up.",
      "Melihat daftar agenda yang sedang berjalan.",
      "Mengubah agenda yang perlu diperbarui.",
    ],
    steps: [
      "Buka menu Agenda.",
      "Gunakan tombol tambah untuk membuat agenda.",
      "Isi judul, tanggal, peserta, dan catatan yang diperlukan.",
      "Simpan, lalu cek kembali di daftar agenda atau Kalender.",
    ],
    examples: [
      "Buat agenda follow up dokumen yang perlu dipantau minggu ini.",
      "Tambahkan agenda rapat internal dan tulis poin pembahasan agar mudah ditelusuri.",
    ],
    troubleshooting: [
      "Jika agenda tidak muncul di kalender, cek tanggal agenda dan refresh data.",
      "Jika tidak bisa mengubah agenda, pastikan agenda tersebut memang milik Anda atau Anda punya akses tim.",
    ],
  };

export const agendaDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Data agenda",
      columns: ["Data", "Arti", "Catatan"],
      rows: [
        ["Judul", "Nama aktivitas yang tampil di daftar dan kalender.", "Gunakan judul spesifik agar mudah dicari."],
        ["Waktu mulai dan selesai", "Rentang waktu pekerjaan.", "Dipakai untuk urutan kalender dan deteksi agenda berjalan."],
        ["Status", "Kondisi agenda saat ini.", "Biasanya Scheduled, Ongoing, Completed, atau Overdue."],
        ["Peserta atau pemilik", "User yang terlibat atau bertanggung jawab.", "Akses mengikuti hirarki dan hak tim."],
        ["Catatan", "Konteks tambahan aktivitas.", "Tulis hasil follow up agar riwayat tetap terbaca."],
      ],
    },
    {
      type: "table",
      title: "Membaca status agenda",
      columns: ["Status", "Artinya", "Tindakan"],
      rows: [
        ["Scheduled", "Agenda sudah dibuat tetapi waktunya belum berjalan.", "Pastikan waktu dan peserta benar."],
        ["Ongoing", "Agenda berada pada rentang waktu berjalan.", "Update catatan jika ada perkembangan."],
        ["Completed", "Agenda selesai.", "Tidak perlu diubah kecuali ada koreksi data."],
        ["Overdue", "Agenda melewati waktu selesai dan belum diselesaikan.", "Selesaikan atau ubah jadwal bila memang tertunda."],
      ],
    },
  ];
