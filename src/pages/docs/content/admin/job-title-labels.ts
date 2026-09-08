import { Users } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminJobTitleLabelsDocs: DocsEntry = {
    id: "admin-job-title-labels",
    title: "Label Jabatan",
    menu: "Konfigurasi > Label Jabatan",
    audience: "admin",
    icon: Users,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur label jabatan yang tampil pada dokumen tanpa mengubah jabatan asli user.",
    whenToUse: [
      "Menyingkat jabatan panjang pada kotak tanda tangan.",
      "Menyesuaikan label dokumen seperti `Mgr. PO` tanpa mengubah data HRD.",
      "Menjaga template tetap rapi saat jabatan terlalu panjang.",
    ],
    steps: [
      "Buka Label Jabatan.",
      "Tambahkan jabatan asli dan label tampilan.",
      "Simpan lalu cek preview dokumen.",
    ],
    examples: [
      "`Manager Pengembangan Organisasi` dapat ditampilkan sebagai `Mgr. PO` pada dokumen.",
    ],
    troubleshooting: [
      "Jika label tidak muncul, cek apakah jabatan user sama persis dengan jabatan yang dikonfigurasi.",
      "Jika dokumen masih memakai jabatan lama, buka ulang preview agar PDF terbaru dibuat.",
    ],
  };

export const adminJobTitleLabelsDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Jabatan asli vs label dokumen",
      columns: ["Data", "Dipakai untuk"],
      rows: [
        ["Jabatan asli", "Data HRD/profil user, tampil di email dan audit sebagai identitas aktual."],
        ["Label dokumen", "Singkatan pada kotak tanda tangan agar template rapi."],
        ["Fallback", "Jika label tidak ada, dokumen memakai jabatan asli."],
      ],
    },
  ];
