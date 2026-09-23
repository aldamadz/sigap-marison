import { ShieldCheck } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const notificationDocs: DocsEntry = {
    id: "notification",
    title: "Notifikasi, badge, dan realtime",
    menu: "Sidebar dan Persetujuan",
    audience: "troubleshooting",
    icon: ShieldCheck,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Memahami badge, notifikasi, dan data realtime pada persetujuan atau tim pemeriksa.",
    whenToUse: [
      "Badge muncul tetapi antrean terlihat kosong.",
      "Tim pemeriksa tidak mendapat notifikasi.",
      "Tugas rekomendasi muncul di badge tetapi belum terlihat di antrean biasa.",
      "Perubahan tim pemeriksa belum terlihat oleh signer.",
    ],
    steps: [
      "Buka menu Persetujuan dan cek filter yang aktif.",
      "Jika badge berasal dari rekomendasi, buka menu Rekomendasi.",
      "Pastikan tugas memang sudah masuk ke user tersebut.",
      "Refresh jika koneksi realtime sempat terputus.",
    ],
    examples: [
      "Step 3 belum dihitung pending jika surat masih berada di step 2.",
      "Tugas tim pemeriksa ikut dihitung badge karena itu tugas aktif sebelum signer aksi.",
      "Tugas rekomendasi dihitung terpisah dari antrean Persetujuan karena petugas perlu mengambil draft terlebih dahulu.",
    ],
    troubleshooting: [
      "Jika badge tidak turun setelah diproses, tunggu realtime update atau refresh halaman.",
      "Jika notifikasi suara berulang di mobile, cek izin browser dan status tab.",
    ],
  };

export const notificationDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Sumber badge dan notifikasi",
      columns: ["Sumber", "Kapan muncul"],
      rows: [
        ["Signer", "Saat step sudah aktif untuk user yang bertanda tangan."],
        ["Tim pemeriksa", "Saat pemeriksaan data/lampiran menjadi tugas user."],
        ["Rekomendasi", "Saat ada dokumen rekomendasi aset yang perlu diambil atau dilanjutkan oleh Staff IT/PBO."],
        ["Realtime", "Saat ada perubahan surat/signature/tim pemeriksa yang relevan."],
        ["Web push", "Saat browser sudah mengizinkan notifikasi dan ada task baru dari sistem."],
        ["Tab focus refresh", "Saat tab kembali aktif dan sistem menyinkronkan data."],
      ],
    },
    {
      type: "table",
      title: "Pemeriksaan web push",
      columns: ["Kondisi", "Yang dilakukan"],
      rows: [
        ["Notifikasi browser belum muncul", "Pastikan izin notifikasi browser sudah Allow untuk domain SIGAP."],
        ["Badge ada tetapi push tidak masuk", "Buka aplikasi sekali agar subscription push dibuat ulang, lalu refresh Persetujuan/Rekomendasi."],
        ["Push masuk ke user lama", "Logout lalu login ulang agar subscription mengikuti akun aktif."],
        ["Mobile tidak bersuara", "Cek mode senyap perangkat dan izin notifikasi browser/PWA."],
      ],
    },
  ];
