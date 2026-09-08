import { Settings } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const settingsDocs: DocsEntry = {
    id: "settings",
    title: "Pengaturan",
    menu: "Pengaturan",
    audience: "user",
    icon: Settings,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur preferensi akun seperti profil, tema, dan pengaturan personal lain.",
    whenToUse: [
      "Mengubah preferensi tampilan light mode atau dark mode.",
      "Mengganti foto profil akun.",
      "Memeriksa data profil yang dipakai pada dokumen.",
      "Mengelola pengaturan personal yang tersedia untuk akun Anda.",
    ],
    steps: [
      "Buka Pengaturan.",
      "Pilih bagian yang ingin diubah.",
      "Untuk foto profil, pilih gambar JPG, PNG, atau WebP dengan ukuran maksimal 5 MB.",
      "Simpan perubahan lalu pastikan tampilannya sesuai.",
    ],
    examples: [
      "Gunakan dark mode jika bekerja lama di ruangan redup.",
      "Unggah foto profil agar identitas lebih mudah dikenali pada hirarki, aktivitas, dan daftar user.",
      "Cek nama, jabatan, departemen, dan kantor karena data ini ikut dipakai dalam dokumen.",
    ],
    troubleshooting: [
      "Jika departemen atau kantor salah, hubungi admin karena beberapa data mengikuti master user.",
      "Jika foto gagal diunggah, pastikan formatnya JPG, PNG, atau WebP dan ukurannya tidak lebih dari 5 MB.",
      "Jika foto lama masih terlihat setelah upload berhasil, muat ulang halaman agar profil terbaru dibaca dari server.",
      "Jika tema tidak berubah, refresh halaman setelah menyimpan pengaturan.",
    ],
    sections: [
      {
        type: "table",
        title: "Foto profil",
        columns: ["Bagian", "Perilaku"],
        rows: [
          ["Format", "JPG, PNG, atau WebP; maksimal 5 MB."],
          ["Penyimpanan", "File asli disimpan pada storage private self-hosted dan tidak memakai URL publik Supabase Cloud."],
          ["Tampilan aplikasi", "SIGAP memakai thumbnail WebP maksimal 256 x 256 agar sidebar, hirarki, dan daftar user lebih ringan."],
          ["Buka gambar", "Saat URL foto dibuka sebagai halaman atau tab baru, server menampilkan file asli."],
          ["Keamanan", "Upload diperiksa oleh server dan path file selalu mengikuti ID akun yang sedang login."],
        ],
      },
    ],
  };

export const settingsDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Data profil yang berdampak ke sistem",
      columns: ["Data", "Dipakai untuk", "Siapa yang mengubah"],
      rows: [
        ["Nama", "Tampilan profil, dokumen, email, audit, dan tanda tangan.", "User/admin sesuai izin."],
        ["Jabatan", "Label tanda tangan dan informasi email.", "Admin jika mengikuti data HRD."],
        ["Departemen", "Hak akses, kandidat signer, SLA, dan nomor surat pusat.", "Admin."],
        ["Kantor", "Hak akses cabang, kandidat BM/SPV, dan nomor surat cabang.", "Admin."],
        ["Tema", "Light/dark/system mode.", "User sendiri."],
      ],
    },
  ];
