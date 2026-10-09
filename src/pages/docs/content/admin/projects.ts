import { Briefcase } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminProjectsDocs: DocsEntry = {
    id: "admin-projects",
    title: "Master Proyek",
    menu: "Master Data > Master Proyek",
    audience: "admin",
    icon: Briefcase,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
     summary: "Mengatur proyek SIGAP dan identitas project payload staging tanpa mengubah data internal.",
    whenToUse: [
      "Memastikan pilihan proyek tersedia saat registrasi.",
      "Memeriksa relasi proyek dengan cabang.",
      "Menyediakan data proyek untuk pengajuan Unit.",
      "Menambahkan proyek staging secara manual untuk pengujian integrasi.",
    ],
    steps: [
      "Buka Master Proyek.",
      "Cek daftar proyek, cabang, dan kolom Keterangan.",
      "Klik Tambah manual untuk membuat proyek lokal. Isi ID dan kode proyek Marison hanya jika nilainya sudah diketahui dari API external.",
      "Untuk baris amber, lengkapi entitas atau mapping yang disebutkan pada Keterangan.",
      "Pastikan data proyek aktif sebelum dipakai user.",
      "Proyek hasil sinkron dengan project ID dan relasi branch external valid otomatis berstatus Siap dikirim - data external.",
      "Untuk proyek lokal/trial, pilih project external dari katalog branch efektif. Mapping branch yang tidak cocok berstatus Perlu koreksi relasi dan ditolak backend.",
    ],
    examples: [
      "Pada approval Unit biasa, pemeriksa mengikuti proyek pemohon. Kandidat #509: hanya pemilik revisi Unit eksternal terbuka dapat mengganti proyek melalui Tindak Lanjut, tanpa mengganti nomor/identitas surat.",
    ],
    troubleshooting: [
      "Kandidat #509: setelah proyek revisi Unit eksternal berubah, kapasitas terbaru dimuat ulang dan alokasi lama dikosongkan. Pemeriksa harus mengisi ulang alokasi sesuai proyek revisi.",
      "Jika proyek tidak muncul, cek data source proyek dan status aktif proyek.",
      "Jika proyek manual tidak muncul pada Non Unit, pastikan ID Proyek Marison dan ID Branch Marison pada kantor proyek sudah terisi, atau lengkapi pemetaan manual untuk proyek yang memakai identitas external.",
      "Jika ID external ditolak, cari proyek lain yang sudah memakai ID tersebut. Satu ID hanya boleh terhubung ke satu proyek SIGAP.",
      "Jika unit tidak muncul, cek integrasi unit/proyek dan konfigurasi pengajuan Unit.",
      "Jika badge Master Proyek masih tampil, periksa proyek amber yang belum memiliki entitas atau mapping cabang lengkap.",
    ],
  };

export const adminProjectsDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Data proyek",
      columns: ["Field", "Fungsi"],
      rows: [
        ["Nama proyek", "Tampilan pilihan proyek saat registrasi atau approval unit."],
        ["Kode proyek", "Segmen nomor surat dan kode proyek pada integrasi."],
        ["Cabang", "Menghubungkan proyek ke kantor/cabang terkait."],
        ["Status", "Menentukan apakah proyek muncul sebagai pilihan aktif."],
      ],
    },
  ];
