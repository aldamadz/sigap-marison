import { BookOpenText, Database, KeyRound, ShieldCheck } from "lucide-react";

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
import { ADMIN_DOCS as adminDocs, ADMIN_DETAIL_SECTIONS_BY_ID } from "./content/admin";
export { ADMIN_DOCS } from "./content/admin";
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
  ...ADMIN_DETAIL_SECTIONS_BY_ID,
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
export const ALL_DOCS = [...userDocs, ...adminDocs, ...TROUBLESHOOTING_DOCS];
