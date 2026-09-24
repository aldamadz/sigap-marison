import { Users } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminUsersDocs: DocsEntry = {
    id: "admin-users",
    title: "User Organization",
    menu: "Master Data > User Organization",
    audience: "admin",
    icon: Users,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
     summary: "Mengelola akun, organisasi karyawan, dan identitas employee payload staging.",
    whenToUse: [
      "Import atau memperbarui data karyawan aktif.",
      "Mengubah role user menjadi admin atau user biasa.",
      "Menonaktifkan akun yang sudah tidak masuk dalam data import aktif.",
    ],
    steps: [
      "Buka User Organization.",
      "Gunakan pencarian dan filter jabatan jika perlu.",
      "Dahulukan baris berwarna amber dan baca kolom Keterangan untuk mengetahui data yang perlu diperbaiki.",
      "Edit profil user atau lakukan import data karyawan.",
      "Cek hasil import, termasuk data berhasil, gagal, dan user yang dinonaktifkan.",
      "User hasil sinkron dengan NIK external valid otomatis berstatus Siap dikirim - data external.",
      "Untuk user lokal/trial, cari employee external dari katalog pemetaan payload manual. Simpan atau Reset hanya mengubah nilai outbound, bukan NIK SIGAP.",
    ],
    examples: [
      "Jika NIK sama tetapi nama atau jabatan berubah, sistem memperbarui data user yang sama.",
      "Jika karyawan tidak ada dalam import aktif, akun dianggap tidak aktif.",
    ],
    troubleshooting: [
      "Jika import gagal karena akses ditolak, pastikan akun yang melakukan import adalah admin aktif.",
      "Jika kantor belum termapping, tambahkan mapping kantor sebelum import ulang.",
      "Jika badge sidebar belum berkurang, pastikan seluruh alasan pada kolom Keterangan sudah diselesaikan lalu segarkan data.",
    ],
  };

export const adminUsersDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Aturan import user",
      columns: ["Kondisi", "Perilaku sistem"],
      rows: [
        ["NIK sudah ada", "Data user diperbarui, bukan membuat akun baru."],
        ["NIK kosong", "Baris ditolak agar tidak membuat NIK PENDING."],
        ["User tidak ada di file import aktif", "Akun dianggap tidak aktif."],
        ["Role kosong di file", "Role lama dipertahankan."],
        ["Departemen/kantor berupa alias", "Sistem mencoba mapping ke master yang tersedia."],
      ],
    },
    {
      type: "table",
      title: "Dampak perubahan profil",
      columns: ["Data berubah", "Dampak"],
      rows: [
        ["Departemen", "Mengubah izin membuat surat, kandidat workflow, SLA, dan filter data."],
        ["Kantor", "Mengubah kandidat cabang dan akses data cabang."],
        ["Jabatan", "Mengubah label tanda tangan dan hirarki."],
        ["Status aktif", "User nonaktif tidak bisa memakai sistem."],
      ],
    },
  ];
