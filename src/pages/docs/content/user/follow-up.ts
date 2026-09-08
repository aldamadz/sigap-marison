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
      "Baca tabel perubahan dan ringkasan dokumen.",
      "Pilih Lanjutkan jika perubahan disetujui, atau Batalkan jika pengajuan tidak dilanjutkan.",
      "Jika dilanjutkan, persetujuan dimulai ulang dari tahap pertama agar seluruh pihak menandatangani data terbaru.",
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
          ["Lanjutkan", "Data revisi diterapkan dan tanda tangan dimulai ulang dari tahap 1.", "PDF lama dibersihkan agar preview berikutnya memakai data terbaru."],
          ["Batalkan", "Pengajuan berhenti dan nomor surat ditandai hangus.", "Alasan pembatalan tersimpan pada riwayat."],
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
