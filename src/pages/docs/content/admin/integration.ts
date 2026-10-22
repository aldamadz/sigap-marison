import { Server } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminIntegrationDocs: DocsEntry = {
    id: "admin-integration",
    title: "Integrasi Marison",
    menu: "Konfigurasi > Integration",
    audience: "admin",
    icon: Server,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Memeriksa koneksi dan menyinkronkan master karyawan, kantor, serta proyek dari sistem Marison ke SIGAP.",
    whenToUse: [
      "Mengecek kesiapan endpoint Marison pada environment yang sedang aktif.",
      "Meninjau perubahan data sebelum sinkronisasi manual.",
      "Menjalankan sinkronisasi master karyawan, kantor, atau proyek.",
    ],
    steps: [
      "Buka Konfigurasi lalu pilih Integration.",
      "Pastikan environment dan credential server berstatus siap.",
      "Jalankan Cek koneksi untuk memastikan sumber data dapat diakses.",
      "Pilih Periksa karyawan atau Periksa proyek dan baca ringkasan perubahannya.",
      "Jalankan sinkronisasi setelah hasil pemeriksaan sesuai.",
      "Buka master data terkait untuk melengkapi baris yang masih ditandai perlu ditinjau.",
    ],
    examples: [
      "Setelah karyawan baru tersedia di Marison, admin memeriksa data lalu menjalankan Sinkron karyawan agar akun dan mapping kantornya tersedia di SIGAP.",
      "Setelah proyek cabang baru dibuat, admin menjalankan Periksa proyek sebelum menyinkronkannya ke Master Proyek.",
    ],
    troubleshooting: [
      "Jika Cek koneksi gagal, periksa status credential dan endpoint environment aktif; credential tidak dapat diubah dari browser.",
      "Jika hasil sinkronisasi perlu ditinjau, buka User Organization, Master Kantor Cabang, atau Master Proyek dan baca kolom Keterangan.",
      "Jika data external tidak lengkap, jangan menebak mapping entitas atau organisasi; lengkapi berdasarkan sumber resmi.",
    ],
    related: ["User Organization", "Master Kantor Cabang", "Master Proyek"],
  };

export const adminIntegrationDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Kontrol Integrasi Marison",
      columns: ["Kontrol", "Fungsi"],
      rows: [
        ["Status environment", "Menunjukkan koneksi staging atau production yang dikunci saat deployment."],
        ["Lihat payload", "Membuka JSON tersimpan per generasi di Antrean Outbound, beserta endpoint dan hash. Salin JSON tidak mengirim ulang. Snapshot yang belum dibekukan bukan bukti payload terkirim; credential API tidak ditampilkan."],
        ["Generate payload terbaru", "Di tab Payload terbaru, admin membuat kandidat JSON dari data final terkini, lalu meninjau perbandingan sebelum/sesudah, waktu generate dan hasil validasi. Salin atau Unduh JSON tidak mengirim ke external, membuat generasi baru, atau menimpa payload historis. Tautan external yang aktif digunakan kembali; jika dokumen, persetujuan, atau tautan belum siap, generate dihentikan. Pengajuan yang sudah diterima memerlukan jalur koreksi agar tidak duplikat."],
        ["Payload untuk Postman (Dana)", "Tab terpisah menempatkan PDF final di main_document dan mempertahankan lampiran pendukung dalam attachments. Jenis dana dan nilai tidak diubah, termasuk marketing_cost. Hanya memakai tautan tersimpan yang aktif; tidak membuat job atau mengirim ulang. POST manual dapat membuat pengajuan nyata/duplikat: konfirmasi penerimaan Digivasi dahulu."],
        ["Cek koneksi", "Memeriksa akses SIGAP ke endpoint Projects, Unit, dan Non Unit tanpa mengubah master data."],
        ["Periksa karyawan", "Menampilkan jumlah data karyawan dan kantor yang akan dibuat, diperbarui, dilewati, atau perlu ditinjau."],
        ["Sinkron karyawan", "Memperbarui master kantor dan karyawan SIGAP setelah admin menyetujui hasil pemeriksaan."],
        ["Periksa proyek", "Menampilkan perubahan master proyek dan mapping kantor sebelum sinkronisasi."],
        ["Sinkron proyek", "Memperbarui master proyek SIGAP tanpa mengganti UUID lokal yang sudah dipakai surat."],
      ],
    },
    {
      type: "callout",
      title: "Periksa sebelum sinkron",
      description:
        "Jalankan pemeriksaan terlebih dahulu. Setelah sinkronisasi selesai, buka master terkait dan lengkapi baris yang ditandai untuk ditinjau.",
      tone: "warning",
    },
  ];
