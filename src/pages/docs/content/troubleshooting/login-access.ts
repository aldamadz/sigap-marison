import { KeyRound } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const loginAccessDocs: DocsEntry = {
    id: "login-access",
    title: "Login dan akses ditolak",
    menu: "Semua menu",
    audience: "troubleshooting",
    icon: KeyRound,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Panduan cepat jika user tidak bisa login, akun nonaktif, atau menu tidak muncul.",
    whenToUse: [
      "Login berhasil tetapi menu tidak sesuai.",
      "Muncul pesan akun nonaktif.",
      "Akses halaman admin ditolak.",
      "User lupa kata sandi dan perlu membuat kata sandi baru melalui email.",
    ],
    steps: [
      "Jika lupa kata sandi, buka halaman login lalu pilih Lupa sandi.",
      "Masukkan email kerja yang terdaftar dan cek inbox email.",
      "Buka tautan reset dari email, isi kata sandi baru, lalu login ulang.",
      "Pastikan akun ada di User Organization dan statusnya aktif.",
      "Cek role akun, departemen, kantor, dan jabatan.",
      "Jika user baru import, minta user logout lalu login ulang.",
    ],
    examples: [
      "User cabang tidak bisa memilih departemen karena kantor dan departemen mengikuti profil.",
      "Admin bisa melihat konfigurasi, user biasa tidak bisa membuka halaman admin.",
      "Jika user lupa kata sandi, admin tidak perlu mengetahui password lama; user cukup memakai link reset dari email.",
    ],
    troubleshooting: [
      "Jika email reset tidak masuk, cek folder spam dan pastikan email akun benar.",
      "Jika link reset kedaluwarsa, kirim ulang link dari halaman login.",
      "Jika akun nonaktif, lakukan import data aktif atau aktifkan ulang secara admin.",
      "Jika role salah, ubah role di User Organization lalu minta user login ulang.",
    ],
    sections: [
      {
        type: "table",
        title: "Reset kata sandi",
        columns: ["Bagian", "Perilaku"],
        rows: [
          ["Permintaan link", "User menekan Lupa sandi di halaman login dan memasukkan email kerja."],
          ["Keamanan pesan", "SIGAP menampilkan pesan berhasil tanpa membedakan apakah email terdaftar agar tidak membuka daftar akun."],
          ["Pengiriman email", "Server SIGAP membuat link recovery melalui Supabase Admin dan mengirim email lewat SMTP Hostinger."],
          ["Tautan email", "Link mengarah ke halaman Reset Kata Sandi untuk membuat password baru."],
          ["Template email", "Untuk menghindari redirect lama, template Supabase sebaiknya memakai `/reset-password?token_hash={{ .TokenHash }}&type=recovery`."],
          ["Tampilan email", "Email reset password memakai HTML branded SIGAP dengan logo Marison, tombol utama, fallback link, dan peringatan keamanan singkat."],
          ["Click tracking", "Matikan click tracking untuk email auth agar link reset tidak dibungkus domain tracking email."],
          ["Kata sandi sama", "Jika muncul peringatan kata sandi harus berbeda, berarti password yang diisi sama dengan password akun yang sedang aktif."],
          ["Tombol simpan", "Saat proses simpan berjalan, tombol dan input dikunci agar tidak ada pengiriman ganda."],
          ["Setelah berhasil", "Session reset ditutup dan user diminta login ulang memakai kata sandi baru."],
          ["Audit", "Perubahan kata sandi dicatat sebagai event audit tanpa menyimpan nilai password."],
        ],
      },
    ],
  };

export const loginAccessDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Penyebab akses ditolak",
      columns: ["Penyebab", "Yang dicek admin"],
      rows: [
        ["Akun nonaktif", "Status user pada User Organization."],
        ["Role salah", "Role admin/user pada profil."],
        ["Departemen/kantor kosong", "Mapping HRD, kantor, dan departemen."],
        ["Session lama", "Minta user logout lalu login ulang."],
      ],
    },
  ];
