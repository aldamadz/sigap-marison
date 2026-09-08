import { SearchCheck } from "lucide-react";
import type { DocsEntry } from "../types";
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
