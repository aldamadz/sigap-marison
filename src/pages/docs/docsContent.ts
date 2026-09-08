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
  Mail,
  MapPin,
  Network,
  Route,
  SearchCheck,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  type DocsAudience,
  type DocsSection,
  type DocsEntry,
  type DocsChangelogEntry,
  DOCS_VERSION,
  DOCS_UPDATED_AT,
  DOCS_OVERVIEW_SLUG,
  slugifyDocsSegment,
  DOCS_ENTRY_SLUGS,
  DOCS_SECTION_SLUGS,
  getDocsEntrySlug,
  getDocsSectionSlug,
  getDocsEntryPath,
  getDocsVersionPath,
  DOCS_PRINCIPLES,
  DOCS_CHANGELOG,
} from "./content";
import { USER_DOCS as userDocs, USER_DETAIL_SECTIONS_BY_ID } from "./content/user";
export { USER_DOCS } from "./content/user";
export type { DocsAudience, DocsSection, DocsEntry, DocsChangelogEntry };
export {
  DOCS_VERSION,
  DOCS_UPDATED_AT,
  DOCS_OVERVIEW_SLUG,
  slugifyDocsSegment,
  DOCS_ENTRY_SLUGS,
  DOCS_SECTION_SLUGS,
  getDocsEntrySlug,
  getDocsSectionSlug,
  getDocsEntryPath,
  getDocsVersionPath,
  DOCS_PRINCIPLES,
  DOCS_CHANGELOG,
};
const DETAIL_SECTIONS_BY_ID: Record<string, DocsSection[]> = {
  ...USER_DETAIL_SECTIONS_BY_ID,
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
  "admin-integration": [
    {
      type: "table",
      title: "Kontrol Integrasi Marison",
      columns: ["Kontrol", "Fungsi"],
      rows: [
        ["Status environment", "Menunjukkan koneksi staging atau production yang dikunci saat deployment."],
        ["Cek koneksi", "Memeriksa akses SIGAP ke endpoint Projects, Unit, dan Non Unit tanpa mengubah master data."],
        ["Periksa karyawan", "Menampilkan jumlah data karyawan dan kantor yang akan dibuat, diperbarui, dilewati, atau perlu ditinjau."],
        ["Sinkron karyawan", "Memperbarui master kantor dan karyawan SIGAP setelah admin menyetujui hasil pemeriksaan."],
        ["Periksa proyek", "Menampilkan perubahan master proyek dan mapping kantor sebelum sinkronisasi."],
        ["Sinkron proyek", "Memperbarui master proyek SIGAP tanpa mengganti UUID lokal yang sudah dipakai surat."],
      ],
    },
    {
      type: "callout",
      title: "Periksa sebelum sinkron",
      description:
        "Jalankan pemeriksaan terlebih dahulu. Setelah sinkronisasi selesai, buka master terkait dan lengkapi baris yang ditandai untuk ditinjau.",
      tone: "warning",
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
export const ADMIN_DOCS: DocsEntry[] = [
  {
    id: "admin-users",
    title: "User Organization",
    menu: "Master Data > User Organization",
    audience: "admin",
    icon: Users,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
     summary: "Mengelola akun, organisasi karyawan, dan identitas employee payload staging.",
    whenToUse: [
      "Import atau memperbarui data karyawan aktif.",
      "Mengubah role user menjadi admin atau user biasa.",
      "Menonaktifkan akun yang sudah tidak masuk dalam data import aktif.",
    ],
    steps: [
      "Buka User Organization.",
      "Gunakan pencarian dan filter jabatan jika perlu.",
      "Dahulukan baris berwarna amber dan baca kolom Keterangan untuk mengetahui data yang perlu diperbaiki.",
      "Edit profil user atau lakukan import data karyawan.",
      "Cek hasil import, termasuk data berhasil, gagal, dan user yang dinonaktifkan.",
      "User hasil sinkron dengan NIK external valid otomatis berstatus Siap dikirim - data external.",
      "Untuk user lokal/trial, cari employee external dari katalog Mapping Payload Staging. Simpan atau Reset hanya mengubah nilai outbound, bukan NIK SIGAP.",
    ],
    examples: [
      "Jika NIK sama tetapi nama atau jabatan berubah, sistem memperbarui data user yang sama.",
      "Jika karyawan tidak ada dalam import aktif, akun dianggap tidak aktif.",
    ],
    troubleshooting: [
      "Jika import gagal karena akses ditolak, pastikan akun yang melakukan import adalah admin aktif.",
      "Jika kantor belum termapping, tambahkan mapping kantor sebelum import ulang.",
      "Jika badge sidebar belum berkurang, pastikan seluruh alasan pada kolom Keterangan sudah diselesaikan lalu segarkan data.",
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
  },
  {
    id: "admin-projects",
    title: "Master Proyek",
    menu: "Master Data > Master Proyek",
    audience: "admin",
    icon: Briefcase,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
     summary: "Mengatur proyek SIGAP dan identitas project payload staging tanpa mengubah data internal.",
    whenToUse: [
      "Memastikan pilihan proyek tersedia saat registrasi.",
      "Memeriksa relasi proyek dengan cabang.",
      "Menyediakan data proyek untuk pengajuan Unit.",
      "Menambahkan proyek staging secara manual untuk pengujian integrasi.",
    ],
    steps: [
      "Buka Master Proyek.",
      "Cek daftar proyek, cabang, dan kolom Keterangan.",
      "Klik Tambah manual untuk membuat proyek lokal. Isi ID dan kode proyek Marison hanya jika nilainya sudah diketahui dari API external.",
      "Untuk baris amber, lengkapi entitas atau mapping yang disebutkan pada Keterangan.",
      "Pastikan data proyek aktif sebelum dipakai user.",
      "Proyek hasil sinkron dengan project ID dan relasi branch external valid otomatis berstatus Siap dikirim - data external.",
      "Untuk proyek lokal/trial, pilih project external dari katalog branch efektif. Mapping branch yang tidak cocok berstatus Perlu koreksi relasi dan ditolak backend.",
    ],
    examples: [
      "Saat pemohon memilih proyek Marison Jepara Perluasan, proyek itu terkunci untuk proses Unit selanjutnya.",
    ],
    troubleshooting: [
      "Jika proyek tidak muncul, cek data source proyek dan status aktif proyek.",
      "Jika proyek manual tidak muncul pada Non Unit, pastikan ID Proyek Marison dan ID Branch Marison pada kantor proyek sudah terisi, atau lengkapi mapping staging trial untuk proyek yang memakai identitas external.",
      "Jika ID external ditolak, cari proyek lain yang sudah memakai ID tersebut. Satu ID hanya boleh terhubung ke satu proyek SIGAP.",
      "Jika unit tidak muncul, cek integrasi unit/proyek dan konfigurasi pengajuan Unit.",
      "Jika badge Master Proyek masih tampil, periksa proyek amber yang belum memiliki entitas atau mapping cabang lengkap.",
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
      "Mengatur alur tanda tangan 2 sampai 8 tahap sesuai konfigurasi.",
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
      "Jika admin mengganti tahap atau kandidat signer, buka kembali draft. Draft aktif mengikuti konfigurasi terbaru; surat yang sudah terdaftar tetap memakai snapshot lama.",
    ],
  },
  {
    id: "admin-integration",
    title: "Integrasi Marison",
    menu: "Konfigurasi > Integration",
    audience: "admin",
    icon: Server,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Memeriksa koneksi dan menyinkronkan master karyawan, kantor, serta proyek dari sistem Marison ke SIGAP.",
    whenToUse: [
      "Mengecek kesiapan endpoint Marison pada environment yang sedang aktif.",
      "Meninjau perubahan data sebelum sinkronisasi manual.",
      "Menjalankan sinkronisasi master karyawan, kantor, atau proyek.",
    ],
    steps: [
      "Buka Konfigurasi lalu pilih Integration.",
      "Pastikan environment dan credential server berstatus siap.",
      "Jalankan Cek koneksi untuk memastikan sumber data dapat diakses.",
      "Pilih Periksa karyawan atau Periksa proyek dan baca ringkasan perubahannya.",
      "Jalankan sinkronisasi setelah hasil pemeriksaan sesuai.",
      "Buka master data terkait untuk melengkapi baris yang masih ditandai perlu ditinjau.",
    ],
    examples: [
      "Setelah karyawan baru tersedia di Marison, admin memeriksa data lalu menjalankan Sinkron karyawan agar akun dan mapping kantornya tersedia di SIGAP.",
      "Setelah proyek cabang baru dibuat, admin menjalankan Periksa proyek sebelum menyinkronkannya ke Master Proyek.",
    ],
    troubleshooting: [
      "Jika Cek koneksi gagal, periksa status credential dan endpoint environment aktif; credential tidak dapat diubah dari browser.",
      "Jika hasil sinkronisasi perlu ditinjau, buka User Organization, Master Kantor Cabang, atau Master Proyek dan baca kolom Keterangan.",
      "Jika data external tidak lengkap, jangan menebak mapping entitas atau organisasi; lengkapi berdasarkan sumber resmi.",
    ],
    related: ["User Organization", "Master Kantor Cabang", "Master Proyek"],
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
    id: "external-api",
    title: "External API",
    menu: "Operasional",
    audience: "troubleshooting",
    icon: Database,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Panduan memakai API eksternal SIGAP untuk surat dan master data onboarding akun.",
    whenToUse: [
      "Sistem lain perlu membaca data surat yang sudah disetujui atau sedang dipantau.",
      "Sistem lain perlu menampilkan pilihan Kantor Pusat, KC, KCP, dan Departemen saat user login pertama kali.",
      "Partner perlu menguji access token, signature, dan endpoint master data tanpa membuka dashboard SIGAP.",
    ],
    steps: [
      "Minta `client_id` dan `client_secret` dari admin SIGAP.",
      "Generate access token melalui `POST /api/access-token` dari backend partner.",
      "Buat signature setiap request dengan access token, path, body hash, dan timestamp.",
      "Untuk onboarding akun, panggil `GET /api/onboarding/options` agar pilihan kantor dan departemen tersedia dalam satu response.",
      "Gunakan endpoint master terpisah jika aplikasi hanya butuh daftar KC, KCP, atau Departemen tertentu.",
    ],
    examples: [
      "User memilih Kantor Pusat: tampilkan daftar `departments` dari response onboarding.",
      "User memilih KC: tampilkan daftar `offices.kc`.",
      "User memilih KCP: tampilkan daftar `offices.kcp`.",
      "Endpoint master data tidak mengirim email kantor/departemen dan tidak mengirim data user.",
    ],
    troubleshooting: [
      "Jika response `Unauthorized`, cek access token, `X-Timestamp`, dan `X-Signature`.",
      "Jika daftar kosong, pastikan master kantor/departemen sudah aktif dan tipe kantor terisi benar.",
      "Jika partner hanya butuh satu daftar, pakai endpoint filter seperti `/api/master/offices?type=kc`.",
    ],
    related: ["Deploy production", "Master Kantor Cabang", "Master Departemen"],
    sections: [
      {
        type: "table",
        title: "Endpoint master data",
        columns: ["Endpoint", "Dipakai untuk"],
        rows: [
          ["GET /api/onboarding/options", "Mengambil tipe kantor, daftar Kantor Pusat/KC/KCP, dan Departemen pusat dalam satu response."],
          ["GET /api/master/offices?type=pusat", "Mengambil pilihan Kantor Pusat."],
          ["GET /api/master/offices?type=kc", "Mengambil pilihan KC."],
          ["GET /api/master/offices?type=kcp", "Mengambil pilihan KCP."],
          ["GET /api/master/departments?scope=pusat", "Mengambil pilihan Departemen untuk user Kantor Pusat."],
          ["GET /api/master/departments?scope=cabang", "Mengambil pilihan Departemen cabang jika partner membutuhkannya."],
        ],
      },
      {
        type: "table",
        title: "Field yang dikirim",
        columns: ["Data", "Field"],
        rows: [
          ["Kantor", "`id`, `code`, `name`, `type`, `type_label`, `parent_id`, `parent_code`, `parent_name`."],
          ["Departemen", "`id`, `code`, `name`, `dept_index`, `scope`."],
          ["Yang tidak dikirim", "Email, data user, secret, dan field internal lain."],
        ],
      },
    ],
  },
  {
    id: "deploy-production",
    title: "Deploy staging dan production",
    menu: "Operasional",
    audience: "troubleshooting",
    icon: Database,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Panduan deploy SIGAP dengan aplikasi, database, dan datasource terpisah serta storage bersama yang dipisahkan berdasarkan namespace.",
    whenToUse: [
      "Mendeploy perubahan frontend, halaman dokumentasi, atau server aplikasi utama.",
      "Memastikan staging tidak membaca database atau datasource production dan hanya mengakses object storage dalam namespace staging/.",
      "Memastikan deploy memakai file env dan nama project Compose yang sesuai.",
      "Memutuskan apakah PDF worker perlu ikut diredeploy.",
    ],
    steps: [
      "Pastikan perubahan sudah dibuild atau sudah siap dideploy dari workspace.",
      "Pilih compose staging untuk domain testing atau compose production untuk domain production.",
      "Jalankan command dengan Docker context `ubuntu-server`, nama project `-p`, dan file env yang sesuai.",
      "Cek status service Compose pada environment yang dipilih sampai aplikasi healthy.",
      "Buka domain staging atau production yang sesuai dan periksa `/health/ready` serta route yang berubah.",
      "Redeploy PDF worker atau sync worker hanya jika source, runtime, atau konfigurasi worker tersebut berubah.",
    ],
    examples: [
      "Perubahan dokumentasi `/docs` cukup deploy app utama, tidak perlu deploy PDF worker.",
      "Domain testing memakai `docker-compose.staging.yml`; environment Marison terkunci ke staging.",
      "Domain production memakai `docker-compose.prod.yml`; environment Marison terkunci ke production.",
      "Production dibuka melalui `https://sigap.marisoncloud.com`, sedangkan staging melalui `https://sigap.marison-testing.biz.id`.",
      "Staging memiliki project Supabase dan worker PDF sendiri, tetapi memakai storage self-hosted yang sama melalui namespace staging/.",
      "Production memakai origin publik melalui Caddy; staging tetap melalui Cloudflare Tunnel.",
      "Pengembangan lokal dengan `npm run dev` menjalankan Vite dan BFF lokal bersama-sama, memakai `.env.local`, serta tetap menggunakan Supabase dan datasource Marison staging.",
      "Perubahan `backend/src` deploy app utama karena container app yang menjalankan server Fastify.",
      "Perubahan `pdf-worker.mjs` pada staging memakai service `agenda-pdf-worker-staging`; `docker-compose.worker.yml` hanya untuk PDF worker production.",
      "Deploy app-only staging tidak merestart PDF worker atau sync worker yang sudah berjalan.",
    ],
    troubleshooting: [
      "Jika container restart karena storage kosong, pastikan staging memakai `.env.staging` dengan `STORAGE_PATH_PREFIX=staging`, sedangkan production memakai `.env.production` tanpa prefix.",
      "Jika datasource salah environment, periksa compose yang dipakai dan nilai `MARISON_DEPLOYMENT_ENVIRONMENT` di container.",
      "Jika login lokal menampilkan 502 atau 403, restart `npm run dev` dan pastikan port 3010 tidak dipakai proses lain. Endpoint `/api` development harus menuju BFF lokal, bukan domain staging publik.",
      "Jika tautan email membuka domain yang salah, periksa `APP_PUBLIC_URL` pada container aktif; nilai ini dikunci oleh file Compose.",
      "Jika route production gagal, cek proxied A record, port forward 80/443, sertifikat Caddy, dan upstream `10.10.10.246:3010`.",
      "Jika route staging gagal, cek health container, Cloudflare Tunnel, dan cache browser.",
      "Pada jaringan multi-WAN, DDNS harus mengambil alamat WAN inbound dari router; IP keluar server tidak boleh dipakai sebagai sumber DDNS.",
      "Jika PDF baru tidak diproses setelah deploy app utama, cek apakah worker memang perlu redeploy atau cukup worker yang sedang running.",
    ],
    sections: [
      {
        type: "table",
        title: "Command deploy",
        columns: ["Kebutuhan", "Command"],
        rows: [
          [
            "Deploy app-only staging",
            "docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --build --no-deps agenda-flow-staging",
          ],
          [
            "Deploy seluruh stack staging",
            "docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --build",
          ],
          [
            "Deploy PDF worker staging",
            "docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging build agenda-flow-staging; docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --no-deps agenda-pdf-worker-staging",
          ],
          [
            "Deploy sync worker staging",
            "docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging build agenda-flow-staging; docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --no-deps agenda-marison-sync-staging",
          ],
          [
            "Deploy aplikasi production",
            "docker --context ubuntu-server compose -p agenda-flow-production -f docker-compose.prod.yml --env-file .env.production up -d --build",
          ],
          [
            "Deploy PDF worker production",
            "docker --context ubuntu-server compose -p agenda-flow-production-worker -f docker-compose.worker.yml --env-file .env.production up -d --build",
          ],
          [
            "Deploy External API",
            "docker --context ubuntu-server compose -f docker-compose.external.yml --env-file .env.production up -d --build",
          ],
        ],
      },
      {
        type: "table",
        title: "Kapan worker PDF ikut deploy",
        columns: ["Perubahan", "Deploy yang diperlukan"],
        rows: [
          ["Frontend, dokumentasi, route aplikasi, atau `backend/src`", "Deploy aplikasi utama saja; worker tetap berjalan tanpa restart."],
          ["`pdf-worker.mjs`, dependency/runtime PDF, font runtime, atau konfigurasi worker", "Redeploy PDF worker pada environment terkait."],
          ["`server/marison-sync-worker.mjs`, image/runtime, token, URL, jadwal, atau konfigurasi sync", "Redeploy sync worker staging."],
          ["Folder `external-api/` atau `docker-compose.external.yml`", "Deploy External API saja."],
          ["Env storage production", "Redeploy service yang membaca env tersebut dengan `--env-file .env.production`."],
        ],
      },
    ],
  },
];
export const ALL_DOCS = [...userDocs, ...ADMIN_DOCS, ...TROUBLESHOOTING_DOCS];
