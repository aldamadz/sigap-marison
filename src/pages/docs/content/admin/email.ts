import { Mail } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminEmailDocs: DocsEntry = {
    id: "admin-email",
    title: "Email Notification",
    menu: "Konfigurasi > Email Notification",
    audience: "admin",
    icon: Mail,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur email notifikasi departemen, isi email profesional, link sistem, dokumen, dan lampiran.",
    whenToUse: [
      "Mengirim notifikasi ketika dokumen perlu ditandatangani atau ditindaklanjuti.",
      "Menyediakan detail dokumen langsung di email.",
      "Mengubah domain sistem yang muncul di tombol email.",
    ],
    steps: [
      "Buka Email Notification.",
      "Atur SMTP, alamat pengirim, dan link sistem.",
      "Pastikan email departemen sudah diisi pada master departemen.",
      "Uji pengiriman pada alur approval.",
    ],
    examples: [
      "Email persetujuan berisi nomor surat, pengaju, departemen, ringkasan barang atau unit, penandatangan, PDF, dan lampiran.",
      "Jika domain SIGAP berubah, ubah base URL agar tombol email mengikuti domain baru.",
    ],
    troubleshooting: [
      "Jika email tidak terkirim, cek SMTP password, host, port, dan log server.",
      "Jika lampiran masih berupa link mentah, cek konfigurasi attachment email dan endpoint file.",
    ],
  };

export const adminEmailDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Konfigurasi email",
      columns: ["Bagian", "Fungsi"],
      rows: [
        ["SMTP host/port", "Server email perusahaan."],
        ["Username/password", "Akun email pengirim, misalnya noreply."],
        ["Base URL SIGAP", "Domain tombol buka sistem pada email."],
        ["Email departemen", "Penerima notifikasi departemen."],
        ["Mode file", "Menentukan file dikirim sebagai link aman atau attachment."],
      ],
    },
    {
      type: "table",
      title: "Isi email persetujuan",
      columns: ["Bagian", "Isi"],
      rows: [
        ["Identitas surat", "Nomor, judul, status, dan kategori."],
        ["Pengaju", "Nama, jabatan, departemen, kantor, dan proyek bila ada."],
        ["Detail input", "Barang/unit/catatan dalam bentuk tabel, bukan JSON mentah."],
        ["Penandatangan", "Signer dan status proses."],
        ["File", "PDF dan lampiran sesuai mode konfigurasi."],
      ],
    },
  ];
