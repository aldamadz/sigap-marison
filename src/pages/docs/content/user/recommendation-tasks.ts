import { FileCheck2 } from "lucide-react";
import type { DocsEntry } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const recommendationTasksDocs: DocsEntry = {
    id: "recommendation-tasks",
    title: "Rekomendasi",
    menu: "Layanan Surat > Rekomendasi",
    audience: "user",
    icon: FileCheck2,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Antrean pembuatan dokumen rekomendasi aset yang tertaut ke surat induk.",
    whenToUse: [
      "Mengambil tugas rekomendasi aset yang sudah dibuat sistem.",
      "Melanjutkan draft rekomendasi yang sudah terkunci untuk akun Anda.",
      "Melihat apakah tugas rekomendasi sedang dikerjakan oleh Staff IT/PBO lain.",
    ],
    steps: [
      "Buka menu Rekomendasi.",
      "Pilih tugas rekomendasi yang belum terkunci atau lanjutkan draft yang sudah Anda ambil.",
      "Lengkapi setiap item permohonan melalui navigator item, termasuk lampiran gambar dan link referensi bila ada.",
      "Konfirmasi dokumen agar rekomendasi tertaut ke surat induk.",
      "Pastikan proses lanjut ke pemeriksa atau penandatangan berikutnya sesuai alur.",
    ],
    examples: [
      "Jika ada dua Staff IT, keduanya dapat melihat tugas yang sama sampai salah satu memilih Ambil Tugas.",
      "Setelah Staff IT mengambil tugas, kandidat lain melihat status Terkunci dan tidak dapat mengedit draft yang sama.",
      "Dokumen rekomendasi memiliki nomor surat, template, tanda tangan, status, preview, dan lampiran sendiri.",
    ],
    troubleshooting: [
      "Jika menu Rekomendasi tidak muncul, akses dibatasi untuk akun aktif di departemen PBO/Pengembangan Organisasi.",
      "Jika tugas terkunci oleh user lain, tunggu user tersebut menyelesaikan draft atau hubungi admin untuk pemeriksaan.",
      "Jika rekomendasi sudah dikonfirmasi tetapi surat induk belum lanjut, refresh data dan cek status dokumen tertaut pada panel rekomendasi.",
    ],
    related: ["Registrasi Surat", "Persetujuan", "Dokumen dan Lampiran"],
    sections: [
      {
        type: "steps",
        title: "Alur rekomendasi aset",
        items: [
          "Pemohon membuat surat induk kategori Aset dan memilih membutuhkan rekomendasi.",
          "Setelah surat induk dikonfirmasi, sistem membuat nomor dan tugas rekomendasi PBO.",
          "Staff IT/PBO membuka menu Rekomendasi dan mengambil tugas.",
          "Sistem mengunci draft untuk user pertama yang mengambil tugas.",
          "Sistem menyalin daftar barang dari permohonan induk ke satu dokumen rekomendasi.",
          "Petugas mengisi rekomendasi satu per satu melalui navigator item, lalu mengonfirmasi dokumen.",
          "Dokumen rekomendasi tertaut ke surat induk dan approval induk dapat lanjut setelah syarat rekomendasi terpenuhi.",
          "Jika penanda tangan meminta revisi rekomendasi, tugas muncul kembali di menu Rekomendasi dengan data terakhir sebagai draft awal.",
          "Rekomendasi revisi harus dikonfirmasi ulang dan ditandatangani ulang oleh Mgr. PO sebelum surat induk kembali ke pemohon untuk lanjut atau batal.",
        ],
      },
      {
        type: "table",
        title: "Mengisi dokumen rekomendasi",
        columns: ["Bagian", "Aturan operasional"],
        rows: [
          ["Nama barang/alat kerja", "Isi sesuai barang yang dinilai untuk service, ganti, atau beli baru."],
          ["Navigator item", "Setiap item permohonan memiliki satu isian rekomendasi. Nama barang mengikuti permohonan dan tidak dapat diubah."],
          ["Nomor dokumen", "Dibuat otomatis dari pengajuan induk. Ikon gembok menandakan nomor tidak dapat diubah oleh petugas rekomendasi."],
          ["No registrasi", "Opsional jika barang sudah memiliki nomor inventaris atau registrasi."],
          ["Lokasi/PIC", "Diambil dari pilihan user agar barang mudah ditelusuri."],
          ["Kerusakan", "Opsional, dipakai untuk menjelaskan masalah awal barang."],
          ["Hasil rekomendasi", "Pilih Service, Ganti Komponen, Beli Baru, atau Tidak Direkomendasikan sesuai hasil pemeriksaan per item."],
          ["Lampiran gambar", "Foto setiap komponen wajib. Foto baris induk yang namanya sama dengan item permohonan opsional jika ada rincian komponen lain. Tanpa komponen, foto tetap wajib. Untuk Tidak Direkomendasikan, alasan wajib dan gambar opsional."],
          ["Link referensi", "Opsional dan tampil di UI/email sebagai pendukung keputusan."],
        ],
      },
      {
        type: "table",
        title: "Status dan lock rekomendasi",
        columns: ["Status", "Arti", "Tindakan"],
        rows: [
          ["Menunggu Staff IT", "Tugas belum diambil kandidat mana pun.", "Klik Ambil Tugas jika memang Anda yang akan mengerjakan."],
          ["Sedang Anda kerjakan", "Draft sudah terkunci untuk akun Anda.", "Klik Lanjutkan Draft dan selesaikan dokumen."],
          ["Terkunci", "Draft sedang dikerjakan oleh kandidat lain.", "Pantau status atau koordinasikan dengan petugas yang mengambil tugas."],
          ["Perlu Revisi", "Rekomendasi lama dikembalikan oleh penanda tangan surat induk.", "Ambil revisi untuk memperbaiki data dari versi rekomendasi terakhir."],
          ["Selesai", "Dokumen rekomendasi sudah dikonfirmasi dan tertaut ke surat induk.", "Surat induk dapat lanjut sesuai aturan tahap yang menunggu rekomendasi."],
        ],
      },
      {
        type: "troubleshooting",
        title: "Masalah umum rekomendasi",
        items: [
          {
            problem: "Tugas rekomendasi tidak muncul",
            solution:
              "Pastikan akun aktif, berada di PBO/Pengembangan Organisasi, dan surat induk benar-benar memilih membutuhkan rekomendasi.",
          },
          {
            problem: "Tidak bisa mengambil tugas",
            solution:
              "Tugas mungkin sudah dikunci oleh user lain. Lihat label status dan nama user yang sedang mengerjakan.",
          },
          {
            problem: "Gambar item belum terbaca",
            solution:
              "Pastikan item dengan keputusan Service, Ganti Komponen, atau Beli Baru memiliki lampiran gambar dan proses upload selesai sebelum konfirmasi.",
          },
          {
            problem: "Rekomendasi sudah direvisi tetapi surat induk belum bisa lanjut",
            solution:
              "Pastikan dokumen rekomendasi revisi sudah selesai ditandatangani Mgr. PO. Setelah selesai, pemohon surat induk akan menerima tugas untuk melanjutkan atau membatalkan pengajuan.",
          },
        ],
      },
    ],
  };
