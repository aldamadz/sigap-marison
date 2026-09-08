import { Tag } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminLetterTypesDocs: DocsEntry = {
    id: "admin-letter-types",
    title: "Master Jenis Surat",
    menu: "Master Data > Master Jenis Surat",
    audience: "admin",
    icon: Tag,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur jenis surat, kode, dan index jenis surat per departemen.",
    whenToUse: [
      "Menentukan jenis surat apa saja yang boleh dipakai setiap departemen.",
      "Mengatur kode dan index jenis surat untuk kebutuhan penomoran.",
      "Mencegah jenis surat yang tidak relevan muncul saat registrasi.",
    ],
    steps: [
      "Buka Master Jenis Surat.",
      "Atur data jenis surat dan mapping departemen.",
      "Isi index jenis surat sesuai kebutuhan masing-masing departemen.",
      "Uji registrasi dari departemen terkait.",
    ],
    examples: [
      "Permohonan bisa index 1 di PGD, tetapi index 2 di PO.",
      "Jenis Penagihan bisa disembunyikan dari departemen yang tidak memakai penagihan.",
    ],
    troubleshooting: [
      "Jika jenis surat salah muncul di registrasi, cek mapping departemen.",
      "Jika nomor surat salah index, cek index jenis surat pada departemen tersebut.",
    ],
  };

export const adminLetterTypesDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Jenis surat per departemen",
      columns: ["Data", "Arti"],
      rows: [
        ["Jenis surat", "Nama jenis yang dipilih user saat registrasi."],
        ["Kode", "Kode konseptual jenis surat jika diperlukan konfigurasi."],
        ["Index per departemen", "Angka pada nomor surat setelah kode departemen, misalnya .1."],
        ["Mapping departemen", "Menentukan jenis surat apa yang muncul untuk departemen tersebut."],
      ],
    },
    {
      type: "callout",
      title: "Index tidak global",
      description:
        "Jenis Permohonan bisa menjadi index 1 di satu departemen dan index 2 di departemen lain. Nomor surat mengambil index dari mapping departemen, bukan dari master jenis surat global.",
      tone: "info",
    },
  ];
