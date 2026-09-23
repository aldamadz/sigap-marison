import { MapPin } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminOfficesDocs: DocsEntry = {
    id: "admin-offices",
    title: "Master Kantor Cabang",
    menu: "Master Data > Master Kantor Cabang",
    audience: "admin",
    icon: MapPin,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
     summary: "Mengatur kantor pusat, cabang, kost, mapping workflow, dan identitas branch payload staging.",
    whenToUse: [
      "Menambah kantor atau cabang baru.",
      "Membetulkan mapping kantor dari data import HRD.",
      "Mengatur kandidat signer yang harus mengikuti kantor pemohon.",
    ],
    steps: [
      "Buka Master Kantor Cabang.",
      "Periksa baris berwarna amber dan baca kolom Keterangan.",
      "Tambah atau edit nama kantor, kode, dan tipe kantor.",
      "Cek user yang memakai kantor tersebut.",
      "Pada Mapping Payload Staging, kantor hasil sinkron dengan branch ID valid otomatis berstatus Siap dikirim - data external.",
      "Untuk kantor lokal/trial, cari kantor external hasil sinkronisasi lalu klik Simpan. Reset mengembalikan penggunaan identitas external sumber atau status Belum dapat dikirim.",
    ],
    examples: [
      "User KC Jepara akan melihat kandidat SPV/BM Jepara pada workflow yang mengikuti kantor pemohon.",
      "Kantor Pusat dipakai untuk manager pusat dan konfigurasi yang bersifat pusat.",
    ],
    troubleshooting: [
      "Jika kandidat cabang salah, cek kantor pada profil user dan tipe kantor.",
      "Jika kantor belum termapping saat import, tambahkan alias kantor lalu import ulang.",
      "Jika badge masih tampil, selesaikan seluruh alasan pada kolom Keterangan lalu segarkan data.",
    ],
  };

export const adminOfficesDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Data kantor",
      columns: ["Field", "Fungsi"],
      rows: [
        ["Nama kantor", "Nama Kantor Pusat, KC, KCP, atau unit lokasi lain."],
        ["Kode kantor", "Dipakai pada nomor surat cabang dan filter data."],
        ["Kedudukan", "Menentukan apakah kantor diperlakukan sebagai Pusat, KC, KCP, atau lainnya."],
        ["Parent", "Relasi KCP ke KC induk."],
        ["Alias", "Mapping nama kantor dari import HRD."],
      ],
    },
  ];
