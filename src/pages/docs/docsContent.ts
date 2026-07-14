import {
  Activity,
  BarChart3,
  BookOpenText,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileCheck2,
  FileSignature,
  History,
  Inbox,
  KeyRound,
  LayoutTemplate,
  Mail,
  MapPin,
  Network,
  Route,
  SearchCheck,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

export type DocsAudience = "user" | "admin" | "troubleshooting";

export type DocsSection =
  | {
      type: "group";
      title: string;
      description?: string;
      sections: DocsSection[];
    }
  | {
      type: "feature-grid";
      title: string;
      description?: string;
      items: Array<{ title: string; description: string }>;
    }
  | {
      type: "steps";
      title: string;
      description?: string;
      items: string[];
    }
  | {
      type: "list";
      title: string;
      description?: string;
      items: string[];
    }
  | {
      type: "table";
      title: string;
      description?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      type: "callout";
      title: string;
      description: string;
      tone?: "info" | "success" | "warning";
    }
  | {
      type: "troubleshooting";
      title: string;
      description?: string;
      items: Array<{ problem: string; solution: string }>;
    };

export interface DocsEntry {
  id: string;
  title: string;
  menu: string;
  audience: DocsAudience;
  icon: LucideIcon;
  version: string;
  updatedAt: string;
  summary: string;
  whenToUse: string[];
  steps: string[];
  examples: string[];
  troubleshooting: string[];
  related?: string[];
  sections?: DocsSection[];
}

export const DOCS_VERSION = "v1.15.0";
export const DOCS_UPDATED_AT = "14 Juli 2026";

export const DOCS_OVERVIEW_SLUG = "overview";

export const slugifyDocsSegment = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const DOCS_ENTRY_SLUGS: Record<string, string> = {
  dashboard: "dashboard",
  agenda: "agenda",
  calendar: "kalender",
  "surat-registration": "registrasi-surat",
  "approval-inbox": "persetujuan",
  "recommendation-tasks": "rekomendasi",
  monitoring: "status-pengajuan",
  "documents-attachments": "dokumen-lampiran",
  history: "riwayat-terlibat",
  settings: "pengaturan",
  "admin-users": "user-organization",
  "admin-hierarchy": "hirarki-organisasi",
  "admin-departments": "master-departemen",
  "admin-entities": "master-entitas",
  "admin-letter-types": "master-jenis-surat",
  "admin-offices": "master-kantor-cabang",
  "admin-projects": "master-proyek",
  "admin-forms": "form-template",
  "admin-template-builder": "template-builder",
  "admin-workflows": "alur-persetujuan",
  "admin-form-usages": "kegunaan-form",
  "admin-numbering": "penomoran-surat",
  "admin-job-title-labels": "label-jabatan",
  "admin-sla": "sla-departemen",
  "admin-monitoring": "monitoring-admin",
  "admin-audit": "audit-log",
  "admin-email": "email-notification",
  "login-access": "login-akses",
  "document-file": "dokumen-lampiran-error",
  notification: "notifikasi-realtime",
  "deploy-production": "deploy-production",
};

const DOCS_SECTION_SLUGS: Record<string, string> = {
  "Data yang ditampilkan": "data-yang-ditampilkan",
  "Bagian pada Dashboard": "bagian-dashboard",
  "Kontrol periode": "kontrol-periode",
  "Membaca ringkasan Pengajuan Surat": "ringkasan-pengajuan-surat",
  "Membaca KPI Agenda": "kpi-agenda",
  "Menelusuri pekerjaan dari Dashboard": "alur-dashboard",
  "Kendala pada Dashboard": "kendala-dashboard",
  "Nomor surat dan draft": "nomor-draft",
  "Alur registrasi dokumen": "alur-registrasi",
  "Pilihan kategori": "kategori-pengajuan",
  "Yang otomatis diisi sistem": "data-otomatis",
  "Masalah umum saat registrasi": "kendala-registrasi",
  "Area utama Persetujuan": "area-persetujuan",
  "Alur signer": "alur-signer",
  "Perbedaan signer dan tim pemeriksa": "signer-dan-tim-pemeriksa",
  "Jika pengajuan Unit": "pengajuan-unit",
  "Masalah umum saat approval": "kendala-approval",
  "Alur rekomendasi aset": "alur-rekomendasi-aset",
  "Mengisi dokumen rekomendasi": "mengisi-dokumen-rekomendasi",
  "Status dan lock rekomendasi": "status-lock-rekomendasi",
  "Masalah umum rekomendasi": "kendala-rekomendasi",
  "Membaca nomor surat": "membaca-nomor-surat",
  "Nomor surat, counter, dan draft": "nomor-surat-counter-draft",
  "Variasi format nomor": "variasi-format-nomor",
  "Scope dan reset nomor": "scope-reset-nomor",
  "Siklus draft dan nomor": "siklus-draft-nomor",
};

export const getDocsEntrySlug = (entry: DocsEntry) =>
  DOCS_ENTRY_SLUGS[entry.id] ?? slugifyDocsSegment(entry.title || entry.id);

export const getDocsSectionSlug = (section: DocsSection) =>
  DOCS_SECTION_SLUGS[section.title] ?? slugifyDocsSegment(section.title);

export const getDocsEntryPath = (entry: DocsEntry, sectionSlug = DOCS_OVERVIEW_SLUG) =>
  `/docs/${getDocsEntrySlug(entry)}/${sectionSlug}`;

export const getDocsVersionPath = () => "/docs/versi/changelog";

const DETAIL_SECTIONS_BY_ID: Record<string, DocsSection[]> = {
  agenda: [
    {
      type: "table",
      title: "Data agenda",
      columns: ["Data", "Arti", "Catatan"],
      rows: [
        ["Judul", "Nama aktivitas yang tampil di daftar dan kalender.", "Gunakan judul spesifik agar mudah dicari."],
        ["Waktu mulai dan selesai", "Rentang waktu pekerjaan.", "Dipakai untuk urutan kalender dan deteksi agenda berjalan."],
        ["Status", "Kondisi agenda saat ini.", "Biasanya Scheduled, Ongoing, Completed, atau Overdue."],
        ["Peserta atau pemilik", "User yang terlibat atau bertanggung jawab.", "Akses mengikuti hirarki dan hak tim."],
        ["Catatan", "Konteks tambahan aktivitas.", "Tulis hasil follow up agar riwayat tetap terbaca."],
      ],
    },
    {
      type: "table",
      title: "Membaca status agenda",
      columns: ["Status", "Artinya", "Tindakan"],
      rows: [
        ["Scheduled", "Agenda sudah dibuat tetapi waktunya belum berjalan.", "Pastikan waktu dan peserta benar."],
        ["Ongoing", "Agenda berada pada rentang waktu berjalan.", "Update catatan jika ada perkembangan."],
        ["Completed", "Agenda selesai.", "Tidak perlu diubah kecuali ada koreksi data."],
        ["Overdue", "Agenda melewati waktu selesai dan belum diselesaikan.", "Selesaikan atau ubah jadwal bila memang tertunda."],
      ],
    },
  ],
  calendar: [
    {
      type: "table",
      title: "Mode baca kalender",
      columns: ["Bagian", "Fungsi", "Kapan dipakai"],
      rows: [
        ["Hari", "Melihat agenda detail dalam satu tanggal.", "Saat mengecek jadwal hari ini."],
        ["Minggu", "Melihat kepadatan agenda Senin sampai Minggu.", "Saat mengatur jadwal meeting atau follow up."],
        ["Bulan", "Melihat sebaran agenda dalam satu bulan.", "Saat mencari hari yang masih longgar."],
        ["Detail agenda", "Membuka informasi agenda yang dipilih.", "Saat ingin membaca catatan, peserta, atau waktu lengkap."],
      ],
    },
    {
      type: "troubleshooting",
      title: "Kendala kalender",
      items: [
        {
          problem: "Agenda tidak muncul di tanggal yang diharapkan",
          solution: "Cek waktu mulai, waktu selesai, timezone browser, dan filter user atau tim yang aktif.",
        },
        {
          problem: "Detail agenda gagal dibuka",
          solution: "Refresh data. Jika masih gagal, agenda mungkin dihapus atau aksesnya berubah.",
        },
      ],
    },
  ],
  "surat-registration": [
    {
      type: "table",
      title: "Membaca nomor surat",
      description: "Contoh: 005/UAI/PBO.1.TRA/VI/2026.",
      columns: ["Segmen", "Contoh", "Arti", "Sumber data"],
      rows: [
        ["Nomor urut", "005", "Urutan surat pada scope penomoran aktif.", "Dari reservation/counter tahun berjalan."],
        ["Entitas", "UAI", "Kode perusahaan atau badan hukum penerbit surat.", "Master Entitas yang dipilih saat registrasi."],
        ["Kode departemen", "PBO", "Kode departemen pengaju atau departemen pembuat dokumen.", "Master Departemen pada profil/pilihan registrasi."],
        ["Index jenis surat", "1", "Urutan jenis surat untuk departemen tersebut.", "Mapping Master Jenis Surat per departemen."],
        ["Kode proyek", "TRA", "Kode proyek yang terkait dengan surat.", "Master Proyek atau proyek unit yang dipilih."],
        ["Kode proyek virtual", "000", "Dipakai untuk KC/KCP yang belum memiliki proyek terdaftar pada pengajuan non-unit.", "Dibuat sistem saat kantor cabang tidak punya proyek; bukan master proyek baru."],
        ["Bulan", "VI", "Bulan penerbitan dalam angka Romawi.", "Bulan saat nomor diterbitkan; VI berarti Juni."],
        ["Tahun", "2026", "Tahun penerbitan sekaligus tahun counter.", "Tahun saat nomor diterbitkan."],
      ],
    },
    {
      type: "table",
      title: "Variasi format nomor",
      description:
        "Format nomor mengikuti scope surat. Contoh di bawah menjelaskan pola yang paling sering ditemui user.",
      columns: ["Konteks", "Pola", "Contoh", "Catatan"],
      rows: [
        [
          "Pusat tanpa proyek",
          "Nomor/Entitas/Departemen.IndexJenis/Bulan/Tahun",
          "001/UAI/PGD.1/VI/2026",
          "Dipakai untuk pengajuan pusat yang tidak membawa kode proyek.",
        ],
        [
          "Pusat dengan proyek atau Unit",
          "Nomor/Entitas/Departemen.IndexJenis.KodeProyek/Bulan/Tahun",
          "005/UAI/PBO.1.TRA/VI/2026",
          "Kode proyek muncul setelah index jenis surat.",
        ],
        [
          "KC",
          "Nomor/Entitas/KodeKantor-KodeProyek.IndexDepartemen.IndexJenis/Bulan/Tahun",
          "001/UAI/KCMLG-MLO.1.1/VI/2026",
          "Counter dipisah berdasarkan proyek.",
        ],
        [
          "KC tanpa proyek",
          "Nomor/Entitas/KodeKantor-000.IndexDepartemen.IndexJenis/Bulan/Tahun",
          "001/UAI/KCMLG-000.1.1/VII/2026",
          "Hanya untuk pengajuan non-unit. Proyek tidak dibuat sebagai data master palsu.",
        ],
        [
          "KCP",
          "Nomor/Entitas/KodeKCInduk.KodeKCP-KodeProyek.IndexDepartemen.IndexJenis/Bulan/Tahun",
          "001/UAI/KCSLO.KCPWNG-WNG.1.1/VI/2026",
          "Kode KC induk menjaga relasi KCP tetap terbaca.",
        ],
        [
          "KCP tanpa proyek",
          "Nomor/Entitas/KodeKCInduk.KodeKCP-000.IndexDepartemen.IndexJenis/Bulan/Tahun",
          "001/UAI/KCSLO.KCPWNG-000.1.1/VII/2026",
          "Unit tetap wajib memilih proyek karena butuh data kavling.",
        ],
      ],
    },
    {
      type: "table",
      title: "Scope dan reset nomor",
      columns: ["Kondisi", "Counter dipisah berdasarkan", "Reset"],
      rows: [
        ["Kantor Pusat", "Entitas + Departemen + Tahun.", "Reset ketika tahun berubah, kecuali counter awal tahun itu dikonfigurasi admin."],
        ["Cabang/KC/KCP dengan proyek", "Entitas + Proyek + Tahun.", "Reset ketika tahun berubah untuk proyek tersebut."],
        ["Cabang/KC/KCP tanpa proyek", "Entitas + Kantor + Departemen + Jenis + Tahun dengan kode virtual 000.", "Reset tahunan tanpa membuat master proyek 000."],
        ["Nomor awal produksi", "Nilai start_from pada Konfigurasi Penomoran.", "Dipakai saat sistem mulai dari nomor lanjutan agar tidak bentrok dengan nomor manual lama."],
        ["Nomor VOID", "Tidak dipakai ulang.", "Dibiarkan sebagai jejak nomor yang batal."],
        ["Nomor CANCELLED legacy", "Dapat dipakai ulang oleh generator jika status masih CANCELLED dan >= start_from.", "Status baru memakai VOID agar tidak membingungkan produksi."],
      ],
    },
    {
      type: "table",
      title: "Siklus draft dan nomor",
      columns: ["Status", "Arti", "Dampak ke nomor"],
      rows: [
        ["DRAFT", "Nomor sudah dipesan dan form disimpan otomatis.", "Nomor tetap menempel ke draft dan tidak diberikan ke user lain."],
        ["SUBMITTED", "Draft sudah dikirim menjadi surat berjalan.", "Nomor dipakai sebagai nomor resmi dokumen."],
        ["VOID", "Draft dibatalkan.", "Nomor tidak dipakai ulang agar audit tetap aman."],
        ["EXPIRED", "Draft melewati masa aktif.", "Perlu dibuat ulang sesuai aturan yang aktif."],
        ["Masa aktif", "Draft aktif selama 7 hari dari penyimpanan terakhir.", "User diarahkan melanjutkan draft jika kembali ke registrasi."],
      ],
    },
  ],
  "approval-inbox": [
    {
      type: "table",
      title: "Kenapa tombol aksi terkunci",
      columns: ["Penyebab", "Contoh", "Yang perlu dilakukan"],
      rows: [
        ["Tim pemeriksa belum memeriksa", "Step 3 sudah terlihat signer, tetapi tim pemeriksa step itu belum selesai.", "Tunggu tim pemeriksa atau kembalikan dengan catatan jika perlu revisi."],
        ["Lampiran wajib belum lengkap", "Siteplan, volume adendum, atau lampiran approval belum tersedia.", "Lengkapi lampiran atau minta tim pemeriksa mengganti lampiran lama."],
        ["Data unit belum lengkap", "Unit dipilih tetapi struktur/kode produksi belum diisi.", "Lengkapi detail kavling sebelum pemeriksaan atau approval."],
        ["Jumlah unit perlu konfirmasi", "Alokasi unit kurang dari permintaan.", "Konfirmasi eksplisit bahwa sebagian unit memang belum bisa dialokasikan."],
        ["File masih upload", "File sudah dipilih tetapi proses upload belum selesai.", "Tunggu indikator upload selesai sebelum menekan Setujui."],
      ],
    },
    {
      type: "table",
      title: "Data yang wajib dibaca sebelum aksi",
      columns: ["Bagian", "Isi", "Risiko jika dilewati"],
      rows: [
        ["Ringkasan", "Pengaju, departemen, kantor, proyek, kategori, dan permohonan.", "Salah menyetujui dokumen yang bukan konteks Anda."],
        ["Progres", "Step sebelumnya, signer, waktu, dan catatan.", "Tidak mengetahui alasan revisi atau status pemeriksaan."],
        ["Dokumen", "PDF utama dan snapshot.", "Tampilan template atau tanda tangan bisa luput dicek."],
        ["Lampiran", "File pendukung pemohon/tim pemeriksa/approval.", "Approval berjalan tanpa bukti pendukung yang diminta."],
        ["Catatan", "Alasan pemohon, tim pemeriksa, atau penolakan.", "Keputusan tidak punya konteks cukup."],
      ],
    },
  ],
  monitoring: [
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
  ],
  "documents-attachments": [
    {
      type: "table",
      title: "Jenis file surat",
      columns: ["Jenis", "Isi", "Cara akses"],
      rows: [
        ["PDF dokumen", "Dokumen utama hasil template sistem.", "Dibuka melalui endpoint aman aplikasi."],
        ["Snapshot", "Salinan visual dokumen pada momen tertentu.", "Dibuka dari timeline/progress dokumen."],
        ["Lampiran pemohon", "File yang diunggah saat registrasi.", "Dibuka dari panel lampiran."],
        ["Lampiran tim pemeriksa/approval", "File pemeriksaan atau pendukung dari tahap approval.", "Dibuka dari detail persetujuan atau monitoring."],
        ["Lampiran otomatis Unit", "Kode produksi dan rekap adendum hasil input sistem.", "Dibuat otomatis dari data alokasi unit."],
      ],
    },
    {
      type: "table",
      title: "Keamanan akses file",
      columns: ["Aturan", "Penjelasan"],
      rows: [
        ["Bukan public storage URL", "User tidak diarahkan langsung ke URL storage publik."],
        ["Token per request", "URL file dapat berubah setiap klik karena akses dibuat sementara."],
        ["PDF tidak selalu dibuat ulang", "Token yang berubah bukan berarti file digenerate ulang."],
        ["Hak akses dicek server", "File hanya dibuka jika user berhak atas surat/lampiran tersebut."],
      ],
    },
  ],
  history: [
    {
      type: "table",
      title: "Filter riwayat",
      columns: ["Filter", "Default", "Fungsi"],
      rows: [
        ["Tanggal", "Bulan berjalan, tanggal 1 sampai hari ini.", "Membatasi riwayat agar daftar tidak terlalu panjang."],
        ["Tindakan", "Semua.", "Memisahkan riwayat Setuju dan Tolak."],
        ["Pencarian", "Kosong.", "Mencari berdasarkan judul atau nomor surat."],
        ["Detail", "Dibuka per item.", "Menampilkan ringkasan, timeline, dokumen, dan lampiran."],
      ],
    },
    {
      type: "table",
      title: "Data yang muncul",
      columns: ["Data", "Arti"],
      rows: [
        ["Nomor surat", "Nomor resmi atau nomor draft yang pernah melibatkan user."],
        ["Judul", "Nama permohonan/dokumen."],
        ["Peran", "User sebagai pembuat, tim pemeriksa, signer, atau pihak yang pernah memproses."],
        ["Waktu aksi", "Tanggal ketika user terlibat atau dokumen berubah status."],
      ],
    },
  ],
  settings: [
    {
      type: "table",
      title: "Data profil yang berdampak ke sistem",
      columns: ["Data", "Dipakai untuk", "Siapa yang mengubah"],
      rows: [
        ["Nama", "Tampilan profil, dokumen, email, audit, dan tanda tangan.", "User/admin sesuai izin."],
        ["Jabatan", "Label tanda tangan dan informasi email.", "Admin jika mengikuti data HRD."],
        ["Departemen", "Hak akses, kandidat signer, SLA, dan nomor surat pusat.", "Admin."],
        ["Kantor", "Hak akses cabang, kandidat BM/SPV, dan nomor surat cabang.", "Admin."],
        ["Tema", "Light/dark/system mode.", "User sendiri."],
      ],
    },
  ],
  "admin-users": [
    {
      type: "table",
      title: "Aturan import user",
      columns: ["Kondisi", "Perilaku sistem"],
      rows: [
        ["NIK sudah ada", "Data user diperbarui, bukan membuat akun baru."],
        ["NIK kosong", "Baris ditolak agar tidak membuat NIK PENDING."],
        ["User tidak ada di file import aktif", "Akun dianggap tidak aktif."],
        ["Role kosong di file", "Role lama dipertahankan."],
        ["Departemen/kantor berupa alias", "Sistem mencoba mapping ke master yang tersedia."],
      ],
    },
    {
      type: "table",
      title: "Dampak perubahan profil",
      columns: ["Data berubah", "Dampak"],
      rows: [
        ["Departemen", "Mengubah izin membuat surat, kandidat workflow, SLA, dan filter data."],
        ["Kantor", "Mengubah kandidat cabang dan akses data cabang."],
        ["Jabatan", "Mengubah label tanda tangan dan hirarki."],
        ["Status aktif", "User nonaktif tidak bisa memakai sistem."],
      ],
    },
  ],
  "admin-hierarchy": [
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
  ],
  "admin-departments": [
    {
      type: "table",
      title: "Data departemen",
      columns: ["Field", "Fungsi"],
      rows: [
        ["Nama", "Nama resmi departemen yang tampil di profil, surat, dan filter."],
        ["Kode", "Kode untuk penomoran surat dan identitas departemen pusat."],
        ["Alias", "Mapping nama dari data HRD agar import tetap masuk ke departemen yang benar."],
        ["Email departemen", "Penerima notifikasi jika ada dokumen perlu ditindaklanjuti."],
        ["Status/urutan", "Menjaga tampilan dan pilihan konfigurasi tetap rapi."],
      ],
    },
  ],
  "admin-entities": [
    {
      type: "table",
      title: "Data entitas",
      columns: ["Field", "Fungsi"],
      rows: [
        ["Nama entitas", "Nama perusahaan/badan hukum penerbit surat."],
        ["Kode entitas", "Segmen kedua nomor surat, misalnya UAI."],
        ["Status aktif", "Menentukan apakah entitas bisa dipilih saat registrasi."],
      ],
    },
  ],
  "admin-letter-types": [
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
  ],
  "admin-offices": [
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
  ],
  "admin-projects": [
    {
      type: "table",
      title: "Data proyek",
      columns: ["Field", "Fungsi"],
      rows: [
        ["Nama proyek", "Tampilan pilihan proyek saat registrasi atau approval unit."],
        ["Kode proyek", "Segmen nomor surat dan kode proyek pada integrasi."],
        ["Cabang", "Menghubungkan proyek ke kantor/cabang terkait."],
        ["Status", "Menentukan apakah proyek muncul sebagai pilihan aktif."],
      ],
    },
  ],
  "admin-forms": [
    {
      type: "table",
      title: "Bagian konfigurasi template",
      columns: ["Bagian", "Fungsi"],
      rows: [
        ["File Excel", "Template sumber yang diisi sistem."],
        ["Field input", "Daftar input user yang akan masuk ke dokumen."],
        ["Mapping cell", "Letak data pada sheet Excel."],
        ["Tabel barang", "Konfigurasi baris/kolom detail barang atau kebutuhan."],
        ["Tempat tanggal", "Cell untuk teks seperti Magelang, 21 Mei 2026."],
        ["Tanda tangan", "Area kotak tanda tangan dinamis."],
      ],
    },
  ],
  "admin-template-builder": [
    {
      type: "table",
      title: "Bagian Template Builder",
      columns: ["Bagian", "Fungsi"],
      rows: [
        ["Canvas", "Area A4/F4 untuk menyusun tampilan dokumen."],
        ["Panel elemen", "Tempat menambahkan logo, teks, field data, tabel berulang, catatan, dan tanda tangan."],
        ["Panel properti", "Mengatur posisi, ukuran, font, warna, border, binding, dan kolom tabel."],
        ["Schema input", "Menentukan field yang akan diisi user ketika template dipakai pada registrasi."],
        ["Versioning", "Menyimpan perubahan sebagai draft atau publish agar dokumen lama tetap stabil."],
      ],
    },
    {
      type: "table",
      title: "Data berulang",
      description: "Gunakan Tabel Berulang untuk data yang jumlahnya bisa berubah.",
      columns: ["Sumber data", "Contoh isi", "Kapan dipakai"],
      rows: [
        ["Daftar Barang", "Kode, nama barang, satuan, jumlah, status, keterangan", "Permohonan barang dan jasa."],
        ["Daftar Unit", "Proyek, kavling, kode produksi", "Permohonan unit atau order bangun."],
        ["Daftar Rekomendasi", "Nama alat, lokasi/PIC, tindakan, link", "Rekomendasi aset."],
        ["Daftar Lampiran", "Nama file, tipe, ukuran", "Ringkasan lampiran dalam dokumen."],
        ["Penandatangan", "Label, nama, jabatan", "Area tanda tangan dinamis."],
      ],
    },
  ],
  "admin-workflows": [
    {
      type: "callout",
      title: "Matrix lama bersifat referensi",
      description:
        "Halaman Alur Persetujuan dipakai untuk membaca atau migrasi matrix lama. Alur aktif registrasi dikendalikan oleh Kegunaan Form.",
      tone: "warning",
    },
    {
      type: "table",
      title: "Yang dicek pada matrix lama",
      columns: ["Data", "Fungsi"],
      rows: [
        ["Urutan step", "Mengetahui siapa membuat, memeriksa, dan menyetujui."],
        ["Jumlah kotak tanda tangan", "Referensi saat menyiapkan signature layout dinamis."],
        ["Role/label", "Konteks jabatan atau fungsi tiap tahap."],
      ],
    },
  ],
  "admin-form-usages": [
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
        ["BM cabang / dept pusat", "Cabang memakai BM kantor pemohon; pusat memakai pimpinan departemen pemohon."],
        ["Lintas kantor", "Kandidat dapat berasal dari kantor mana pun jika proses memang tidak terikat lokasi pemohon."],
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
  ],
  "admin-numbering": [
    {
      type: "table",
      title: "Konfigurasi counter",
      columns: ["Field", "Arti"],
      rows: [
        ["Scope", "Pusat atau cabang."],
        ["Entitas", "Perusahaan/badan hukum yang memakai counter."],
        ["Departemen", "Wajib untuk scope pusat."],
        ["Proyek", "Wajib untuk scope cabang."],
        ["Tahun", "Tahun counter berlaku."],
        ["Start from", "Nomor awal yang akan dipakai generator."],
        ["Aktif", "Hanya satu konfigurasi aktif per scope unik."],
      ],
    },
    {
      type: "table",
      title: "Contoh penggunaan counter",
      columns: ["Kasus", "Pengaturan"],
      rows: [
        ["Nomor manual terakhir 124 untuk departemen PBO tahun 2026", "Buat scope pusat, departemen PBO, tahun 2026, start_from 125."],
        ["Nomor proyek TRA sudah berjalan sampai 004", "Buat scope cabang, proyek TRA, tahun 2026, start_from 5."],
        ["Tahun baru", "Buat/cek konfigurasi tahun baru jika tidak ingin mulai dari 001."],
      ],
    },
  ],
  "admin-job-title-labels": [
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
  ],
  "admin-sla": [
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
      description: "Jika signer mengembalikan pengajuan ke pemohon, waktu SLA signer berhenti. Ketika pemohon memilih Lanjutkan proses, approval dimulai ulang dari tahap 1 dan SLA dihitung dari waktu proses dilanjutkan.",
      tone: "info",
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
  ],
  "admin-monitoring": [
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
  ],
  "admin-audit": [
    {
      type: "table",
      title: "Isi audit log",
      columns: ["Data", "Arti"],
      rows: [
        ["Aktor", "User/admin/system yang memicu perubahan."],
        ["Objek", "Data yang berubah, misalnya user, surat, konfigurasi, atau master data."],
        ["Sebelum", "Nilai lama, kecuali data rahasia seperti password."],
        ["Sesudah", "Nilai baru yang tersimpan."],
        ["Waktu", "Tanggal dan jam perubahan."],
      ],
    },
  ],
  "admin-email": [
    {
      type: "table",
      title: "Konfigurasi email",
      columns: ["Bagian", "Fungsi"],
      rows: [
        ["SMTP host/port", "Server email perusahaan."],
        ["Username/password", "Akun email pengirim, misalnya noreply."],
        ["Base URL SIGAP", "Domain tombol buka sistem pada email."],
        ["Email departemen", "Penerima notifikasi departemen."],
        ["Mode file", "Menentukan file dikirim sebagai link aman atau attachment."],
      ],
    },
    {
      type: "table",
      title: "Isi email persetujuan",
      columns: ["Bagian", "Isi"],
      rows: [
        ["Identitas surat", "Nomor, judul, status, dan kategori."],
        ["Pengaju", "Nama, jabatan, departemen, kantor, dan proyek bila ada."],
        ["Detail input", "Barang/unit/catatan dalam bentuk tabel, bukan JSON mentah."],
        ["Penandatangan", "Signer dan status proses."],
        ["File", "PDF dan lampiran sesuai mode konfigurasi."],
      ],
    },
  ],
  "login-access": [
    {
      type: "table",
      title: "Penyebab akses ditolak",
      columns: ["Penyebab", "Yang dicek admin"],
      rows: [
        ["Akun nonaktif", "Status user pada User Organization."],
        ["Role salah", "Role admin/user pada profil."],
        ["Departemen/kantor kosong", "Mapping HRD, kantor, dan departemen."],
        ["Session lama", "Minta user logout lalu login ulang."],
      ],
    },
  ],
  "document-file": [
    {
      type: "table",
      title: "Checklist file gagal dibuka",
      columns: ["Gejala", "Pemeriksaan"],
      rows: [
        ["Dokumen tidak ditemukan", "Pastikan file sudah dibuat worker PDF dan path tersimpan."],
        ["Lampiran gagal dibuka", "Cek bucket storage self-hosted dan token akses."],
        ["PDF lama tampil", "Tutup preview dan buka ulang agar token/cache baru dipakai."],
        ["Loading lama", "Cek antrian worker PDF dan log server."],
      ],
    },
  ],
  notification: [
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
  ],
};

const collectDocsSectionTitles = (sections: DocsSection[]) => {
  const titles = new Set<string>();
  const visit = (section: DocsSection) => {
    titles.add(section.title);
    if (section.type === "group") section.sections.forEach(visit);
  };
  sections.forEach(visit);
  return titles;
};

const getDocsEntrySupportSections = (entry: DocsEntry): DocsSection[] => {
  const sections: DocsSection[] = [];

  if (entry.steps.length) {
    sections.push({
      type: "steps",
      title: `Menggunakan ${entry.title}`,
      items: entry.steps,
    });
  }

  if (entry.examples.length || entry.troubleshooting.length) {
    sections.push({
      type: "group",
      title: `Contoh dan pemeriksaan ${entry.title}`,
      description:
        "Gunakan bagian ini saat ingin mencocokkan kasus nyata atau mencari penyebab ketika hasilnya tidak sesuai.",
      sections: [
        ...(entry.examples.length
          ? [
              {
                type: "list" as const,
                title: "Contoh penggunaan",
                items: entry.examples,
              },
            ]
          : []),
        ...(entry.troubleshooting.length
          ? [
              {
                type: "list" as const,
                title: "Jika bermasalah",
                items: entry.troubleshooting,
              },
            ]
          : []),
      ],
    });
  }

  return sections;
};

export const getDocsEntrySections = (entry: DocsEntry): DocsSection[] => {
  const detailSections = DETAIL_SECTIONS_BY_ID[entry.id] ?? [];

  if (entry.sections?.length) {
    const existingTitles = collectDocsSectionTitles(entry.sections);

    return [
      ...entry.sections,
      ...detailSections.filter((section) => !existingTitles.has(section.title)),
    ];
  }

  if (detailSections.length) {
    return [...detailSections, ...getDocsEntrySupportSections(entry)];
  }

  const sections: DocsSection[] = [];

  if (entry.whenToUse.length) {
    sections.push({
      type: "list",
      title: "Fungsi utama",
      items: entry.whenToUse,
    });
  }

  if (entry.steps.length) {
    sections.push({
      type: "steps",
      title: "Alur penggunaan",
      items: entry.steps,
    });
  }

  if (entry.examples.length) {
    sections.push({
      type: "list",
      title: "Contoh penggunaan",
      items: entry.examples,
    });
  }

  if (entry.troubleshooting.length) {
    sections.push({
      type: "list",
      title: "Kendala umum",
      items: entry.troubleshooting,
    });
  }

  return sections;
};

export const USER_DOCS: DocsEntry[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    menu: "Dashboard",
    audience: "user",
    icon: BarChart3,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Pusat ringkasan pekerjaan, agenda, surat, dan antrean yang perlu dipantau.",
    whenToUse: [
      "Melihat pekerjaan yang perlu segera ditindaklanjuti.",
      "Memeriksa status umum aktivitas agenda dan dokumen.",
      "Masuk cepat ke menu yang paling sering digunakan.",
    ],
    steps: [
      "Buka menu Dashboard setelah login.",
      "Baca kartu ringkasan sesuai area kerja Anda.",
      "Klik pintasan atau item yang perlu ditindaklanjuti.",
    ],
    examples: [
      "Jika ada persetujuan baru, buka Persetujuan dari kartu antrean.",
      "Jika ingin mengecek dokumen yang Anda buat, lanjutkan ke Status Pengajuan.",
    ],
    troubleshooting: [
      "Jika data terlihat kosong, refresh halaman dan pastikan akun Anda masih aktif.",
      "Jika data tidak sesuai hak akses, hubungi admin untuk mengecek departemen, kantor, dan role akun.",
    ],
    sections: [
      {
        type: "callout",
        title: "Data yang ditampilkan",
        description:
          "Dashboard memakai data akun yang sedang login. Atasan yang memiliki bawahan dapat memperluas tampilan ke kantor atau anggota tim yang berada dalam hirarkinya.",
        tone: "info",
      },
      {
        type: "feature-grid",
        title: "Bagian pada Dashboard",
        items: [
          {
            title: "Pengajuan Surat",
            description:
              "Ringkasan jumlah surat yang Anda buat pada periode terpilih: total, selesai, diproses, dan ditolak.",
          },
          {
            title: "Ringkasan Agenda",
            description:
              "Kartu Total Agenda, Selesai, Berjalan, Terjadwal, dan Terlambat untuk periode agenda yang dipilih.",
          },
          {
            title: "Distribusi Status",
            description:
              "Diagram komposisi agenda Completed, Ongoing, Scheduled, dan Overdue. Arahkan pointer untuk melihat jumlahnya.",
          },
          {
            title: "Aktivitas Departemen",
            description:
              "Perbandingan agregat total agenda dan agenda selesai untuk seluruh departemen. Grafik hanya menampilkan jumlah tanpa membuka judul atau isi agenda departemen lain.",
          },
          {
            title: "Aktivitas Terbaru",
            description:
              "Daftar aktivitas operasional berupa pembuatan agenda, pembuatan surat, dan approval surat.",
          },
          {
            title: "Filter Hirarki",
            description:
              "Khusus atasan: memilih area kantor, seluruh anggota tim, diri sendiri, atau satu anggota tertentu.",
          },
        ],
      },
      {
        type: "table",
        title: "Kontrol periode",
        description:
          "Periode Pengajuan Surat dan Agenda diatur secara terpisah. Mengubah periode surat tidak mengubah grafik agenda.",
        columns: ["Kontrol", "Fungsi"],
        rows: [
          ["Bulan", "Menampilkan data dari awal sampai akhir bulan yang dipilih."],
          ["Minggu", "Menampilkan data Senin sampai Minggu pada minggu yang dipilih."],
          ["Panah kiri", "Mundur satu bulan atau satu minggu."],
          ["Panah kanan", "Maju satu periode. Tombol nonaktif jika sudah berada pada periode berjalan."],
          ["Hari Ini", "Kembali ke bulan atau minggu berjalan."],
        ],
      },
      {
        type: "table",
        title: "Membaca ringkasan Pengajuan Surat",
        columns: ["Kartu", "Arti", "Saat diklik"],
        rows: [
          ["Total Pengajuan", "Semua surat yang Anda buat pada periode terpilih.", "Membuka seluruh Status Pengajuan."],
          ["Selesai", "Seluruh tanda tangan selesai dan surat berstatus selesai.", "Membuka Status Pengajuan dengan filter Selesai."],
          ["Diproses", "Surat masih menunggu pemeriksaan atau tanda tangan.", "Membuka Status Pengajuan dengan filter Proses."],
          ["Ditolak", "Salah satu tahap menolak surat sehingga alur berhenti.", "Membuka Status Pengajuan dengan filter Ditolak."],
        ],
      },
      {
        type: "table",
        title: "Membaca KPI Agenda",
        columns: ["Kartu", "Perhitungan"],
        rows: [
          ["Total Agenda", "Jumlah seluruh agenda dalam periode. Persentase membandingkan total dengan periode sebelumnya."],
          ["Selesai", "Agenda berstatus Completed. Ditampilkan juga sebagai progres dari total agenda."],
          ["Berjalan", "Agenda berstatus Ongoing."],
          ["Terjadwal", "Agenda berstatus Scheduled."],
          ["Terlambat", "Agenda berstatus Overdue atau melewati waktu selesai dan belum diselesaikan."],
        ],
      },
      {
        type: "steps",
        title: "Menelusuri pekerjaan dari Dashboard",
        items: [
          "Pilih periode Bulan atau Minggu pada bagian yang ingin dianalisis.",
          "Jika Anda atasan, tentukan kantor atau anggota tim sebelum membaca angkanya.",
          "Klik kartu Pengajuan Surat untuk membuka daftar dokumen dengan filter yang sesuai.",
          "Klik aktivitas terbaru untuk membaca detail aktivitas tanpa membuka Audit Log.",
        ],
      },
      {
        type: "troubleshooting",
        title: "Kendala pada Dashboard",
        items: [
          {
            problem: "Angka atau grafik kosong",
            solution:
              "Periksa periode, filter anggota, dan area kantor. Data kosong berarti tidak ada data pada kombinasi filter tersebut.",
          },
          {
            problem: "Filter kantor atau anggota tidak tersedia",
            solution:
              "Filter hanya muncul pada akun yang terdeteksi memiliki bawahan dalam hirarki organisasi.",
          },
          {
            problem: "Aktivitas terbaru tidak menampilkan perubahan profil atau konfigurasi",
            solution:
              "Dashboard hanya menampilkan aktivitas kerja operasional. Perubahan administratif tersedia di Audit Log untuk admin.",
          },
        ],
      },
    ],
  },
  {
    id: "agenda",
    title: "Agenda",
    menu: "Agenda",
    audience: "user",
    icon: ClipboardList,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mencatat dan mengelola agenda kerja pribadi atau tim sesuai hak akses.",
    whenToUse: [
      "Membuat jadwal kerja, rapat, atau aktivitas follow up.",
      "Melihat daftar agenda yang sedang berjalan.",
      "Mengubah agenda yang perlu diperbarui.",
    ],
    steps: [
      "Buka menu Agenda.",
      "Gunakan tombol tambah untuk membuat agenda.",
      "Isi judul, tanggal, peserta, dan catatan yang diperlukan.",
      "Simpan, lalu cek kembali di daftar agenda atau Kalender.",
    ],
    examples: [
      "Buat agenda follow up dokumen yang perlu dipantau minggu ini.",
      "Tambahkan agenda rapat internal dan tulis poin pembahasan agar mudah ditelusuri.",
    ],
    troubleshooting: [
      "Jika agenda tidak muncul di kalender, cek tanggal agenda dan refresh data.",
      "Jika tidak bisa mengubah agenda, pastikan agenda tersebut memang milik Anda atau Anda punya akses tim.",
    ],
  },
  {
    id: "calendar",
    title: "Kalender",
    menu: "Kalender",
    audience: "user",
    icon: CalendarDays,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Tampilan kalender untuk membaca agenda berdasarkan tanggal.",
    whenToUse: [
      "Melihat jadwal per hari, minggu, atau bulan.",
      "Mengecek benturan jadwal sebelum membuat agenda baru.",
      "Memantau agenda tim dalam satu tampilan waktu.",
    ],
    steps: [
      "Buka menu Kalender.",
      "Pilih rentang waktu yang ingin dilihat.",
      "Klik agenda untuk melihat detailnya.",
    ],
    examples: [
      "Sebelum menjadwalkan meeting, cek kalender minggu berjalan.",
      "Gunakan kalender untuk melihat agenda follow up dokumen yang jatuh tempo.",
    ],
    troubleshooting: [
      "Jika kalender terlihat kosong, cek filter tanggal dan data agenda.",
      "Jika detail tidak terbuka, coba refresh halaman lalu buka ulang agenda.",
    ],
  },
  {
    id: "surat-registration",
    title: "Registrasi Surat",
    menu: "Layanan Surat > Buat Baru",
    audience: "user",
    icon: FileSignature,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Membuat pengajuan dokumen dengan nomor surat, template, lampiran, dan alur persetujuan.",
    whenToUse: [
      "Membuat permohonan barang, jasa, aset, non aset, unit, atau non unit.",
      "Mengajukan dokumen yang membutuhkan tanda tangan berjenjang.",
      "Melanjutkan draft pengajuan yang nomornya sudah dipesan.",
    ],
    steps: [
      "Buka Buat Baru.",
      "Pilih kategori pengajuan yang sesuai.",
      "Pilih form atau kegunaan dokumen.",
      "Isi tempat, tanggal, detail permohonan, catatan, dan lampiran jika diminta.",
      "Pilih penandatangan sesuai kandidat yang tersedia.",
      "Kirim pengajuan setelah semua validasi lengkap.",
    ],
    examples: [
      "Untuk pengajuan aset kantor, pilih kategori Aset lalu isi daftar barang dan jumlah.",
      "Untuk order bangun unit, pilih kategori Unit, proyek, jumlah unit, dan catatan jika ada.",
      "Jika nomor sudah dipesan lalu halaman tertutup, buka kembali registrasi untuk melanjutkan draft.",
    ],
    troubleshooting: [
      "Jika pilihan Unit tidak muncul, akun atau departemen Anda mungkin belum diizinkan membuat pengajuan Unit.",
      "Jika penandatangan kosong, cek pilihan kantor, departemen, dan kegunaan form.",
      "Jika lampiran wajib belum lengkap, tombol kirim akan terkunci sampai file diunggah.",
    ],
    related: ["Status Pengajuan", "Persetujuan", "Dokumen dan Lampiran"],
    sections: [
      {
        type: "group",
        title: "Nomor surat, counter, dan draft",
        description:
          "Baca bagian ini untuk memahami arti nomor surat, perbedaan format pusat/cabang, kapan counter reset, dan kenapa draft tetap menyimpan nomor.",
        sections: [
          {
            type: "callout",
            title: "Nomor tidak dilepas begitu saja",
            description:
              "Saat nomor sudah dipesan, sistem menyimpan draft agar pengajuan bisa dilanjutkan jika halaman tertutup. Nomor yang sudah menjadi VOID tidak dipakai ulang supaya audit tetap jelas.",
            tone: "info",
          },
          {
            type: "table",
            title: "Membaca nomor surat",
            description: "Contoh: 005/UAI/PBO.1.TRA/VI/2026.",
            columns: ["Segmen", "Contoh", "Arti", "Sumber data"],
            rows: [
              ["Nomor urut", "005", "Urutan surat pada scope penomoran aktif.", "Dari reservation/counter tahun berjalan."],
              ["Entitas", "UAI", "Kode perusahaan atau badan hukum penerbit surat.", "Master Entitas yang dipilih saat registrasi."],
              ["Kode departemen", "PBO", "Kode departemen pengaju atau departemen pembuat dokumen.", "Master Departemen pada profil/pilihan registrasi."],
              ["Index jenis surat", "1", "Urutan jenis surat untuk departemen tersebut.", "Mapping Master Jenis Surat per departemen."],
              ["Kode proyek", "TRA", "Kode proyek yang terkait dengan surat.", "Master Proyek atau proyek unit yang dipilih."],
              ["Kode proyek virtual", "000", "Dipakai untuk KC/KCP yang belum memiliki proyek terdaftar pada pengajuan non-unit.", "Dibuat sistem saat kantor cabang tidak punya proyek; bukan master proyek baru."],
              ["Bulan", "VI", "Bulan penerbitan dalam angka Romawi.", "Bulan saat nomor diterbitkan; VI berarti Juni."],
              ["Tahun", "2026", "Tahun penerbitan sekaligus tahun counter.", "Tahun saat nomor diterbitkan."],
            ],
          },
          {
            type: "table",
            title: "Variasi format nomor",
            description:
              "Format nomor mengikuti scope surat. Contoh di bawah menjelaskan pola yang paling sering ditemui user.",
            columns: ["Konteks", "Pola", "Contoh", "Catatan"],
            rows: [
              [
                "Pusat tanpa proyek",
                "Nomor/Entitas/Departemen.IndexJenis/Bulan/Tahun",
                "001/UAI/PGD.1/VI/2026",
                "Dipakai untuk pengajuan pusat yang tidak membawa kode proyek.",
              ],
              [
                "Pusat dengan proyek atau Unit",
                "Nomor/Entitas/Departemen.IndexJenis.KodeProyek/Bulan/Tahun",
                "005/UAI/PBO.1.TRA/VI/2026",
                "Kode proyek muncul setelah index jenis surat.",
              ],
              [
                "KC",
                "Nomor/Entitas/KodeKantor-KodeProyek.IndexDepartemen.IndexJenis/Bulan/Tahun",
                "001/UAI/KCMLG-MLO.1.1/VI/2026",
                "Counter dipisah berdasarkan proyek.",
              ],
              [
                "KC tanpa proyek",
                "Nomor/Entitas/KodeKantor-000.IndexDepartemen.IndexJenis/Bulan/Tahun",
                "001/UAI/KCMLG-000.1.1/VII/2026",
                "Hanya untuk pengajuan non-unit. Proyek tidak dibuat sebagai data master palsu.",
              ],
              [
                "KCP",
                "Nomor/Entitas/KodeKCInduk.KodeKCP-KodeProyek.IndexDepartemen.IndexJenis/Bulan/Tahun",
                "001/UAI/KCSLO.KCPWNG-WNG.1.1/VI/2026",
                "Kode KC induk menjaga relasi KCP tetap terbaca.",
              ],
              [
                "KCP tanpa proyek",
                "Nomor/Entitas/KodeKCInduk.KodeKCP-000.IndexDepartemen.IndexJenis/Bulan/Tahun",
                "001/UAI/KCSLO.KCPWNG-000.1.1/VII/2026",
                "Unit tetap wajib memilih proyek karena butuh data kavling.",
              ],
            ],
          },
          {
            type: "table",
            title: "Scope dan reset nomor",
            columns: ["Kondisi", "Counter dipisah berdasarkan", "Reset"],
            rows: [
              ["Kantor Pusat", "Entitas + Departemen + Tahun.", "Reset ketika tahun berubah, kecuali counter awal tahun itu dikonfigurasi admin."],
              ["Cabang/KC/KCP dengan proyek", "Entitas + Proyek + Tahun.", "Reset ketika tahun berubah untuk proyek tersebut."],
              ["Cabang/KC/KCP tanpa proyek", "Entitas + Kantor + Departemen + Jenis + Tahun dengan kode virtual 000.", "Reset tahunan tanpa membuat master proyek 000."],
              ["Nomor awal produksi", "Nilai start_from pada Konfigurasi Penomoran.", "Dipakai saat sistem mulai dari nomor lanjutan agar tidak bentrok dengan nomor manual lama."],
              ["Nomor VOID", "Tidak dipakai ulang.", "Dibiarkan sebagai jejak nomor yang batal."],
              ["Nomor CANCELLED legacy", "Dapat dipakai ulang oleh generator jika status masih CANCELLED dan >= start_from.", "Status baru memakai VOID agar tidak membingungkan produksi."],
            ],
          },
          {
            type: "table",
            title: "Siklus draft dan nomor",
            columns: ["Status", "Arti", "Dampak ke nomor"],
            rows: [
              ["DRAFT", "Nomor sudah dipesan dan form disimpan otomatis.", "Nomor tetap menempel ke draft dan tidak diberikan ke user lain."],
              ["SUBMITTED", "Draft sudah dikirim menjadi surat berjalan.", "Nomor dipakai sebagai nomor resmi dokumen."],
              ["VOID", "Draft dibatalkan.", "Nomor tidak dipakai ulang agar audit tetap aman."],
              ["EXPIRED", "Draft melewati masa aktif.", "Perlu dibuat ulang sesuai aturan yang aktif."],
              ["Masa aktif", "Draft aktif selama 7 hari dari penyimpanan terakhir.", "User diarahkan melanjutkan draft jika kembali ke registrasi."],
            ],
          },
        ],
      },
      {
        type: "steps",
        title: "Alur registrasi dokumen",
        items: [
          "Pilih kategori pengajuan: Aset, Non Aset, Unit, atau Non Unit sesuai izin departemen.",
          "Untuk kategori Aset, tentukan apakah permohonan membutuhkan dokumen rekomendasi tertaut. Jika memilih butuh rekomendasi, rekomendasi dibuat sebagai surat terpisah dengan nomor dan approval sendiri.",
          "Pilih kegunaan form. Pilihan ini menentukan template, nomor surat, kandidat penandatangan, dan lampiran wajib.",
          "Isi tempat, tanggal, detail permohonan, catatan, dan lampiran yang diminta.",
          "Pilih kandidat penandatangan dari daftar yang tersedia. Untuk cabang, kandidat dapat mengikuti kantor pemohon.",
          "Kirim pengajuan. Setelah terkirim, dokumen masuk ke tahap persetujuan pertama.",
        ],
      },
      {
        type: "group",
        title: "Rekomendasi aset pada registrasi",
        description:
          "Rekomendasi aset dipakai ketika permohonan aset perlu dokumen pendukung resmi dari PBO sebelum surat induk dapat lanjut.",
        sections: [
          {
            type: "table",
            title: "Kapan memilih rekomendasi",
            columns: ["Pilihan", "Dampak ke proses", "Catatan"],
            rows: [
              ["Tidak membutuhkan rekomendasi", "Surat induk berjalan seperti pengajuan biasa.", "Tetap wajib melengkapi lampiran pemohon jika dikonfigurasi."],
              ["Membutuhkan rekomendasi", "Sistem membuat tugas rekomendasi setelah surat induk dikonfirmasi.", "Nomor rekomendasi dibuat otomatis memakai counter PBO."],
              ["Surat induk menunggu rekomendasi", "Approval dapat terkunci pada tahap yang dikonfigurasi sampai dokumen rekomendasi selesai.", "Panel rekomendasi tampil di detail persetujuan/monitoring."],
            ],
          },
          {
            type: "table",
            title: "Data rekomendasi yang disiapkan",
            columns: ["Data", "Aturan"],
            rows: [
              ["Item rekomendasi", "Berisi nama barang/alat kerja, lokasi/PIC, kerusakan, hasil rekomendasi, uraian, dan keterangan."],
              ["Hasil rekomendasi", "Service, Ganti Komponen, Beli Baru, atau Tidak Direkomendasikan. Tidak Direkomendasikan wajib alasan dan membuat item induk ditampilkan tercoret."],
              ["Lampiran gambar", "Setiap item wajib memiliki gambar; petugas bisa unggah, drag-drop, atau paste screenshot dengan Ctrl+V."],
              ["Link referensi", "Opsional sebagai data pendukung dan tampil di UI/email, tetapi tidak masuk Excel sampai area template khusus tersedia."],
            ],
          },
        ],
      },
      {
        type: "table",
        title: "Pilihan kategori",
        columns: ["Kategori", "Dipakai untuk", "Data utama"],
        rows: [
          ["Aset", "Permohonan barang/aset yang dicatat sebagai aset.", "Daftar barang, satuan, jumlah, status, keterangan, dan pilihan dokumen rekomendasi."],
          ["Non Aset", "Permohonan operasional yang tidak menjadi aset.", "Daftar kebutuhan, jumlah, catatan, dan lampiran pendukung."],
          ["Unit", "Permohonan yang berhubungan dengan unit atau kavling.", "Proyek, jumlah unit, catatan, dan alokasi unit pada tahap perencanaan."],
          ["Non Unit", "Permohonan yang memakai form yang sama tetapi tidak memerlukan pemilihan unit.", "Detail permohonan biasa tanpa alokasi kavling."],
        ],
      },
      {
        type: "table",
        title: "Yang otomatis diisi sistem",
        description:
          "User tidak mengisi file Excel utama. Sistem memasukkan data ke template dan menyiapkan PDF saat dokumen dibuka.",
        columns: ["Data", "Sumber"],
        rows: [
          ["Nama, jabatan, departemen, kantor", "Profil akun pemohon."],
          ["Nomor surat", "Konfigurasi penomoran dan counter yang aktif."],
          ["Tempat, tanggal", "Input user pada registrasi."],
          ["Detail barang atau unit", "Input user dan/atau input tim pemeriksa pada tahap yang dikonfigurasi."],
          ["Tanda tangan", "Aksi penandatangan sesuai step approval."],
          ["Rekomendasi aset", "Dokumen surat tertaut yang dibuat dari panel rekomendasi pada approval bila permohonan aset membutuhkannya."],
        ],
      },
      {
        type: "troubleshooting",
        title: "Masalah umum saat registrasi",
        items: [
          {
            problem: "Kantor atau departemen tidak bisa diganti",
            solution:
              "Untuk user biasa, kantor dan departemen mengikuti profil akun. Admin dapat memperbaiki data dari User Organization.",
          },
          {
            problem: "Kegunaan form yang dicari tidak muncul",
            solution:
              "Kegunaan form dibatasi oleh departemen, kategori, dan konfigurasi aktif. Pilih kategori yang benar atau minta admin mengecek konfigurasi.",
          },
          {
            problem: "Draft lama muncul saat kembali ke registrasi",
            solution:
              "Itu berarti ada nomor yang sudah dipesan dan belum dikirim. Lanjutkan draft atau batalkan sesuai prosedur yang tersedia.",
          },
        ],
      },
    ],
  },
  {
    id: "approval-inbox",
    title: "Persetujuan",
    menu: "Layanan Surat > Persetujuan",
    audience: "user",
    icon: Inbox,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Tempat penandatangan dan tim pemeriksa memproses dokumen yang masuk ke tanggung jawabnya.",
    whenToUse: [
      "Menyetujui atau menolak dokumen yang menunggu keputusan Anda.",
      "Memeriksa data sebagai tim pemeriksa sebelum signer melakukan aksi.",
      "Mengunggah lampiran approval atau mengisi alokasi unit jika diminta sistem.",
    ],
    steps: [
      "Buka Persetujuan.",
      "Pilih dokumen dari antrean atau task switcher.",
      "Baca ringkasan pengajuan tanpa harus membuka PDF.",
      "Periksa progres persetujuan, dokumen, lampiran, catatan, dan tugas step aktif.",
      "Isi data yang diwajibkan, lalu pilih Setujui atau Tolak.",
    ],
    examples: [
      "Jika Anda Mgr. Perencanaan pada pengajuan Unit, tim pemeriksa dapat mengisi detail unit terlebih dulu sebelum Anda menyetujui.",
      "Jika data belum benar, gunakan aksi kembalikan ke tim pemeriksa agar data diperbarui.",
      "Jika menolak dokumen, tulis alasan minimal lima karakter agar pembuat memahami masalahnya.",
    ],
    troubleshooting: [
      "Jika tombol Setujui terkunci, baca alasan di action bar untuk mengetahui data yang belum lengkap.",
      "Jika lampiran sudah ada, Anda tidak perlu upload ulang kecuali ingin mengganti lampiran lama.",
      "Jika dokumen hilang setelah diproses, artinya antrean Anda sudah selesai dan sistem memilih item berikutnya.",
    ],
    sections: [
      {
        type: "feature-grid",
        title: "Area utama Persetujuan",
        items: [
          {
            title: "Antrean tugas",
            description:
              "Menampilkan dokumen yang sedang menunggu aksi Anda sebagai signer atau tim pemeriksa.",
          },
          {
            title: "Ringkasan pengajuan",
            description:
              "Berisi pengaju, departemen, lokasi, dan permohonan agar keputusan awal bisa dibaca tanpa membuka PDF.",
          },
          {
            title: "Progres persetujuan",
            description:
              "Menampilkan tahap selesai, tahap aktif, signer, waktu aksi, dan catatan yang relevan.",
          },
          {
            title: "Tugas step aktif",
            description:
              "Menampilkan kewajiban sebelum aksi, seperti lampiran approval, pemeriksaan tim pemeriksa, atau alokasi unit.",
          },
          {
            title: "Dokumen dan lampiran",
            description:
              "Panel file untuk membuka PDF, snapshot, lampiran pemohon, lampiran tim pemeriksa, dan lampiran approval.",
          },
          {
            title: "Panel rekomendasi",
            description:
              "Muncul pada pengajuan aset yang membutuhkan rekomendasi agar status dokumen tertaut dapat dipantau dari surat induk.",
          },
          {
            title: "Action bar",
            description:
              "Tombol Setujui, Tolak, dan alasan kenapa aksi belum bisa dilakukan jika ada data yang belum lengkap.",
          },
        ],
      },
      {
        type: "steps",
        title: "Alur signer",
        items: [
          "Buka dokumen dari antrean dan baca ringkasan pengajuan.",
          "Periksa progress step sebelumnya dan catatan dari pemohon atau tim pemeriksa.",
          "Jika ada tugas wajib, lengkapi dulu atau minta tim pemeriksa memperbarui data.",
          "Jika surat aset menunggu rekomendasi, cek panel rekomendasi dan arahkan petugas PBO membuka menu Rekomendasi.",
          "Jika data perlu diperbaiki, pilih tujuan pengembalian yang tersedia. Tim pemeriksa hanya muncul jika tahap aktif memang memiliki pemeriksa pada snapshot transaksi.",
          "Isi perubahan item bila ada: tidak berubah, disetujui sebagian, atau tidak disetujui. Nilai diajukan hanya tampil sebagai referensi; signer cukup mengisi nilai disetujui dan alasan jika item berubah.",
          "Gunakan Setujui jika data sudah benar, atau Tolak dengan alasan yang jelas jika pengajuan tidak dapat dilanjutkan.",
          "Setelah aksi berhasil, dokumen keluar dari antrean dan sistem membuka tugas berikutnya bila ada.",
        ],
      },
      {
        type: "table",
        title: "Perbaikan dalam proses approval",
        columns: ["Kasus", "Tujuan perbaikan", "Dampak"],
        rows: [
          ["Nominal disetujui lebih kecil dari pengajuan", "Pemohon atau tim pemeriksa sesuai konteks", "Riwayat menyimpan nilai diajukan, nilai disetujui, dan alasan perubahan."],
          ["Jumlah aset disetujui lebih sedikit", "Pemohon atau tim pemeriksa", "Item yang tidak disetujui tetap tampil dengan garis coret dan alasan di detail/PDF."],
          ["Rekomendasi IT perlu revisi spek/harga", "Tim IT / rekomendasi", "Rekomendasi diperbarui dulu, lalu pemohon memilih lanjut atau batal."],
          ["Data berubah setelah tanda tangan berjalan", "Tahap 1", "Setelah pemohon menyetujui perubahan, semua signer meninjau dan tanda tangan ulang dari awal."],
          ["Tahap aktif tidak punya tim pemeriksa", "Pemohon atau signer sebelumnya", "Opsi tim pemeriksa tidak ditampilkan agar proses tidak dikirim ke target kosong."],
        ],
      },
      {
        type: "table",
        title: "Perbedaan signer dan tim pemeriksa",
        columns: ["Peran", "Bisa melakukan", "Tidak menggantikan"],
        rows: [
          ["Signer", "Setuju, tolak, membaca dokumen, dan mengembalikan ke tim pemeriksa jika data perlu diperbaiki.", "Pemeriksaan tim pemeriksa yang diwajibkan konfigurasi."],
          ["Tim pemeriksa", "Pemeriksaan data, mengisi data unit, mengganti lampiran wajib, dan menulis catatan pemeriksaan.", "Keputusan tanda tangan signer."],
          ["Pemohon", "Membuat pengajuan dan memantau status.", "Mengubah proyek unit setelah pengajuan dibuat."],
          ["Petugas rekomendasi", "Mengambil draft rekomendasi aset, mengisi item rekomendasi, dan mengonfirmasi dokumen tertaut.", "Keputusan approval surat induk."],
        ],
      },
      {
        type: "table",
        title: "Rekomendasi pada approval",
        columns: ["Kondisi", "Yang terjadi", "Yang perlu dicek"],
        rows: [
          ["Surat aset tidak butuh rekomendasi", "Approval berjalan tanpa panel rekomendasi.", "Pastikan pilihan rekomendasi saat registrasi memang Tidak."],
          ["Surat aset butuh rekomendasi", "Panel rekomendasi tampil dan sistem membuat tugas PBO setelah surat induk dikonfirmasi.", "Cek status tugas di menu Rekomendasi."],
          ["Rekomendasi belum selesai", "Approval induk dapat terkunci pada tahap yang dikonfigurasi.", "Tunggu dokumen rekomendasi selesai atau cek siapa yang mengambil tugas."],
          ["Rekomendasi selesai", "Dokumen tertaut dapat dibuka sebagai surat sendiri.", "Lanjutkan approval induk sesuai action bar."],
        ],
      },
      {
        type: "table",
        title: "Jika pengajuan Unit",
        columns: ["Bagian", "Aturan"],
        rows: [
          ["Proyek", "Mengikuti pilihan pemohon dan tidak diubah di tahap approval."],
          ["Jumlah unit", "Boleh dialokasikan kurang dari jumlah permintaan jika memang hanya tersedia sebagian."],
          ["Detail unit", "Diisi dalam tabel satu baris per kavling dengan header sticky: struktur atas, struktur bawah, nomor, blok, tanggal, dan kode produksi."],
          ["Template Excel", "Tim pemeriksa dapat mengunduh template setelah memilih kavling, mengisi data di Excel, lalu import kembali untuk memperbarui tabel alokasi. Keterangan cell memberi contoh nominal, nomor kode produksi, blok, dan tanggal."],
          ["Lampiran otomatis", "Kode produksi dan rekap adendum dibuat dari input sistem, bukan dari file manual kode produksi."],
        ],
      },
      {
        type: "troubleshooting",
        title: "Masalah umum saat approval",
        items: [
          {
            problem: "Tombol Setujui terkunci",
            solution:
              "Baca status kelengkapan pada action bar. Biasanya ada lampiran wajib, pemeriksaan tim pemeriksa, atau data unit yang belum lengkap.",
          },
          {
            problem: "Diminta upload lampiran padahal sudah ada",
            solution:
              "Lampiran lama tetap dipakai. Upload ulang hanya diperlukan jika ingin mengganti file lama.",
          },
          {
            problem: "Catatan tim pemeriksa tidak terlihat",
            solution:
              "Buka bagian progres persetujuan atau tugas step aktif. Catatan tim pemeriksa tampil sebagai bagian dari pemeriksaan data.",
          },
          {
            problem: "Surat induk aset tidak bisa disetujui karena rekomendasi",
            solution:
              "Buka panel rekomendasi untuk melihat status dokumen tertaut. Pembuatan rekomendasi dilakukan dari menu Rekomendasi oleh petugas PBO/Staff IT.",
          },
        ],
      },
    ],
  },
  {
    id: "follow-up",
    title: "Tindak Lanjut",
    menu: "Layanan Surat > Tindak Lanjut",
    audience: "user",
    icon: ClipboardCheck,
    version: "v1.11.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Antrean keputusan pemohon saat pengajuan dikembalikan untuk perbaikan atau perubahan data.",
    whenToUse: [
      "Meninjau perubahan yang dibuat signer, tim pemeriksa, atau tim rekomendasi.",
      "Memutuskan apakah pengajuan dilanjutkan dengan data terbaru atau dibatalkan.",
      "Membaca perbandingan item yang berubah sebelum tanda tangan dimulai ulang.",
    ],
    steps: [
      "Buka Tindak Lanjut saat badge muncul di Layanan Surat.",
      "Pilih pengajuan dari antrean keputusan.",
      "Baca tabel perubahan dan ringkasan dokumen.",
      "Pilih Lanjutkan jika perubahan disetujui, atau Batalkan jika pengajuan tidak dilanjutkan.",
      "Jika dilanjutkan, persetujuan dimulai ulang dari tahap pertama agar seluruh pihak menandatangani data terbaru.",
    ],
    examples: [
      "Pengajuan 10 unit hanya disetujui 8 unit. Pemohon membuka Tindak Lanjut, membaca alasan, lalu memilih Lanjutkan atau Batalkan.",
      "Permohonan aset 3 item hanya direkomendasikan 2 item. Item yang tidak direkomendasikan tampil dicoret dan pemohon mengambil keputusan dari halaman ini.",
      "Rekomendasi IT direvisi setelah arahan signer. Setelah rekomendasi selesai, pemohon menerima antrean Tindak Lanjut untuk menyetujui perubahan.",
    ],
    troubleshooting: [
      "Jika badge Tindak Lanjut muncul tetapi daftar kosong, tekan Segarkan dan pastikan akun yang dipakai adalah pemohon surat tersebut.",
      "Jika tombol Lanjutkan gagal, cek apakah event revisi masih aktif atau sudah diproses dari tab lain.",
      "Jika memilih Batalkan, isi alasan minimal lima karakter agar riwayat audit jelas.",
    ],
    related: ["Persetujuan", "Status Pengajuan", "Rekomendasi"],
    sections: [
      {
        type: "table",
        title: "Perbedaan dengan Status Pengajuan",
        columns: ["Halaman", "Fungsi", "Aksi pemohon"],
        rows: [
          ["Status Pengajuan", "Membaca progres, detail dokumen, lampiran, dan riwayat.", "Tidak memproses keputusan revisi."],
          ["Tindak Lanjut", "Memproses keputusan setelah pengajuan dikembalikan.", "Lanjutkan proses atau batalkan pengajuan."],
        ],
      },
      {
        type: "table",
        title: "Dampak keputusan",
        columns: ["Keputusan", "Yang terjadi", "Catatan"],
        rows: [
          ["Lanjutkan", "Data revisi diterapkan dan tanda tangan dimulai ulang dari tahap 1.", "PDF lama dibersihkan agar preview berikutnya memakai data terbaru."],
          ["Batalkan", "Pengajuan berhenti dan nomor surat ditandai hangus.", "Alasan pembatalan tersimpan pada riwayat."],
        ],
      },
      {
        type: "table",
        title: "Data yang ditampilkan",
        columns: ["Bagian", "Isi"],
        rows: [
          ["Antrean keputusan", "Judul, nomor surat, pihak yang mengembalikan, dan tahap asal."],
          ["Tabel perubahan", "Item, keputusan, nilai diajukan, nilai disetujui, dan alasan."],
          ["Ringkasan dokumen", "Identitas pengajuan, isi dokumen, item dicoret jika tidak disetujui, unit/kavling, dan lampiran."],
        ],
      },
    ],
  },
  {
    id: "recommendation-tasks",
    title: "Rekomendasi",
    menu: "Layanan Surat > Rekomendasi",
    audience: "user",
    icon: FileCheck2,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Antrean pembuatan dokumen rekomendasi aset yang tertaut ke surat induk.",
    whenToUse: [
      "Mengambil tugas rekomendasi aset yang sudah dibuat sistem.",
      "Melanjutkan draft rekomendasi yang sudah terkunci untuk akun Anda.",
      "Melihat apakah tugas rekomendasi sedang dikerjakan oleh Staff IT/PBO lain.",
    ],
    steps: [
      "Buka menu Rekomendasi.",
      "Pilih tugas rekomendasi yang belum terkunci atau lanjutkan draft yang sudah Anda ambil.",
      "Lengkapi setiap item permohonan melalui navigator item, termasuk lampiran gambar dan link referensi bila ada.",
      "Konfirmasi dokumen agar rekomendasi tertaut ke surat induk.",
      "Pastikan proses lanjut ke pemeriksa atau penandatangan berikutnya sesuai alur.",
    ],
    examples: [
      "Jika ada dua Staff IT, keduanya dapat melihat tugas yang sama sampai salah satu memilih Ambil Tugas.",
      "Setelah Staff IT mengambil tugas, kandidat lain melihat status Terkunci dan tidak dapat mengedit draft yang sama.",
      "Dokumen rekomendasi memiliki nomor surat, template, tanda tangan, status, preview, dan lampiran sendiri.",
    ],
    troubleshooting: [
      "Jika menu Rekomendasi tidak muncul, akses dibatasi untuk akun aktif di departemen PBO/Pengembangan Organisasi.",
      "Jika tugas terkunci oleh user lain, tunggu user tersebut menyelesaikan draft atau hubungi admin untuk pemeriksaan.",
      "Jika rekomendasi sudah dikonfirmasi tetapi surat induk belum lanjut, refresh data dan cek status dokumen tertaut pada panel rekomendasi.",
    ],
    related: ["Registrasi Surat", "Persetujuan", "Dokumen dan Lampiran"],
    sections: [
      {
        type: "steps",
        title: "Alur rekomendasi aset",
        items: [
          "Pemohon membuat surat induk kategori Aset dan memilih membutuhkan rekomendasi.",
          "Setelah surat induk dikonfirmasi, sistem membuat nomor dan tugas rekomendasi PBO.",
          "Staff IT/PBO membuka menu Rekomendasi dan mengambil tugas.",
          "Sistem mengunci draft untuk user pertama yang mengambil tugas.",
          "Sistem menyalin daftar barang dari permohonan induk ke satu dokumen rekomendasi.",
          "Petugas mengisi rekomendasi satu per satu melalui navigator item, lalu mengonfirmasi dokumen.",
          "Dokumen rekomendasi tertaut ke surat induk dan approval induk dapat lanjut setelah syarat rekomendasi terpenuhi.",
          "Jika penanda tangan meminta revisi rekomendasi, tugas muncul kembali di menu Rekomendasi dengan data terakhir sebagai draft awal.",
          "Rekomendasi revisi harus dikonfirmasi ulang dan ditandatangani ulang oleh Mgr. PO sebelum surat induk kembali ke pemohon untuk lanjut atau batal.",
        ],
      },
      {
        type: "table",
        title: "Mengisi dokumen rekomendasi",
        columns: ["Bagian", "Aturan operasional"],
        rows: [
          ["Nama barang/alat kerja", "Isi sesuai barang yang dinilai untuk service, ganti, atau beli baru."],
          ["Navigator item", "Setiap item permohonan memiliki satu isian rekomendasi. Nama barang mengikuti permohonan dan tidak dapat diubah."],
          ["Nomor dokumen", "Dibuat otomatis dari pengajuan induk. Ikon gembok menandakan nomor tidak dapat diubah oleh petugas rekomendasi."],
          ["No registrasi", "Opsional jika barang sudah memiliki nomor inventaris atau registrasi."],
          ["Lokasi/PIC", "Diambil dari pilihan user agar barang mudah ditelusuri."],
          ["Kerusakan", "Opsional, dipakai untuk menjelaskan masalah awal barang."],
          ["Hasil rekomendasi", "Pilih Service, Ganti Komponen, Beli Baru, atau Tidak Direkomendasikan sesuai hasil pemeriksaan per item."],
          ["Lampiran gambar", "Wajib untuk Service, Ganti Komponen, dan Beli Baru. Untuk Tidak Direkomendasikan, alasan wajib dan gambar opsional."],
          ["Link referensi", "Opsional dan tampil di UI/email sebagai pendukung keputusan."],
        ],
      },
      {
        type: "table",
        title: "Status dan lock rekomendasi",
        columns: ["Status", "Arti", "Tindakan"],
        rows: [
          ["Menunggu Staff IT", "Tugas belum diambil kandidat mana pun.", "Klik Ambil Tugas jika memang Anda yang akan mengerjakan."],
          ["Sedang Anda kerjakan", "Draft sudah terkunci untuk akun Anda.", "Klik Lanjutkan Draft dan selesaikan dokumen."],
          ["Terkunci", "Draft sedang dikerjakan oleh kandidat lain.", "Pantau status atau koordinasikan dengan petugas yang mengambil tugas."],
          ["Perlu Revisi", "Rekomendasi lama dikembalikan oleh penanda tangan surat induk.", "Ambil revisi untuk memperbaiki data dari versi rekomendasi terakhir."],
          ["Selesai", "Dokumen rekomendasi sudah dikonfirmasi dan tertaut ke surat induk.", "Surat induk dapat lanjut sesuai aturan tahap yang menunggu rekomendasi."],
        ],
      },
      {
        type: "troubleshooting",
        title: "Masalah umum rekomendasi",
        items: [
          {
            problem: "Tugas rekomendasi tidak muncul",
            solution:
              "Pastikan akun aktif, berada di PBO/Pengembangan Organisasi, dan surat induk benar-benar memilih membutuhkan rekomendasi.",
          },
          {
            problem: "Tidak bisa mengambil tugas",
            solution:
              "Tugas mungkin sudah dikunci oleh user lain. Lihat label status dan nama user yang sedang mengerjakan.",
          },
          {
            problem: "Gambar item belum terbaca",
            solution:
              "Pastikan item dengan keputusan Service, Ganti Komponen, atau Beli Baru memiliki lampiran gambar dan proses upload selesai sebelum konfirmasi.",
          },
          {
            problem: "Rekomendasi sudah direvisi tetapi surat induk belum bisa lanjut",
            solution:
              "Pastikan dokumen rekomendasi revisi sudah selesai ditandatangani Mgr. PO. Setelah selesai, pemohon surat induk akan menerima tugas untuk melanjutkan atau membatalkan pengajuan.",
          },
        ],
      },
    ],
  },
  {
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
  },
  {
    id: "documents-attachments",
    title: "Dokumen dan Lampiran",
    menu: "Surat",
    audience: "user",
    icon: FileCheck2,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Membuka PDF dokumen, snapshot, dan lampiran yang terkait dengan pengajuan.",
    whenToUse: [
      "Memeriksa tampilan akhir dokumen.",
      "Membuka lampiran pendukung yang diunggah pemohon, tim pemeriksa, atau approver.",
      "Membandingkan snapshot dokumen pada proses approval.",
    ],
    steps: [
      "Buka detail dokumen dari Persetujuan, Status Pengajuan, Riwayat Terlibat, atau Monitoring Admin.",
      "Pilih file yang ingin dibuka.",
      "Tunggu jika sistem sedang menyiapkan PDF.",
      "Jika file gagal dibuka, gunakan tombol coba lagi atau hubungi admin.",
    ],
    examples: [
      "Pada pengajuan Unit, lampiran rekap adendum dan kode produksi otomatis dapat dibuka dari daftar lampiran.",
      "Pada dokumen selesai, PDF utama berisi nomor surat, data pemohon, dan tanda tangan terbaru.",
    ],
    troubleshooting: [
      "Jika URL file berubah setiap klik, itu normal karena akses file dibuat aman per request.",
      "Jika file tidak ditemukan, dokumen mungkin belum selesai dibuat atau storage perlu dicek admin.",
      "Jika PDF lama masih tampil, tutup preview lalu buka ulang agar cache browser diperbarui.",
    ],
  },
  {
    id: "history",
    title: "Riwayat Terlibat",
    menu: "Layanan Surat > Riwayat Terlibat",
    audience: "user",
    icon: History,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Riwayat dokumen yang pernah Anda buat, cek, setujui, atau tolak.",
    whenToUse: [
      "Mencari kembali dokumen yang pernah diproses.",
      "Melihat dokumen berdasarkan tanggal, status setuju, atau status tolak.",
      "Mengecek jejak keterlibatan tanpa masuk ke antrean aktif.",
    ],
    steps: [
      "Buka Riwayat Terlibat.",
      "Gunakan filter tanggal, status, atau pencarian.",
      "Buka detail untuk membaca ringkasan dan timeline.",
    ],
    examples: [
      "Cari semua dokumen yang Anda tolak bulan berjalan.",
      "Gunakan rentang tanggal untuk melihat riwayat approval periode tertentu.",
    ],
    troubleshooting: [
      "Jika riwayat kosong, periksa filter tanggal karena default memakai bulan berjalan.",
      "Jika dokumen lama tidak muncul, perluas rentang tanggal pencarian.",
    ],
  },
  {
    id: "settings",
    title: "Pengaturan",
    menu: "Pengaturan",
    audience: "user",
    icon: Settings,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur preferensi akun seperti profil, tema, dan pengaturan personal lain.",
    whenToUse: [
      "Mengubah preferensi tampilan light mode atau dark mode.",
      "Mengganti foto profil akun.",
      "Memeriksa data profil yang dipakai pada dokumen.",
      "Mengelola pengaturan personal yang tersedia untuk akun Anda.",
    ],
    steps: [
      "Buka Pengaturan.",
      "Pilih bagian yang ingin diubah.",
      "Untuk foto profil, pilih gambar JPG, PNG, atau WebP dengan ukuran maksimal 5 MB.",
      "Simpan perubahan lalu pastikan tampilannya sesuai.",
    ],
    examples: [
      "Gunakan dark mode jika bekerja lama di ruangan redup.",
      "Unggah foto profil agar identitas lebih mudah dikenali pada hirarki, aktivitas, dan daftar user.",
      "Cek nama, jabatan, departemen, dan kantor karena data ini ikut dipakai dalam dokumen.",
    ],
    troubleshooting: [
      "Jika departemen atau kantor salah, hubungi admin karena beberapa data mengikuti master user.",
      "Jika foto gagal diunggah, pastikan formatnya JPG, PNG, atau WebP dan ukurannya tidak lebih dari 5 MB.",
      "Jika foto lama masih terlihat setelah upload berhasil, muat ulang halaman agar profil terbaru dibaca dari server.",
      "Jika tema tidak berubah, refresh halaman setelah menyimpan pengaturan.",
    ],
    sections: [
      {
        type: "table",
        title: "Foto profil",
        columns: ["Bagian", "Perilaku"],
        rows: [
          ["Format", "JPG, PNG, atau WebP; maksimal 5 MB."],
          ["Penyimpanan", "File asli disimpan pada storage private self-hosted dan tidak memakai URL publik Supabase Cloud."],
          ["Tampilan aplikasi", "SIGAP memakai thumbnail WebP maksimal 256 x 256 agar sidebar, hirarki, dan daftar user lebih ringan."],
          ["Buka gambar", "Saat URL foto dibuka sebagai halaman atau tab baru, server menampilkan file asli."],
          ["Keamanan", "Upload diperiksa oleh server dan path file selalu mengikuti ID akun yang sedang login."],
        ],
      },
    ],
  },
];

export const ADMIN_DOCS: DocsEntry[] = [
  {
    id: "admin-users",
    title: "User Organization",
    menu: "Master Data > User Organization",
    audience: "admin",
    icon: Users,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengelola akun, role, status aktif, jabatan, departemen, kantor, dan data organisasi karyawan.",
    whenToUse: [
      "Import atau memperbarui data karyawan aktif.",
      "Mengubah role user menjadi admin atau user biasa.",
      "Menonaktifkan akun yang sudah tidak masuk dalam data import aktif.",
    ],
    steps: [
      "Buka User Organization.",
      "Gunakan pencarian dan filter jabatan jika perlu.",
      "Edit profil user atau lakukan import data karyawan.",
      "Cek hasil import, termasuk data berhasil, gagal, dan user yang dinonaktifkan.",
    ],
    examples: [
      "Jika NIK sama tetapi nama atau jabatan berubah, sistem memperbarui data user yang sama.",
      "Jika karyawan tidak ada dalam import aktif, akun dianggap tidak aktif.",
    ],
    troubleshooting: [
      "Jika import gagal karena akses ditolak, pastikan akun yang melakukan import adalah admin aktif.",
      "Jika kantor belum termapping, tambahkan mapping kantor sebelum import ulang.",
    ],
  },
  {
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
  },
  {
    id: "admin-master-data",
    title: "Master Data",
    menu: "Master Data",
    audience: "admin",
    icon: Database,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengelola data dasar seperti departemen, entitas, jenis surat, kantor cabang, dan proyek.",
    whenToUse: [
      "Menambah departemen, kantor, proyek, atau entitas baru.",
      "Mengatur jenis surat dan kode per departemen.",
      "Menjaga data dasar agar registrasi surat tidak menampilkan pilihan yang salah.",
    ],
    steps: [
      "Buka menu Master Data yang sesuai.",
      "Tambah atau edit data master.",
      "Simpan dan cek dampaknya pada registrasi surat.",
    ],
    examples: [
      "Jika jenis surat Penagihan tidak berlaku untuk PO, jangan aktifkan pada departemen PO.",
      "Jika index Permohonan berbeda antara PGD dan PO, atur index per departemen.",
    ],
    troubleshooting: [
      "Jika pilihan muncul di registrasi padahal tidak seharusnya, cek relasi jenis surat dan departemen.",
      "Jika proyek tidak muncul, cek master proyek dan koneksi data source proyek.",
    ],
    related: ["Master Departemen", "Master Jenis Surat", "Master Proyek"],
  },
  {
    id: "admin-departments",
    title: "Master Departemen",
    menu: "Master Data > Master Departemen",
    audience: "admin",
    icon: Building2,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur departemen, email departemen, alias import, dan relasi yang dipakai pada workflow.",
    whenToUse: [
      "Menambah atau memperbaiki data departemen.",
      "Mengatur email departemen untuk notifikasi.",
      "Menyesuaikan alias departemen dari data HRD agar import karyawan masuk ke departemen yang benar.",
    ],
    steps: [
      "Buka Master Departemen.",
      "Tambah atau edit nama, kode, email, dan metadata yang diperlukan.",
      "Cek kembali workflow yang memakai departemen tersebut.",
    ],
    examples: [
      "Departemen `Direksi` menampung Direktur Utama, Direktur I, Dirut, dan sejenisnya.",
      "Departemen `Branch Manager` dipakai untuk relasi cabang/BM.",
    ],
    troubleshooting: [
      "Jika import karyawan masuk departemen salah, cek alias departemen.",
      "Jika email notifikasi tidak terkirim ke departemen, cek email departemen dan SMTP.",
    ],
  },
  {
    id: "admin-entities",
    title: "Master Entitas",
    menu: "Master Data > Master Entitas",
    audience: "admin",
    icon: Database,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur perusahaan atau entitas yang dipakai pada nomor surat dan dokumen.",
    whenToUse: [
      "Menambah entitas perusahaan baru.",
      "Mengubah kode entitas pada format nomor surat.",
      "Menjaga entitas tetap konsisten pada template dokumen.",
    ],
    steps: [
      "Buka Master Entitas.",
      "Tambah atau edit nama dan kode entitas.",
      "Pastikan kode entitas sesuai format nomor yang berlaku.",
    ],
    examples: [
      "Kode `UAI` dapat dipakai pada format nomor surat seperti `001/UAI/MKT.1.JST 3/VI/2026`.",
    ],
    troubleshooting: [
      "Jika nomor surat memakai kode perusahaan salah, cek entitas yang dipilih saat registrasi.",
      "Jika entitas tidak muncul, pastikan data aktif dan tersimpan.",
    ],
  },
  {
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
  },
  {
    id: "admin-offices",
    title: "Master Kantor Cabang",
    menu: "Master Data > Master Kantor Cabang",
    audience: "admin",
    icon: MapPin,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur kantor pusat, cabang, kost, dan mapping kantor untuk user serta workflow.",
    whenToUse: [
      "Menambah kantor atau cabang baru.",
      "Membetulkan mapping kantor dari data import HRD.",
      "Mengatur kandidat signer yang harus mengikuti kantor pemohon.",
    ],
    steps: [
      "Buka Master Kantor Cabang.",
      "Tambah atau edit nama kantor, kode, dan tipe kantor.",
      "Cek user yang memakai kantor tersebut.",
    ],
    examples: [
      "User KC Jepara akan melihat kandidat SPV/BM Jepara pada workflow yang mengikuti kantor pemohon.",
      "Kantor Pusat dipakai untuk manager pusat dan konfigurasi yang bersifat pusat.",
    ],
    troubleshooting: [
      "Jika kandidat cabang salah, cek kantor pada profil user dan tipe kantor.",
      "Jika kantor belum termapping saat import, tambahkan alias kantor lalu import ulang.",
    ],
  },
  {
    id: "admin-projects",
    title: "Master Proyek",
    menu: "Master Data > Master Proyek",
    audience: "admin",
    icon: Briefcase,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur dan memantau data proyek yang dipakai pada pengajuan Unit dan dokumen proyek.",
    whenToUse: [
      "Memastikan pilihan proyek tersedia saat registrasi.",
      "Memeriksa relasi proyek dengan cabang.",
      "Menyediakan data proyek untuk pengajuan Unit.",
    ],
    steps: [
      "Buka Master Proyek.",
      "Cek daftar proyek dan cabang terkait.",
      "Pastikan data proyek aktif sebelum dipakai user.",
    ],
    examples: [
      "Saat pemohon memilih proyek Marison Jepara Perluasan, proyek itu terkunci untuk proses Unit selanjutnya.",
    ],
    troubleshooting: [
      "Jika proyek tidak muncul, cek data source proyek dan status aktif proyek.",
      "Jika unit tidak muncul, cek integrasi unit/proyek dan konfigurasi pengajuan Unit.",
    ],
  },
  {
    id: "admin-forms",
    title: "Form dan Template",
    menu: "Konfigurasi > Form & Template",
    audience: "admin",
    icon: FileCheck2,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengelola form lama, template Excel aktif, konfigurasi field input, tabel barang, tempat tanggal, dan area tanda tangan.",
    whenToUse: [
      "Upload template baru.",
      "Mengatur field input yang akan diisi user dari sistem.",
      "Mengatur kotak tanda tangan dinamis tanpa membuat banyak file duplikat.",
    ],
    steps: [
      "Buka Form & Template.",
      "Pilih form atau buat form baru.",
      "Atur mapping cell, tabel, catatan, tempat tanggal, dan tanda tangan.",
      "Simpan lalu pilih Uji PDF.",
      "Pilih jumlah penandatangan dan distribusi Membuat, Memeriksa, serta Menyetujui.",
      "Periksa hasil PDF sebelum form dipakai pada registrasi dokumen.",
    ],
    examples: [
      "Satu form PGD dapat dipakai untuk beberapa kegunaan dengan 3 sampai 8 tanda tangan tanpa menggandakan template.",
      "Untuk catatan panjang, mapping area merge harus disesuaikan agar teks tidak keluar kotak.",
    ],
    troubleshooting: [
      "Jika tulisan tidak masuk ke dokumen, cek mapping cell dan sheet.",
      "Jika tanda tangan tidak rapi, cek konfigurasi area tanda tangan dan jumlah step.",
    ],
    sections: [
      {
        type: "table",
        title: "Formasi kotak tanda tangan",
        description: "Uji PDF dan dokumen yang didaftarkan memakai pembagian yang sama.",
        columns: ["Jumlah signer", "Susunan", "Catatan"],
        rows: [
          ["3", "Tiga slot kanan", "Mengikuti template PGD asli: slot kiri kosong, tiga kotak berada di kanan."],
          ["4", "4", "Semua kotak berada pada baris pertama dengan tinggi blok tetap."],
          ["5", "3 + 2", "Dua kotak bawah memakai slot kanan pada grid tiga kolom."],
          ["6", "3 + 3", "Baris atas dan bawah sejajar."],
          ["7", "4 + 3", "Tiga kotak bawah memakai tiga slot paling kanan pada grid empat kolom."],
          ["8", "4 + 4", "Dua baris penuh dan sejajar."],
        ],
      },
      {
        type: "callout",
        title: "Uji PDF tidak membuat surat",
        description: "Uji PDF hanya memeriksa hasil renderer, isi contoh, dan formasi tanda tangan. Nomor surat, transaksi, dan histori approval tidak dibuat.",
        tone: "info",
      },
      {
        type: "callout",
        title: "Normalisasi akhir PGD",
        description: "Form Permintaan Barang & Jasa dibuat langsung sebagai A4 landscape oleh renderer PDF-native. Uji PDF, surat baru, snapshot approval, dan Buat Ulang PDF memakai renderer yang sama sehingga tidak dipengaruhi merge, border, atau print area Excel.",
        tone: "info",
      },
    ],
  },
  {
    id: "admin-template-builder",
    title: "Template Builder",
    menu: "Konfigurasi > Template Builder",
    audience: "admin",
    icon: LayoutTemplate,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Merancang template dokumen native dari nol memakai elemen, binding data, tabel berulang, dan versioning.",
    whenToUse: [
      "Membuat bentuk dokumen baru tanpa menyusun file Excel.",
      "Membutuhkan data berulang seperti item 1, item 2, daftar unit, lampiran, atau signer.",
      "Menguji layout dokumen native sebelum dihubungkan ke generator PDF produksi.",
    ],
    steps: [
      "Buka Template Builder dari menu Configuration.",
      "Buat template baru atau pilih template draft.",
      "Tambahkan elemen dari panel kiri: logo, teks, field data, tabel berulang, catatan, kotak, garis, atau tanda tangan.",
      "Klik elemen pada canvas untuk mengatur posisi, ukuran, warna, border, font, dan binding dari panel kanan.",
      "Untuk item berulang, pilih elemen Tabel Berulang lalu tentukan sumber data dan kolomnya.",
      "Atur schema input agar sistem tahu field apa saja yang perlu diisi user saat registrasi.",
      "Simpan draft. Publish hanya jika validasi tidak menampilkan error.",
    ],
    examples: [
      "Untuk daftar barang, cukup buat satu Tabel Berulang dengan sumber data Daftar Barang. Sistem akan mengulang baris sesuai jumlah barang user.",
      "Untuk tanda tangan, gunakan elemen Tanda Tangan agar nama dan jabatan signer diambil dari alur approval, bukan ditulis manual.",
    ],
    troubleshooting: [
      "Jika halaman menampilkan migration belum siap, jalankan migration document_template_builder terlebih dahulu.",
      "Jika template tidak bisa dipublish, cek apakah sudah ada tabel berulang dan area tanda tangan.",
      "Jika data tidak muncul di preview, cek binding data pada elemen field atau kolom tabel.",
    ],
    sections: [
      {
        type: "table",
        title: "Jenis elemen",
        columns: ["Elemen", "Dipakai untuk", "Catatan"],
        rows: [
          ["Teks", "Judul, label, instruksi pendek", "Untuk teks statis yang tidak berubah per surat."],
          ["Field Data", "Nomor surat, judul, pengaju, departemen, kantor", "Pilih binding agar nilai diisi otomatis."],
          ["Tabel Berulang", "Barang, unit, rekomendasi, lampiran", "Satu konfigurasi tabel bisa menghasilkan banyak baris."],
          ["Catatan", "Area teks panjang", "Gunakan tinggi cukup agar tidak memotong isi."],
          ["Tanda Tangan", "Kotak signer", "Mengambil data signer dari alur persetujuan."],
        ],
      },
      {
        type: "callout",
        title: "Belum mengganti produksi otomatis",
        description: "Template Builder adalah fondasi native renderer. Sampai generator PDF membaca JSON builder, PGD dan rekomendasi tetap mengikuti jalur produksi yang sudah aktif.",
        tone: "warning",
      },
    ],
  },
  {
    id: "admin-workflows",
    title: "Alur Persetujuan",
    menu: "Konfigurasi > Alur Persetujuan",
    audience: "admin",
    icon: Route,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur atau membaca dokumentasi alur approval yang dipakai oleh form dan kegunaan.",
    whenToUse: [
      "Memeriksa urutan membuat, memeriksa, dan menyetujui.",
      "Memahami matrix lama saat migrasi ke konfigurasi kegunaan baru.",
      "Membandingkan kebutuhan bisnis dengan alur yang aktif.",
    ],
    steps: [
      "Buka Alur Persetujuan.",
      "Cari matrix atau alur yang ingin dicek.",
      "Bandingkan dengan konfigurasi Kegunaan Form yang aktif.",
    ],
    examples: [
      "Form PGD dapat menggunakan matrix 3 sampai 8 tanda tangan tanpa menggandakan file template.",
    ],
    troubleshooting: [
      "Jika alur yang tampil tidak sesuai registrasi, cek Kegunaan Form karena alur aktif dikendalikan dari sana.",
      "Jika matrix lama masih membingungkan, jadikan halaman ini sebagai referensi migrasi, bukan sumber utama aksi user.",
    ],
  },
  {
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
      "Mengatur alur tanda tangan 3 sampai 8 tahap.",
      "Menambahkan tim pemeriksa sebelum penandatangan boleh aksi.",
      "Mengatur dokumen rekomendasi atau prasyarat yang harus selesai sebelum surat induk lanjut.",
    ],
    steps: [
      "Buka Kegunaan Form.",
      "Pilih form, departemen, kategori, dan jenis surat.",
      "Atur step tanda tangan dan kandidat signer.",
      "Tambahkan tim pemeriksa bila step perlu pemeriksaan data atau lampiran.",
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
    ],
  },
  {
    id: "admin-numbering",
    title: "Penomoran Surat",
    menu: "Konfigurasi > Penomoran",
    audience: "admin",
    icon: FileSignature,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur counter nomor surat per scope agar nomor sistem baru tidak bentrok dengan nomor lama.",
    whenToUse: [
      "Menentukan nomor awal saat sistem mulai dipakai produksi.",
      "Mengatur counter awal per departemen, entitas, jenis surat, proyek, atau scope lain.",
      "Mengecek penomoran saat pergantian tahun.",
    ],
    steps: [
      "Buka Konfigurasi Penomoran.",
      "Cari scope nomor yang ingin diatur.",
      "Isi counter awal sesuai nomor terakhir yang sudah dipakai secara manual.",
      "Simpan sebelum user membuat dokumen baru pada scope tersebut.",
    ],
    examples: [
      "Jika nomor manual terakhir adalah 125, set counter agar nomor berikutnya mulai 126.",
      "Saat tahun baru, counter dapat reset sesuai aturan penomoran tahunan.",
    ],
    troubleshooting: [
      "Jika ada risiko nomor duplikat, hentikan registrasi pada scope tersebut dan cek counter.",
      "Jika nomor sudah dipesan di draft, nomor tidak dipakai ulang meski draft dibatalkan.",
    ],
  },
  {
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
  },
  {
    id: "admin-sla",
    title: "SLA Departemen",
    menu: "SLA Departemen dan Konfigurasi > SLA Departemen",
    audience: "admin",
    icon: BarChart3,
    version: "v1.0.0",
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
  },
  {
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
  },
  {
    id: "admin-audit",
    title: "Audit Log",
    menu: "Audit Log",
    audience: "admin",
    icon: Activity,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Jejak perubahan sistem untuk admin, termasuk perubahan user, konfigurasi, dan data penting.",
    whenToUse: [
      "Melacak siapa yang mengubah data.",
      "Membandingkan nilai sebelum dan sesudah perubahan.",
      "Menyelidiki perubahan konfigurasi yang berdampak ke proses bisnis.",
    ],
    steps: [
      "Buka Audit Log.",
      "Filter data jika diperlukan.",
      "Klik item log untuk melihat detail perubahan.",
    ],
    examples: [
      "Saat departemen user berubah, audit menampilkan nilai lama dan baru dalam nama yang mudah dibaca.",
      "Saat password berubah, audit cukup mencatat bahwa password diubah tanpa membuka nilai rahasia.",
    ],
    troubleshooting: [
      "Jika aktivitas user biasa muncul di dashboard, itu bukan Audit Log. Dashboard hanya untuk aktivitas kerja.",
      "Jika perubahan tidak tercatat, cek apakah proses tersebut sudah memakai service audit terpadu.",
    ],
  },
  {
    id: "admin-email",
    title: "Email Notification",
    menu: "Konfigurasi > Email Notification",
    audience: "admin",
    icon: Mail,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Mengatur email notifikasi departemen, isi email profesional, link sistem, dokumen, dan lampiran.",
    whenToUse: [
      "Mengirim notifikasi ketika dokumen perlu ditandatangani atau ditindaklanjuti.",
      "Menyediakan detail dokumen langsung di email.",
      "Mengubah domain sistem yang muncul di tombol email.",
    ],
    steps: [
      "Buka Email Notification.",
      "Atur SMTP, alamat pengirim, dan link sistem.",
      "Pastikan email departemen sudah diisi pada master departemen.",
      "Uji pengiriman pada alur approval.",
    ],
    examples: [
      "Email persetujuan berisi nomor surat, pengaju, departemen, ringkasan barang atau unit, penandatangan, PDF, dan lampiran.",
      "Jika domain SIGAP berubah, ubah base URL agar tombol email mengikuti domain baru.",
    ],
    troubleshooting: [
      "Jika email tidak terkirim, cek SMTP password, host, port, dan log server.",
      "Jika lampiran masih berupa link mentah, cek konfigurasi attachment email dan endpoint file.",
    ],
  },
];

export const TROUBLESHOOTING_DOCS: DocsEntry[] = [
  {
    id: "login-access",
    title: "Login dan akses ditolak",
    menu: "Semua menu",
    audience: "troubleshooting",
    icon: KeyRound,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Panduan cepat jika user tidak bisa login, akun nonaktif, atau menu tidak muncul.",
    whenToUse: [
      "Login berhasil tetapi menu tidak sesuai.",
      "Muncul pesan akun nonaktif.",
      "Akses halaman admin ditolak.",
      "User lupa kata sandi dan perlu membuat kata sandi baru melalui email.",
    ],
    steps: [
      "Jika lupa kata sandi, buka halaman login lalu pilih Lupa sandi.",
      "Masukkan email kerja yang terdaftar dan cek inbox email.",
      "Buka tautan reset dari email, isi kata sandi baru, lalu login ulang.",
      "Pastikan akun ada di User Organization dan statusnya aktif.",
      "Cek role akun, departemen, kantor, dan jabatan.",
      "Jika user baru import, minta user logout lalu login ulang.",
    ],
    examples: [
      "User cabang tidak bisa memilih departemen karena kantor dan departemen mengikuti profil.",
      "Admin bisa melihat konfigurasi, user biasa tidak bisa membuka halaman admin.",
      "Jika user lupa kata sandi, admin tidak perlu mengetahui password lama; user cukup memakai link reset dari email.",
    ],
    troubleshooting: [
      "Jika email reset tidak masuk, cek folder spam dan pastikan email akun benar.",
      "Jika link reset kedaluwarsa, kirim ulang link dari halaman login.",
      "Jika akun nonaktif, lakukan import data aktif atau aktifkan ulang secara admin.",
      "Jika role salah, ubah role di User Organization lalu minta user login ulang.",
    ],
    sections: [
      {
        type: "table",
        title: "Reset kata sandi",
        columns: ["Bagian", "Perilaku"],
        rows: [
          ["Permintaan link", "User menekan Lupa sandi di halaman login dan memasukkan email kerja."],
          ["Keamanan pesan", "SIGAP menampilkan pesan berhasil tanpa membedakan apakah email terdaftar agar tidak membuka daftar akun."],
          ["Pengiriman email", "Server SIGAP membuat link recovery melalui Supabase Admin dan mengirim email lewat SMTP Hostinger."],
          ["Tautan email", "Link mengarah ke halaman Reset Kata Sandi untuk membuat password baru."],
          ["Template email", "Untuk menghindari redirect lama, template Supabase sebaiknya memakai `/reset-password?token_hash={{ .TokenHash }}&type=recovery`."],
          ["Tampilan email", "Email reset password memakai HTML branded SIGAP dengan logo Marison, tombol utama, fallback link, dan peringatan keamanan singkat."],
          ["Click tracking", "Matikan click tracking untuk email auth agar link reset tidak dibungkus domain tracking email."],
          ["Kata sandi sama", "Jika muncul peringatan kata sandi harus berbeda, berarti password yang diisi sama dengan password akun yang sedang aktif."],
          ["Tombol simpan", "Saat proses simpan berjalan, tombol dan input dikunci agar tidak ada pengiriman ganda."],
          ["Setelah berhasil", "Session reset ditutup dan user diminta login ulang memakai kata sandi baru."],
          ["Audit", "Perubahan kata sandi dicatat sebagai event audit tanpa menyimpan nilai password."],
        ],
      },
    ],
  },
  {
    id: "document-file",
    title: "Dokumen atau lampiran tidak bisa dibuka",
    menu: "Surat",
    audience: "troubleshooting",
    icon: BookOpenText,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Langkah pemeriksaan ketika preview PDF, snapshot, atau lampiran gagal dibuka.",
    whenToUse: [
      "Muncul pesan dokumen tidak ditemukan.",
      "PDF masih loading terlalu lama.",
      "Lampiran tidak dapat diakses.",
    ],
    steps: [
      "Coba buka ulang dokumen setelah beberapa detik.",
      "Pastikan dokumen sudah selesai diproses worker PDF.",
      "Cek apakah file berada di storage self-hosted dan endpoint file aktif.",
    ],
    examples: [
      "Token akses file dapat berubah setiap klik, tetapi itu bukan berarti PDF selalu dibuat ulang.",
      "Jika file baru diunggah pada approval, tunggu indikator upload selesai sebelum menyetujui.",
      "Admin memakai Buat Ulang PDF jika surat lama harus mengikuti renderer atau formasi tanda tangan terbaru.",
    ],
    troubleshooting: [
      "Jika masih gagal, admin perlu cek storage bucket, service role, dan log server.",
      "Jika PDF lama masih tampil, tutup tab PDF dan buka ulang dokumen.",
      "Jika bentuk PDF atau kotak tanda tangan surat lama masih memakai versi lama, admin perlu memilih Buat Ulang PDF dari detail Monitoring.",
    ],
    sections: [
      {
        type: "table",
        title: "Buka PDF dan Buat Ulang PDF",
        columns: ["Aksi", "Yang dikerjakan sistem", "Kapan digunakan"],
        rows: [
          ["Buka dokumen", "Membuka PDF siap pakai atau mengantrekan konversi dari workbook yang tersimpan.", "Pemeriksaan dokumen sehari-hari."],
          ["Buat Ulang PDF", "Menjalankan kembali renderer dokumen dari snapshot database dan menerapkan status tanda tangan yang sudah selesai.", "Surat lama perlu mengikuti renderer atau formasi tanda tangan terbaru."],
        ],
      },
      {
        type: "callout",
        title: "Khusus admin",
        description: "Buat Ulang PDF tidak mengulang approval dan tidak mengubah status surat. Sistem mempertahankan identitas serta waktu tanda tangan yang sudah tercatat.",
        tone: "warning",
      },
    ],
  },
  {
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
  },
  {
    id: "deploy-production",
    title: "Deploy production",
    menu: "Operasional",
    audience: "troubleshooting",
    icon: Database,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Panduan deploy production dari Docker context server tanpa merestart service yang tidak berubah.",
    whenToUse: [
      "Mendeploy perubahan frontend, halaman dokumentasi, atau server aplikasi utama.",
      "Memastikan deploy memakai `.env.production` untuk interpolasi environment Compose.",
      "Memutuskan apakah PDF worker perlu ikut diredeploy.",
    ],
    steps: [
      "Pastikan perubahan sudah dibuild atau sudah siap dideploy dari workspace.",
      "Untuk app utama, jalankan command deploy dengan Docker context `ubuntu-server` dan `--env-file .env.production`.",
      "Cek status container `agenda-flow-prod` sampai healthy.",
      "Buka domain production atau route yang berubah untuk pemeriksaan.",
      "Redeploy worker PDF hanya jika memang ada perubahan worker/runtime PDF.",
    ],
    examples: [
      "Perubahan dokumentasi `/docs` cukup deploy app utama, tidak perlu deploy PDF worker.",
      "Perubahan `server.mjs` deploy app utama karena container app yang menjalankan server HTTP.",
      "Perubahan `pdf-worker.mjs` perlu deploy `docker-compose.worker.yml` secara terpisah.",
    ],
    troubleshooting: [
      "Jika container restart karena storage kosong, pastikan command memakai `--env-file .env.production`.",
      "Jika route publik masih lama, cek health container, Cloudflare tunnel, dan cache browser.",
      "Jika PDF baru tidak diproses setelah deploy app utama, cek apakah worker memang perlu redeploy atau cukup worker yang sedang running.",
    ],
    sections: [
      {
        type: "table",
        title: "Command deploy",
        columns: ["Kebutuhan", "Command"],
        rows: [
          [
            "Deploy aplikasi utama",
            "docker --context ubuntu-server compose -f docker-compose.prod.yml --env-file .env.production up -d --build",
          ],
          [
            "Deploy PDF worker",
            "docker --context ubuntu-server compose -f docker-compose.worker.yml --env-file .env.production up -d --build",
          ],
        ],
      },
      {
        type: "table",
        title: "Kapan worker PDF ikut deploy",
        columns: ["Perubahan", "Deploy yang diperlukan"],
        rows: [
          ["Frontend, dokumentasi, route aplikasi, atau `server.mjs`", "Deploy aplikasi utama saja."],
          ["`pdf-worker.mjs`, dependency/runtime PDF, LibreOffice/font runtime, atau konfigurasi worker", "Deploy PDF worker."],
          ["Env storage production", "Redeploy service yang membaca env tersebut dengan `--env-file .env.production`."],
        ],
      },
    ],
  },
];

export const ALL_DOCS = [...USER_DOCS, ...ADMIN_DOCS, ...TROUBLESHOOTING_DOCS];

export const DOCS_CHANGELOG = [
  {
    version: "v1.15.0",
    date: "14 Juli 2026",
    changes: [
      "Memperketat akses profil agar user biasa hanya dapat memperbarui data profil aman seperti nama, foto, nomor telepon, dan preferensi tema.",
      "Mencegah metadata signup mengangkat akun baru menjadi admin; role awal akun baru selalu `user` sampai admin mengubahnya dari User Organization.",
      "Memperketat upload storage dokumen dan lampiran agar path serta kepemilikan draft/surat diperiksa oleh server sebelum file diterima.",
      "Menutup pengiriman email internal tanpa konteks surat agar endpoint email tidak dapat dipakai sebagai mail relay umum.",
      "Memvalidasi token user melalui Supabase Auth pada endpoint realtime, push, upload, data source, dan notifikasi ringan.",
      "Menstandarkan akses route admin agar halaman master data, monitoring admin, SLA, dan konfigurasi hanya bisa dibuka oleh admin aktif.",
      "Memisahkan tipe domain, helper storage, dan generator lampiran Unit dari service surat utama agar alur dokumen lebih mudah diaudit dan dirawat.",
      "Menghapus route contoh Next.js berbasis service role yang tidak memiliki autentikasi agar tidak ikut terkirim ke source production.",
      "Memperbaiki penggantian lampiran tanda tangan agar sistem hanya menghapus metadata lampiran lama, bukan lampiran baru yang baru selesai diunggah.",
      "Mengunci penomoran surat dengan advisory transaction lock di database dan mengikat pembuat nomor ke `auth.uid()`.",
      "Menormalkan otorisasi aplikasi ke dua role resmi, yaitu `admin` dan `user`.",
      "Menambahkan validasi signature file/magic bytes untuk upload agar ekstensi dan MIME type tidak bisa dipalsukan.",
      "Membatasi penggantian lampiran tahap approval hanya untuk admin aktif, signer tahap aktif, atau tim pemeriksa tahap aktif yang berwenang.",
      "Menambahkan pembatasan event dan rate limit singkat pada email internal agar satu aksi tidak memicu pengiriman berulang.",
    ],
  },
  {
    version: "v1.14.0",
    date: "13 Juli 2026",
    changes: [
      "Memperjelas keterangan cell pada template Excel alokasi Unit untuk Struktur Atas, Struktur Bawah, Nomor Kode Produksi, Blok, dan Tanggal Produksi.",
      "Menambahkan contoh input nominal `1000000`, `1.000.000`, dan `1,000,000` pada template agar tim pemeriksa tidak bingung saat mengisi nilai struktur.",
      "Menambahkan contoh input tanggal `01/01/25`, `01/01/2025`, dan `01-01-2025` serta catatan bahwa datepicker mengikuti aplikasi Excel yang digunakan.",
      "Mengaktifkan alur Lupa Sandi dari halaman login agar user dapat menerima email reset password dan membuat kata sandi baru secara mandiri.",
      "Menambahkan dukungan reset password berbasis `token_hash` agar email auth tidak bergantung pada redirect lama dan lebih aman terhadap link scanner.",
      "Memperjelas pesan reset password ketika kata sandi baru sama dengan yang sedang aktif serta mengunci form saat proses simpan agar tidak terjadi submit ganda.",
      "Mengganti template email reset password menjadi HTML branded SIGAP berlogo Marison dan menghapus teks penanda deploy test dari halaman login.",
      "Memindahkan pengiriman email reset password ke endpoint server SIGAP dengan SMTP Hostinger agar tidak bergantung pada mailer bawaan Supabase.",
    ],
  },
  {
    version: "v1.13.0",
    date: "10 Juli 2026",
    changes: [
      "Menambahkan download template dan import Excel/CSV untuk pengisian massal detail kavling pada tugas pemeriksaan Unit.",
    ],
  },
  {
    version: "v1.12.0",
    date: "9 Juli 2026",
    changes: [
      "Memperbolehkan KC/KCP tanpa master proyek membuat pengajuan non-unit dengan kode proyek virtual `000`.",
      "Membedakan validasi proyek: Unit tetap wajib memilih proyek Unit, cabang yang punya proyek wajib memilih proyek cabang, sedangkan cabang tanpa proyek memakai `000`.",
      "Menambahkan state read-only pada Registrasi Surat untuk cabang tanpa proyek agar user tidak melihat dropdown proyek kosong.",
      "Menyimpan konteks `project_code: 000`, `project_name: Tanpa proyek`, dan `project_is_default: true` pada input/snapshot tanpa membuat master proyek palsu.",
      "Memperbarui dokumentasi nomor surat agar variasi KC/KCP tanpa proyek dan scope counter virtual `000` dapat dipahami user/admin.",
    ],
  },
  {
    version: "v1.11.0",
    date: "8 Juli 2026",
    changes: [
      "Menambahkan halaman `Tindak Lanjut` untuk keputusan pemohon setelah pengajuan dikembalikan, terpisah dari Status Pengajuan.",
      "Memindahkan badge revisi yang menjadi tugas pemohon dari Status Pengajuan ke Tindak Lanjut agar user langsung masuk ke antrean keputusan yang benar.",
      "Menambahkan dokumentasi Tindak Lanjut yang menjelaskan kapan memilih Lanjutkan proses, kapan membatalkan pengajuan, dan dampaknya ke tanda tangan ulang.",
      "Menormalisasi link notifikasi revisi pemohon ke `/surat/tindak-lanjut` agar notifikasi tidak lagi membuka halaman monitoring.",
      "Memperbaiki format nilai revisi berdasarkan konteks, misalnya unit ditampilkan sebagai `8 unit dari 10 unit` dan nominal tetap ditampilkan sebagai rupiah.",
      "Menguatkan penerapan revisi di database agar perubahan jumlah unit, jumlah barang, nominal, dan rekomendasi tidak saling tertukar saat pemohon melanjutkan proses.",
      "Membuat item permohonan aset yang tidak memiliki keputusan rekomendasi tampil sebagai item belum direkomendasikan pada detail dan ringkasan.",
      "Membersihkan instruksi lama di Status Pengajuan yang menyarankan registrasi ulang setelah revisi.",
    ],
  },
  {
    version: "v1.10.0",
    date: "7 Juli 2026",
    changes: [
      "Menjaga Form Dokumen dan Kegunaan tetap terlihat sebagai informasi terkunci setelah nomor surat atau draft dipulihkan, sehingga konteks registrasi tidak berkedip lalu hilang saat halaman direfresh.",
      "Menyembunyikan kembali informasi Form Dokumen dan Kegunaan pada dokumen rekomendasi tertaut karena form dan kegunaan sudah dikunci oleh task rekomendasi.",
      "Mengunci deteksi dokumen rekomendasi tertaut dari parameter URL sejak render pertama agar pilihan registrasi biasa tidak sempat tampil saat refresh.",
      "Memisahkan pengerjaan dokumen rekomendasi ke path `/surat/rekomendasi/registrasi` dan mengalihkan link rekomendasi lama dari path registrasi biasa.",
      "Menyeragamkan stamp tanda tangan menjadi `DISETUJUI SISTEM` dengan tanggal-jam WIB pada jalur Excel lama dan renderer PDF native.",
      "Menstandarkan urutan tabel item pada ringkasan pengajuan menjadi No., Nama Barang, Satuan, Jumlah, Status, dan Keterangan walaupun urutan data dari sumber berbeda.",
      "Memisahkan konteks item induk dan input Nama Barang / Alat Kerja pada rekomendasi: navigator menampilkan item permohonan, sedangkan nama barang rekomendasi tetap diisi manual oleh tim IT/PO.",
      "Menghapus tombol reset judul/tempat; field kembali otomatis jika dikosongkan oleh user.",
      "Menambahkan keputusan Tidak Direkomendasikan pada rekomendasi aset per item; opsi ini wajib alasan tetapi tidak wajib gambar.",
      "Mewajibkan gambar hanya untuk keputusan Service, Ganti Komponen, dan Beli Baru pada dokumen rekomendasi.",
      "Menyimpan keputusan rekomendasi ke snapshot surat induk agar item yang tidak direkomendasikan dapat tampil tercoret pada detail pengajuan dan PDF PGD.",
      "Menampilkan keputusan rekomendasi per item pada summary pendaftaran dan email dengan label yang lebih jelas.",
      "Membuka kembali tugas rekomendasi ketika penanda tangan mengembalikan perbaikan ke tim IT/PBO.",
      "Mengisi draft rekomendasi revisi dari data rekomendasi terakhir agar tim IT tidak mengulang input dari awal.",
      "Mewajibkan rekomendasi revisi ditandatangani ulang oleh Mgr. PO sebelum surat induk kembali ke pemohon untuk lanjut atau batal.",
      "Menonaktifkan tautan rekomendasi lama saat rekomendasi revisi dikonfirmasi agar dokumen tertaut aktif selalu versi terbaru.",
    ],
  },
  {
    version: "v1.9.0",
    date: "6 Juli 2026",
    changes: [
      "Memperbaiki detail pengajuan agar field items tampil sebagai Daftar Barang dengan kolom tetap No., Nama Barang, Satuan, Jumlah, Status, dan Keterangan.",
      "Menormalkan alias data barang seperti sat/satuan dan nama_barang/nama/barang agar tidak muncul kolom dobel pada detail pengajuan.",
      "Memindahkan catatan revisi item ke baris khusus di bawah item terkait supaya alasan perubahan lebih mudah dibaca.",
      "Menyesuaikan format nilai revisi berdasarkan konteks satuan, misalnya 8 unit dari 10 unit untuk pengajuan Unit dan rupiah untuk nominal besar.",
      "Mengganti prompt native browser pada aksi Lanjutkan proses dan Batalkan pengajuan menjadi dialog aplikasi yang konsisten dengan validasi catatan.",
      "Menerapkan perubahan item setelah pemohon menekan Lanjutkan proses sehingga detail dokumen dan PDF baru memakai nilai hasil revisi.",
      "Membersihkan cache job PDF lama setelah revisi diterima agar preview berikutnya tidak memakai dokumen sebelum perbaikan.",
      "Menjaga catatan revisi tetap terbaca sebagai revisi terapan setelah status surat kembali ke Proses.",
      "Mencegah catatan revisi tanpa perubahan item seperti kirim ulang tampil sebagai Keterangan barang; catatan tetap tersedia pada riwayat perbaikan.",
      "Menghentikan hitungan SLA signer/departemen ketika surat berada di status Menunggu Perbaikan dan tugas sedang berada di pemohon.",
      "Memulai ulang waktu SLA dari waktu pemohon memilih Lanjutkan proses agar antrean tidak langsung terlambat karena timestamp sebelum perbaikan.",
      "Mengganti tampilan catatan riwayat perbaikan generik seperti Instruksi utama dengan alasan perubahan item yang sebenarnya.",
      "Menghapus field Instruksi utama dari dialog pengembalian proses yang memiliki item terstruktur; alasan utama kini otomatis diambil dari alasan item yang diubah.",
      "Mengubah kelanjutan setelah perbaikan pemohon agar approval selalu dimulai ulang dari tahap 1 karena data dokumen sudah berubah.",
      "Menyederhanakan input pemeriksaan Unit menjadi tabel satu baris per kavling dengan header sticky untuk struktur atas, struktur bawah, nomor, blok, tanggal, dan kode produksi.",
      "Memastikan signer Unit melihat ringkasan alokasi dari tim pemeriksa dan tidak diminta memilih kavling ulang setelah data pemeriksaan tersimpan.",
      "Mengizinkan pengembalian ke tim pemeriksa dengan instruksi perbaikan walaupun keputusan item tetap Tidak berubah.",
      "Mempertahankan data pemeriksaan terakhir saat proses dikembalikan ke tim pemeriksa, sehingga kavling, detail kode produksi, dan lampiran tahap tidak perlu diinput ulang dari nol.",
      "Memperbaiki tombol Pemeriksaan Data pada revisi tim pemeriksa agar menyelesaikan event revisi lama setelah data diperbarui, bukan mencoba verifikasi ulang yang sudah berstatus diperiksa.",
      "Mengubah label tombol aksi tim pemeriksa menjadi Simpan & lanjutkan agar jelas bahwa pemeriksaan akan diteruskan ke signer berikutnya.",
      "Menambahkan autosave halus untuk data pemeriksaan agar alokasi unit, detail kode produksi, dan catatan tidak hilang saat pemeriksa berpindah halaman.",
      "Memperbarui Export Summary menjadi laporan formal berlogo Marison dengan judul bagian yang jelas, jarak antartabel yang lebih lega, waktu dibuat, identitas pengajuan, detail barang/unit, dan total rekap unit tanpa menyertakan lampiran, alur penandatangan, atau riwayat revisi.",
      "Memperbaiki status internal revisi agar perpindahan dari tim pemeriksa ke pemohon memakai status Menunggu Persetujuan Pemohon tanpa ditolak constraint database.",
      "Mengembalikan task langsung ke signer aktif setelah tim pemeriksa menyelesaikan revisi tanpa perubahan item atau nilai, sehingga tidak perlu menunggu persetujuan pemohon ulang.",
      "Menampilkan nama pemeriksa yang sedang ditunggu pada alasan tombol persetujuan terkunci, bukan teks generik tim pemeriksa.",
      "Mengurangi error badge/push akibat timeout Supabase Auth dengan validasi JWT lokal khusus endpoint attention, web push, dan data source unit.",
      "Merapikan UI registrasi step Persetujuan dan Berkas agar Perihal, tempat, dan tanggal dokumen lebih mudah dibaca serta tidak terlihat saling menumpuk.",
      "Menyesuaikan form rekomendasi agar Nama Barang / Alat Kerja dapat diisi manual oleh tim IT/PO, karena spesifikasi barang ditentukan pada tahap rekomendasi.",
    ],
  },
  {
    version: "v1.8.0",
    date: "3 Juli 2026",
    changes: [
      "Memperbaiki upload foto profil agar identitas file selalu mengikuti akun Supabase Auth yang sedang login.",
      "Memindahkan avatar dari URL publik Supabase Cloud ke storage private Supabase self-hosted.",
      "Menyajikan avatar melalui endpoint domain SIGAP agar alamat storage internal tidak diekspos ke browser.",
      "Menambahkan validasi server untuk format JPG, PNG, WebP, batas 5 MB, serta pemeriksaan isi file.",
      "Menambahkan thumbnail WebP maksimal 256 x 256 untuk tampilan aplikasi agar penggunaan bandwidth lebih ringan.",
      "Mempertahankan file asli untuk saat foto dibuka langsung pada tab baru.",
      "Memigrasikan avatar lama yang masih menunjuk Supabase Cloud ke storage self-hosted.",
      "Memperbaiki Aktivitas Departemen agar semua akun dapat melihat agregat agenda seluruh departemen, termasuk PO.",
      "Memindahkan penghitungan Aktivitas Departemen ke endpoint server terautentikasi agar detail agenda lintas departemen tetap terlindungi.",
      "Memperbaiki modal Aktivitas Terbaru agar konten panjang dapat discroll dan footer tetap terjangkau pada desktop maupun mobile.",
      "Mengubah badge antrean Persetujuan dari merah menjadi warna primary karena badge menunjukkan jumlah tugas, bukan pelanggaran SLA.",
      "Mengubah pengisian rekomendasi menjadi fokus per item yang otomatis mengikuti daftar barang pada permohonan induk.",
      "Menambahkan navigator, progres kelengkapan, dan penguncian nama barang tanpa memecah nomor atau alur dokumen rekomendasi.",
      "Menyederhanakan penanda nomor rekomendasi menjadi ikon gembok dengan tooltip yang menjelaskan bahwa nomor dibuat otomatis dari pengajuan induk.",
      "Menormalkan kursor ikon gembok rekomendasi tanpa menghilangkan tooltip dan akses fokus keyboard.",
      "Menambahkan input nominal Indonesia pada Struktur Atas dan Struktur Bawah sehingga nilai bertitik, berkoma, atau tanpa pemisah dihitung secara konsisten di UI, PDF, dan email.",
      "Menyamakan istilah menjadi tim pemeriksa dan pemeriksaan data pada UI dan dokumentasi.",
      "Menambahkan fondasi alur perbaikan approval dengan status Menunggu Perbaikan, target revisi manual, riwayat revisi, serta notifikasi ke pihak yang perlu memperbaiki.",
      "Menampilkan kapasitas unit tersedia saat pemohon memilih proyek Unit agar jumlah pengajuan punya konteks stok proyek.",
      "Menambahkan riwayat perbaikan pada detail Persetujuan dan Status Pengajuan.",
      "Menambahkan perubahan item terstruktur pada pengembalian approval: item dapat dicoret, nilai diajukan/disetujui dicatat, dan alasan perubahan tampil di detail serta PDF PGD.",
      "Menambahkan persetujuan pemohon setelah perbaikan sebelum proses approval dilanjutkan atau nomor dibatalkan.",
      "Mengembalikan proses approval untuk ditinjau ulang setelah perubahan diterima pemohon.",
      "Membatasi opsi pengembalian ke tim pemeriksa hanya untuk tahap yang memang memiliki pemeriksa pada snapshot transaksi.",
      "Menyederhanakan dialog perbaikan item agar nilai diajukan menjadi referensi, bukan input wajib untuk signer.",
      "Menyesuaikan placeholder instruksi dan alasan perbaikan berdasarkan konteks pengajuan Unit, Aset, Non Aset, atau Rekomendasi.",
      "Mengotomatisasi keputusan revisi item Unit berdasarkan jumlah yang disetujui agar signer tidak memilih status manual.",
      "Memindahkan hitungan revisi yang menjadi tugas pemohon dari badge Persetujuan ke badge Status Pengajuan.",
      "Menetapkan aturan satu versi per tanggal; perubahan pada tanggal yang sama diperbarui pada entri versi yang sama.",
    ],
  },
  {
    version: "v1.7.0",
    date: "1 Juli 2026",
    changes: [
      "Menambahkan navigasi berurutan pada subtopik Rekomendasi dan menunda Topik terkait sampai bagian Masalah umum rekomendasi selesai dibaca.",
      "Menyamakan tinggi kotak tanda tangan satu dan dua baris serta membatasi tempat/tanggal hanya pada lebar kotak aktif.",
      "Menjaga item Nama Barang tetap rata kiri meskipun field menggunakan kontrol pilihan/select.",
      "Menyatukan aturan formasi tanda tangan dan alignment tabel antara Uji PDF dan generator dokumen transaksi.",
      "Mengubah baris kedua yang lebih pendek menjadi rata kanan dan memastikan baris tiga kotak menggunakan grid 3.",
      "Memperbarui Form dan Template dengan formasi tanda tangan konsisten untuk 3 sampai 8 signer.",
      "Menjelaskan bahwa Uji PDF dan dokumen transaksi memakai aturan pembagian kotak yang sama.",
      "Menambahkan panduan perbedaan Buka Dokumen dan Buat Ulang PDF.",
      "Mendokumentasikan regenerasi surat lama dari template aktif tanpa mengulang atau mengubah histori approval.",
      "Menambahkan penanganan PDF lama, cache tab browser, dan kondisi ketika admin perlu membangun ulang dokumen.",
      "Menambahkan dokumentasi menu Rekomendasi untuk tugas pembuatan dokumen rekomendasi aset tertaut.",
      "Menjelaskan shared lock rekomendasi: kandidat pertama yang mengambil tugas menjadi pemilik draft, kandidat lain melihat status terkunci.",
      "Memperbarui Registrasi Surat dengan keputusan rekomendasi aset, data item rekomendasi, lampiran gambar wajib, dan link referensi.",
      "Memperbarui Persetujuan dengan panel rekomendasi, kondisi surat induk terkunci, dan alur lanjut setelah rekomendasi selesai.",
      "Memperbarui Kegunaan Form dengan konfigurasi dokumen tertaut, prasyarat rekomendasi, scope kandidat lintas kantor, dan antrean PBO.",
      "Menambahkan pemeriksaan web push, badge rekomendasi, dan notifikasi realtime pada dokumentasi troubleshooting.",
      "Menambahkan panduan deploy production dengan Docker context ubuntu-server, env production, dan aturan kapan PDF worker perlu ikut redeploy.",
    ],
  },
  {
    version: "v1.5.0",
    date: "25 Juni 2026",
    changes: [
      "Menambahkan halaman dokumentasi publik untuk end user, admin, dan troubleshooting.",
      "Memisahkan dokumentasi operasional user dari dokumentasi konfigurasi admin.",
      "Menambahkan contoh penggunaan pada menu agenda, surat, persetujuan, monitoring, dan konfigurasi.",
      "Membuat layout dokumentasi lebih lebar agar nyaman dibaca pada desktop.",
      "Menambahkan pencarian cepat lintas topik dengan shortcut Ctrl+K.",
      "Mengubah pencarian dokumentasi menjadi modal cepat yang terbuka dari input pencarian atau shortcut Ctrl+K.",
      "Mengubah cara pakai dan contoh menjadi kartu alur bernomor agar instruksi lebih mudah diikuti.",
      "Mengubah deep-link dokumentasi dari hash menjadi route penuh seperti /docs/dashboard/overview.",
      "Menambahkan route subtopik dokumentasi agar topik dan bagian bisa dibuka langsung setelah refresh atau dibagikan.",
      "Menambahkan navigasi subtopik pada topik aktif di sidebar dokumentasi desktop.",
      "Menambahkan redirect kompatibilitas dari link hash lama ke route dokumentasi baru.",
      "Memisahkan isi subhalaman dokumentasi agar setiap route hanya menampilkan section yang dipilih.",
      "Mengubah Overview menjadi ringkasan topik dan daftar subtopik, bukan duplikasi seluruh isi topik.",
      "Menambahkan subtopik otomatis untuk topik yang belum memiliki section custom.",
      "Memperdalam isi dokumentasi agar setiap topik berisi detail operasional, bukan hanya ringkasan.",
      "Menambahkan penjelasan struktur nomor surat, scope counter, reset tahunan, nomor VOID, dan siklus draft.",
      "Menambahkan variasi format nomor untuk pusat, proyek/unit, KC, dan KCP.",
      "Mengurangi pola subhalaman generik agar topik yang sudah punya detail menampilkan section operasional sebagai konten utama.",
      "Menggabungkan nomor surat, counter, dan draft ke satu subtopik utuh agar penjelasan tidak terpencar.",
      "Menambahkan dukungan section gabungan untuk dokumentasi yang butuh beberapa tabel dan catatan dalam satu halaman.",
      "Menambahkan tabel detail untuk agenda, kalender, monitoring, file, riwayat, setting, konfigurasi admin, SLA, audit, email, dan troubleshooting.",
      "Mengubah perilaku scroll subhalaman agar selalu mulai dari judul halaman.",
      "Memperjelas dokumentasi Registrasi Surat dengan alur nomor draft, kategori pengajuan, data otomatis, dan kendala umum.",
      "Memperjelas dokumentasi Persetujuan dengan perbedaan signer dan tim pemeriksa, aturan pengajuan Unit, dan alasan aksi terkunci.",
      "Menyamakan animasi dialog utama agar pop-up terasa konsisten dan lebih tenang.",
      "Menambahkan penanda topik aktif saat user membaca dokumentasi di desktop.",
      "Menambahkan standar agar pembaruan fitur juga dicatat pada halaman dokumentasi end user.",
    ],
  },
];

export const DOCS_PRINCIPLES = [
  "Dokumentasi harus menjawab masalah user, bukan hanya menjelaskan tombol.",
  "Dokumentasi admin dipisahkan dari dokumentasi user biasa agar tidak membingungkan.",
  "Setiap fitur baru harus menambahkan tujuan, cara pakai, contoh, dan troubleshooting.",
  "Perubahan pada tanggal yang sama harus memperbarui entri versi yang sama, bukan membuat versi baru.",
  "Dokumentasi teknis pengembang tetap berada di markdown, sedangkan panduan operasional user berada di halaman ini.",
];
