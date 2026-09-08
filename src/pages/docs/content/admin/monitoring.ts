import { SearchCheck } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminMonitoringDocs: DocsEntry = {
    id: "admin-monitoring",
    title: "Monitoring Admin",
    menu: "Monitoring Admin",
    audience: "admin",
    icon: SearchCheck,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Melihat seluruh status dokumen untuk kebutuhan monitoring operasional admin.",
    whenToUse: [
      "Memantau semua surat lintas user sesuai hak admin.",
      "Mencari dokumen bermasalah.",
      "Membuka riwayat lengkap, dokumen, lampiran, dan snapshot.",
    ],
    steps: [
      "Buka Monitoring Admin.",
      "Gunakan pencarian dan filter.",
      "Buka detail dokumen untuk melihat timeline dan file.",
    ],
    examples: [
      "Cari nomor surat tertentu untuk membantu user yang melaporkan dokumen tidak ditemukan.",
      "Gunakan monitoring untuk melihat apakah dokumen berhenti di step tertentu.",
    ],
    troubleshooting: [
      "Jika dokumen tidak bisa dibuka, cek storage mode, token file, dan status generate PDF.",
      "Jika data tidak muncul, cek RLS dan role admin akun.",
    ],
  };

export const adminMonitoringDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Data monitoring admin",
      columns: ["Data", "Fungsi"],
      rows: [
        ["Semua surat", "Admin dapat mencari dokumen lintas user sesuai hak admin."],
        ["Timeline", "Melihat urutan tanda tangan, tim pemeriksa, catatan, dan penolakan."],
        ["File", "Membuka dokumen, snapshot, dan lampiran via endpoint aman."],
        ["Status", "Mendeteksi dokumen berhenti di step tertentu."],
      ],
    },
  ];
