import { BarChart3 } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminSlaDocs: DocsEntry = {
    id: "admin-sla",
    title: "SLA Departemen",
    menu: "SLA Departemen dan Konfigurasi > SLA Departemen",
    audience: "admin",
    icon: BarChart3,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur dan memantau performa approval berdasarkan jam kerja efektif departemen.",
    whenToUse: [
      "Melihat approval on-time, mendekati SLA, terlambat, dan pending.",
      "Mengatur jam kerja, hari kerja, dan jam istirahat.",
      "Mengevaluasi bottleneck antar departemen.",
    ],
    steps: [
      "Buka SLA Departemen untuk melihat performa.",
      "Buka Konfigurasi SLA untuk mengatur jam kerja.",
      "Cek detail departemen jika perlu melihat daftar dokumen.",
    ],
    examples: [
      "Jika surat masuk jam 16.00 dan disetujui 08.30 esok hari, waktu di luar jam kerja tidak dihitung.",
      "Jika dokumen ditolak, proses berhenti dan tidak dihitung sebagai pending tahap berikutnya.",
    ],
    troubleshooting: [
      "Jika pending terlihat salah, cek apakah step memang sudah masuk ke user tersebut.",
      "Jika on-time 0 dari 0, cek rentang tanggal dan data approval selesai.",
    ],
  };

export const adminSlaDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Status SLA",
      columns: ["Status", "Arti"],
      rows: [
        ["completed_on_time", "Sudah diproses dan durasi efektif <= target SLA."],
        ["completed_late", "Sudah diproses dan durasi efektif > target SLA."],
        ["pending_on_time", "Step aktif sudah masuk signer dan masih dalam target SLA."],
        ["pending_late", "Step aktif sudah masuk signer dan sudah melewati SLA."],
        ["menunggu_perbaikan", "Surat sedang berada di pemohon atau pihak perbaikan; tidak dihitung sebagai pending signer."],
        ["rejected", "Ditolak dan proses berhenti; tidak dihitung pending step berikutnya."],
      ],
    },
    {
      type: "callout",
      title: "SLA berhenti saat pengajuan dikembalikan",
      description: "Waktu SLA signer berhenti ketika tahap tidak bisa mengambil keputusan, termasuk saat menunggu pemeriksaan, rekomendasi, perbaikan pemohon, atau periode penerimaan. Saat tahap siap, waktu kerja dilanjutkan sesuai alur; revisi internal tidak selalu kembali ke tahap pertama.",
      tone: "info",
    },
    {
      type: "steps",
      title: "Periode penerimaan",
      items: [
        "SLA jam kerja signer dan periode penerimaan adalah pengaturan terpisah. Biarkan periode penerimaan nonaktif jika departemen hanya membutuhkan SLA signer.",
        "Admin dapat menunjuk pengelola periode penerimaan. Pengelola memakai Pengaturan > SLA Departemen; target SLA penandatangan dan jam kerja hanya dapat diubah admin.",
        "Atur jadwal untuk semua pengajuan, satu form, atau satu kegunaan. Aturan kegunaan didahulukan, lalu form, lalu aturan umum departemen.",
        "Untuk aturan mingguan, tentukan minggu yang berlaku dan jendela penerimaannya. Contoh: pekan ini ditutup Kamis pukul 16.00 WIB.",
        "Pengajuan di luar jendela tetap dibuat, tetapi menunggu periode penerimaan berikutnya sebelum tahap terkait bisa mengambil tindakan.",
      ],
    },
    {
      type: "table",
      title: "Jam kerja efektif",
      columns: ["Komponen", "Default"],
      rows: [
        ["Hari kerja", "Senin sampai Jumat."],
        ["Jam kerja", "08:00 sampai 17:00."],
        ["Istirahat", "12:00 sampai 13:00 tidak dihitung."],
        ["Target SLA", "120 menit efektif."],
        ["Timezone", "Asia/Jakarta."],
      ],
    },
  ];
