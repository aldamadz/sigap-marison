import { ClipboardCheck } from "lucide-react";
import type { DocsEntry } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const followUpDocs: DocsEntry = {
    id: "follow-up",
    title: "Tindak Lanjut",
    menu: "Layanan Surat > Tindak Lanjut",
    audience: "user",
    icon: ClipboardCheck,
    version: "v1.11.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Antrean keputusan pemohon saat pengajuan dikembalikan untuk perbaikan atau perubahan data.",
    whenToUse: [
      "Meninjau perubahan yang dibuat signer, tim pemeriksa, atau tim rekomendasi.",
      "Memutuskan apakah pengajuan dilanjutkan dengan data terbaru atau dibatalkan.",
      "Membaca perbandingan item yang berubah sebelum tanda tangan dimulai ulang.",
    ],
    steps: [
      "Buka Tindak Lanjut saat badge muncul di Layanan Surat.",
      "Pilih pengajuan dari antrean keputusan.",
      "Baca jenis perbaikan, catatan peminta, tabel perubahan bila ada, dan ringkasan dokumen.",
      "Untuk Minta Perbaikan Pemohon, buka draft lengkap lalu perbaiki rincian/spesifikasi atau lampiran. Untuk Revisi oleh Penandatangan, tinjau nilai diajukan, nilai usulan, dan alasannya.",
      "Pilih Lanjutkan jika perubahan disetujui, atau Batalkan jika pengajuan tidak dilanjutkan.",
      "Revisi internal dilanjutkan dengan nomor surat yang sama dari tahap yang meminta perbaikan. Tahap setelahnya diperiksa/ditandatangani ulang; persetujuan sebelum tahap peminta tetap tersimpan.",
    ],
    examples: [
      "Pengajuan 10 unit hanya disetujui 8 unit. Pemohon membuka Tindak Lanjut, membaca alasan, lalu memilih Lanjutkan atau Batalkan.",
      "Permohonan aset 3 item hanya direkomendasikan 2 item. Item yang tidak direkomendasikan tampil dicoret dan pemohon mengambil keputusan dari halaman ini.",
      "Rekomendasi IT direvisi setelah arahan signer. Setelah rekomendasi selesai, pemohon menerima antrean Tindak Lanjut untuk menyetujui perubahan.",
    ],
    troubleshooting: [
      "Jika badge Tindak Lanjut muncul tetapi daftar kosong, tekan Segarkan dan pastikan akun yang dipakai adalah pemohon surat tersebut.",
      "Jika tombol Lanjutkan gagal, cek apakah event revisi masih aktif atau sudah diproses dari tab lain.",
      "Jika memilih Batalkan, isi alasan minimal lima karakter agar riwayat audit jelas.",
    ],
    related: ["Persetujuan", "Status Pengajuan", "Rekomendasi"],
    sections: [
      {
        type: "table",
        title: "Perbedaan dengan Status Pengajuan",
        columns: ["Halaman", "Fungsi", "Aksi pemohon"],
        rows: [
          ["Status Pengajuan", "Membaca progres, detail dokumen, lampiran, dan riwayat.", "Tidak memproses keputusan revisi."],
          ["Tindak Lanjut", "Memproses keputusan setelah pengajuan dikembalikan.", "Lanjutkan proses atau batalkan pengajuan."],
        ],
      },
      {
        type: "table",
        title: "Dampak keputusan",
        columns: ["Keputusan", "Yang terjadi", "Catatan"],
        rows: [
          ["Lanjutkan revisi internal", "Koreksi/usulan yang dikonfirmasi diterapkan; proses kembali ke tahap peminta, bukan selalu tahap 1.", "Nomor surat tetap sama; histori sebelum/sesudah dan persetujuan sebelumnya tetap tersimpan. PDF terbaru mengikuti data revisi."],
          ["Batalkan", "Pengajuan berhenti dan nomor surat ditandai hangus.", "Alasan pembatalan tersimpan pada riwayat."],
        ],
      },
      {
        type: "table",
        title: "Revisi Unit eksternal",
        columns: ["Batas", "Aturan"],
        rows: [
          ["Pemilik dan event", "Hanya pemilik revisi Unit eksternal yang masih terbuka dapat mengubah proyek/jumlah dari draft Tindak Lanjut."],
          ["Identitas surat", "Nomor dan identitas surat lama tidak diganti meskipun proyek revisi berubah."],
          ["Kapasitas dan alokasi", "Pilihan proyek memuat ulang kapasitas terbaru; alokasi lama dikosongkan dan harus diisi/diperiksa ulang untuk proyek revisi."],
          ["Validasi server", "Kapasitas diperiksa server, bukan dipercaya dari browser. Receipt kapasitas hanya berlaku sekali untuk pemilik, revisi terbuka, draft aktif, proyek dan jumlah yang cocok; receipt kedaluwarsa atau sudah dipakai tidak dapat dikirim ulang."],
          ["Alur eksternal", "Ikuti tahap ulang yang dikonfigurasi untuk keputusan eksternal; aturan tahap peminta revisi internal tidak menggantikan alur ini."],
        ],
      },
      {
        type: "table",
        title: "Data yang ditampilkan",
        columns: ["Bagian", "Isi"],
        rows: [
          ["Antrean keputusan", "Judul, nomor surat, pihak yang mengembalikan, dan tahap asal."],
          ["Tabel perubahan", "Item, keputusan, nilai diajukan, nilai disetujui, dan alasan."],
          ["Ringkasan dokumen", "Identitas pengajuan, isi dokumen, item dicoret jika tidak disetujui, unit/kavling, dan lampiran."],
        ],
      },
    ],
  };
