import { SlidersHorizontal } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const adminFormUsagesDocs: DocsEntry = {
    id: "admin-form-usages",
    title: "Kegunaan Form",
    menu: "Konfigurasi > Kegunaan Form",
    audience: "admin",
    icon: SlidersHorizontal,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur penggunaan form berdasarkan departemen, kategori, alur tanda tangan, tim pemeriksa, dan kebutuhan lampiran.",
    whenToUse: [
      "Membuat kegunaan dokumen baru untuk departemen tertentu.",
      "Mengatur alur tanda tangan 2 sampai 8 tahap sesuai konfigurasi.",
      "Menambahkan tim pemeriksa sebelum penandatangan boleh aksi.",
      "Mengatur dokumen rekomendasi atau prasyarat yang harus selesai sebelum surat induk lanjut.",
    ],
    steps: [
      "Buka Kegunaan Form.",
      "Pilih form, departemen, kategori, dan jenis surat.",
      "Atur step tanda tangan dan kandidat signer.",
      "Tim pemeriksa dimulai dengan nol orang terpilih. Aktifkan bila perlu, lalu pilih orang yang tepat untuk setiap kegunaan dan tahap; jangan otomatis memilih seluruh kandidat.",
      "Atur dokumen tertaut bila form membutuhkan rekomendasi aset atau prasyarat sebelum approval lanjut.",
      "Simpan konfigurasi dan uji pada registrasi surat.",
    ],
    examples: [
      "Untuk pengajuan cabang, kandidat SPV dan BM dapat dibatasi sesuai kantor pemohon.",
      "Untuk Unit, tim pemeriksa dapat mengisi detail kavling sebelum Mgr. Perencanaan menyetujui.",
      "Untuk aset yang perlu rekomendasi, tugas rekomendasi dapat diarahkan ke Staff IT/PBO dan dikunci saat salah satu kandidat mengambil draft.",
    ],
    troubleshooting: [
      "Jika user tidak bisa membuat Unit, cek izin departemen pengaju pada konfigurasi Unit.",
      "Jika signer tidak bisa setujui, cek apakah tim pemeriksa belum pemeriksaan.",
      "Jika rekomendasi tidak muncul, cek form rekomendasi, departemen PBO, kandidat Staff IT/PBO, dan tahap prasyarat pada Kegunaan Form.",
      "Jika admin mengganti tahap atau kandidat signer, buka kembali draft. Draft aktif mengikuti konfigurasi terbaru; surat yang sudah terdaftar tetap memakai snapshot lama.",
    ],
  };

export const adminFormUsagesDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Komponen kegunaan form",
      columns: ["Komponen", "Fungsi"],
      rows: [
        ["Departemen pengaju", "Menentukan siapa yang boleh memakai kegunaan ini."],
        ["Kategori", "Aset, Non Aset, Unit, atau Non Unit."],
        ["Jenis surat", "Menentukan index dan format penomoran."],
        ["Step signer", "Urutan approval dan kandidat signer."],
        ["Scope kandidat", "Manual, kantor pemohon, kantor pusat, departemen pemohon, atau campuran BM/dept."],
        ["Tim pemeriksa", "Pemeriksaan data/lampiran sebelum signer aksi."],
        ["Lampiran", "Persyaratan file pemohon/tim pemeriksa/signer."],
        ["Dokumen tertaut", "Syarat dokumen rekomendasi atau prasyarat lain sebelum surat induk lanjut."],
      ],
    },
    {
      type: "table",
      title: "Scope kandidat signer",
      columns: ["Scope", "Arti"],
      rows: [
        ["Manual", "Admin memilih kandidat tertentu."],
        ["Kantor pemohon", "Kandidat dibatasi ke kantor/cabang surat."],
        ["Kantor pusat", "Kandidat hanya dari kantor pusat."],
        ["Departemen pemohon", "Kandidat mengikuti departemen pengaju."],
        ["BM cabang / dept pusat", "KCP mencari BM KC terkait; jalur cabang dinamis memakai prioritas BM > Assistant Branch Manager (ABM) > SPV aktif sesuai konteks. Pusat memakai konfigurasi departemen, bukan fallback cabang."],
        ["Lintas kantor", "Kandidat dapat berasal dari kantor mana pun jika proses memang tidak terikat lokasi pemohon."],
      ],
    },
    {
      type: "table",
      title: "Pemeriksa dan RAB Dana",
      columns: ["Pengaturan", "Aturan"],
      rows: [
        ["Tim pemeriksa opt-in", "Nol orang terpilih saat mulai. Pilih nama petugas secara eksplisit per kegunaan dan tahap; Usman/Tri bukan pilihan otomatis."],
        ["Checklist Item Dana", "Aktifkan pada tahap yang memerlukan pemeriksaan; setiap item terkini harus selesai diperiksa."],
        ["Dana Perencanaan", "Lampiran RAB opsional. Tim Perencanaan boleh menambahkan RAB jika pemohon belum melampirkannya; jangan menjadikannya syarat wajib upload."],
        ["Dana HRD", "Lampiran RAB opsional. HRD dapat meminta RAB/perbaikan redaksi melalui Minta Perbaikan Pemohon; RAB kosong tidak otomatis memblokir atau menolak pengajuan."],
        ["Tidak memerlukan RAB", "Nilai rab_not_required menyatakan maksud pengecualian, misalnya servis AC/kendaraan. Tidak menghapus file yang sudah ada; tidak menjadi guard waiver karena upload RAB memang tidak wajib."],
        ["KEU dan jenis biaya", "Aturan jenis biaya KEU 1/KEU 10 tidak berubah; pilihan biaya PGD Dana terpisah dari RAB."],
        ["Surat lama", "Snapshot petugas dan persyaratan surat terdaftar tidak otomatis diganti oleh konfigurasi baru."],
      ],
    },
    {
      type: "table",
      title: "Konfigurasi rekomendasi aset",
      columns: ["Pengaturan", "Dampak"],
      rows: [
        ["Form rekomendasi", "Menentukan template dokumen rekomendasi yang dibuat sebagai surat tertaut."],
        ["Departemen PBO", "Menjadi pemilik nomor dan antrean tugas rekomendasi aset."],
        ["Tahap prasyarat", "Surat induk dapat dikunci sampai dokumen rekomendasi tertaut selesai."],
        ["Kandidat Staff IT/PBO", "Menentukan siapa yang dapat melihat dan mengambil tugas rekomendasi."],
        ["Shared lock", "Kandidat pertama yang mengambil tugas menjadi pembuat draft; kandidat lain hanya melihat status terkunci."],
      ],
    },
  ];
