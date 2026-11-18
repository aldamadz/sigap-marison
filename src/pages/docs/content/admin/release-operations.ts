import { Megaphone } from "lucide-react";
import type { DocsEntry } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminReleaseOperationsDocs: DocsEntry = {
  id: "admin-release-operations",
  title: "Pembaruan dan Maintenance",
  menu: "Konfigurasi > What's New / Maintenance",
  audience: "admin",
  icon: Megaphone,
  version: DOCS_VERSION,
  updatedAt: DOCS_UPDATED_AT,
  summary: "Terbitkan pembaruan aplikasi atau jadwalkan pemeliharaan tanpa mencampur kedua pengumuman.",
  whenToUse: [],
  steps: [],
  examples: [],
  troubleshooting: [],
  sections: [
    {
      type: "steps",
      title: "Menerbitkan What's New",
      items: [
        "Buka Konfigurasi > What's New. Tulis pengumuman atau lanjutkan draft yang tersimpan.",
        "Gunakan tanda minus di awal baris untuk bullet atau awali dengan nomor dan titik untuk daftar bernomor.",
        "Pilih Pratinjau untuk memeriksa pesan, lalu Terbitkan. Popup berlaku sampai tengah malam WIB berikutnya.",
        "Pengguna bisa membaca pengumuman yang diterbitkan di Dokumentasi > Versi > Pembaruan aplikasi. Gunakan Tarik pengumuman jika sudah tidak boleh tampil di popup dan daftar tersebut.",
      ],
    },
    {
      type: "steps",
      title: "Menjadwalkan maintenance",
      items: [
        "Buka Konfigurasi > Maintenance. Isi kategori, pesan, waktu mulai, dan estimasi durasi.",
        "Pilih Potensi gangguan bila akses tetap dibuka. Pilih Maintenance penuh hanya bila akses memang harus ditutup saat jadwal mulai.",
        "Setelah pekerjaan selesai, tandai jadwal selesai dan pastikan aplikasi bisa diakses. Terbitkan What's New secara terpisah jika perlu.",
      ],
    },
    {
      type: "callout",
      title: "Akses admin saat maintenance penuh",
      description: "Gunakan halaman /maintenance-admin untuk masuk kembali ke konfigurasi maintenance. Hak admin tetap diperlukan.",
    },
  ],
};
