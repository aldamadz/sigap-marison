import { Network } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminHierarchyDocs: DocsEntry = {
    id: "admin-hierarchy",
    title: "Hirarki Organisasi",
    menu: "Master Data > Hirarki Organisasi",
    audience: "admin",
    icon: Network,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Melihat struktur organisasi dalam bentuk hirarki, termasuk filter kantor dan level jabatan.",
    whenToUse: [
      "Memvalidasi posisi karyawan dalam struktur organisasi.",
      "Melihat struktur cabang dengan Branch Manager sebagai posisi tertinggi cabang.",
      "Mengekspor tampilan hirarki bila diperlukan.",
    ],
    steps: [
      "Buka Hirarki Organisasi.",
      "Gunakan filter kantor, departemen, atau jabatan.",
      "Klik node karyawan untuk melihat detail.",
      "Gunakan export jika ingin menyimpan visual struktur.",
    ],
    examples: [
      "Saat filter KC Jepara aktif, BM Jepara tampil sebagai level tertinggi cabang.",
      "Sekretaris Direksi sejajar dengan Staff, tetapi atasan langsungnya Direksi.",
    ],
    troubleshooting: [
      "Jika posisi karyawan terlalu tinggi atau rendah, cek jabatan dan level jabatan pada master user.",
      "Jika data tidak bergeser realtime, refresh halaman dan cek koneksi realtime.",
    ],
  };

export const adminHierarchyDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Atasan cabang dinamis",
      columns: ["Kondisi", "Aturan"],
      rows: [
        ["KCP", "Cari BM KC terkait terlebih dahulu melalui relasi kantor yang valid; fallback mengikuti pejabat aktif yang memenuhi konteks."],
        ["Prioritas cabang", "BM > Assistant Branch Manager (ABM) > SPV. Pejabat setingkat tidak saling menjadi atasan; kecocokan departemen diperiksa bila kandidat lebih dari satu."],
        ["Mutasi / nonaktif / pergantian pejabat", "Relasi atasan otomatis dihitung ulang. Sinkronisasi tidak mengembalikan ID atasan lama yang sudah tidak sesuai."],
        ["Pejabat tidak ditemukan / ambigu", "Relasi dikosongkan, bukan memilih orang secara acak. Periksa kantor induk, jabatan, departemen, dan status aktif."],
        ["Pindah ke Kantor Pusat tanpa atasan", "Atasan cabang lama dibersihkan; tidak membuat parent otomatis bila HQ tidak memiliki atasan terkonfigurasi. Relasi HQ yang memang dikonfigurasi tetap dipertahankan."],
        ["Histori", "Perubahan atasan tidak menulis ulang identitas atau tanda tangan surat lama."],
      ],
    },
    {
      type: "table",
      title: "Level jabatan hirarki",
      columns: ["Level", "Jabatan", "Catatan"],
      rows: [
        ["1", "Pelaksana", "Operasional paling bawah."],
        ["2", "Staff", "Termasuk Sekdir dan Pengawas Lapangan/PL."],
        ["3", "Supervisor", "Di atas staff."],
        ["4", "Assistant Manager / Assistant Branch Manager", "Di bawah Manager/BM."],
        ["5", "Manager / Branch Manager", "Level manajerial."],
        ["6", "Direktur", "Direksi."],
        ["7", "Direktur Utama", "Level tertinggi."],
      ],
    },
    {
      type: "table",
      title: "Filter dan export",
      columns: ["Kontrol", "Fungsi"],
      rows: [
        ["Kantor", "Jika cabang dipilih, BM cabang menjadi top tier tampilan."],
        ["Status", "Default hanya user aktif."],
        ["Tree list", "Lebih ringan untuk mobile dan pencarian cepat."],
        ["Chart node", "Visual piramid untuk desktop."],
        ["Export PDF", "Menyimpan struktur sesuai filter aktif."],
      ],
    },
  ];
