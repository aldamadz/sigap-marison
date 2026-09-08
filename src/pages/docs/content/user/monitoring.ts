import { SearchCheck } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const monitoringDocs: DocsEntry = {
    id: "monitoring",
    title: "Status Pengajuan",
    menu: "Layanan Surat > Status Pengajuan",
    audience: "user",
    icon: SearchCheck,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Melacak dokumen yang Anda buat, termasuk progres tanda tangan, status, dokumen, dan lampiran.",
    whenToUse: [
      "Mengecek dokumen sudah sampai tahap mana.",
      "Membuka PDF dokumen atau lampiran.",
      "Melihat alasan penolakan atau catatan proses.",
    ],
    steps: [
      "Buka Status Pengajuan.",
      "Cari dokumen berdasarkan judul, nomor, atau status.",
      "Buka detail untuk melihat timeline dan dokumen.",
      "Gunakan tombol dokumen atau lampiran bila perlu pemeriksaan visual.",
    ],
    examples: [
      "Setelah membuat surat, pantau apakah dokumen masih proses, selesai, atau ditolak.",
      "Jika dokumen selesai, buka PDF untuk memastikan tanda tangan terakhir sudah masuk.",
    ],
    troubleshooting: [
      "Jika PDF masih loading, tunggu proses generate selesai lalu coba lagi.",
      "Jika dokumen tidak ditemukan, refresh data dan pastikan dokumen bukan draft yang belum dikirim.",
      "Jika status ditolak, proses berhenti dan tidak masuk hitungan pending tahap berikutnya.",
    ],
  };

export const monitoringDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Membaca status pengajuan",
      columns: ["Status", "Arti", "Langkah berikutnya"],
      rows: [
        ["Draft", "Nomor sudah dipesan tetapi surat belum dikirim.", "Lanjutkan registrasi atau batalkan draft."],
        ["Proses", "Surat sedang menunggu tanda tangan atau pemeriksaan.", "Pantau step aktif dan catatan terbaru."],
        ["Selesai", "Seluruh tanda tangan selesai.", "Buka PDF final bila perlu arsip."],
        ["Ditolak", "Salah satu tahap menolak dan alur berhenti.", "Baca alasan, lalu buat pengajuan baru jika perlu."],
      ],
    },
    {
      type: "table",
      title: "File pada status pengajuan",
      columns: ["File", "Kapan tersedia", "Catatan"],
      rows: [
        ["PDF utama", "Setelah worker PDF selesai membuat preview.", "Berisi nomor, data pemohon, isi dokumen, dan tanda tangan terbaru."],
        ["Snapshot", "Setelah step approval tertentu diproses.", "Dipakai untuk membandingkan kondisi dokumen pada tahap tertentu."],
        ["Lampiran pemohon", "Setelah registrasi dikirim.", "File pendukung awal pengajuan."],
        ["Lampiran approval/tim pemeriksa", "Setelah tim pemeriksa atau approver mengunggah file.", "Bisa berubah jika file diganti pada revisi."],
      ],
    },
  ];
