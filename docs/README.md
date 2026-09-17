# 📑 SIGAP: Sistem Informasi Agenda dan Persuratan

> **Solusi Digitalisasi Administrasi: Responsif, Terintegrasi, dan Transparan.**

**SIGAP** adalah platform tata kelola persuratan modern yang mengotomasi alur kerja (workflow) surat-menyurat dan agenda organisasi. Dengan memanfaatkan teknologi *Cloud-Native*, SIGAP memastikan setiap dokumen bergerak secara presisi dari meja pembuat hingga ke penandatangan akhir tanpa hambatan fisik.

---

## 💎 Filosofi Nama

**SIGAP** bukan sekadar singkatan, melainkan representasi performa sistem:
* **S**istem: Terstruktur dan sistematis.
* **I**nformasi: Akurat dan real-time.
* **G**anda: Mendukung alur kerja paralel dan serial.
* **A**genda: Pencatatan waktu yang disiplin.
* **P**ersuratan: Berorientasi pada tata naskah dinas yang legal.

---

## 🏗️ Arsitektur Sistem (Technical Stack)

SIGAP memakai frontend React dengan BFF Node.js dan PostgreSQL/Supabase sebagai fondasi data serta otorisasi:

| Layer | Teknologi | Peran |
| :--- | :--- | :--- |
| **Frontend** | React.js + Tailwind CSS | Antarmuka pengguna yang responsif dan interaktif. |
| **Backend** | Fastify + TypeScript (`backend/src`) | Session HttpOnly, API aplikasi, integrasi eksternal, email, dan akses file privat. |
| **Database** | PostgreSQL | Penyimpanan data relasional dengan integritas tinggi. |
| **Realtime** | SSE attention + Supabase Realtime terbatas | Badge dan sinyal perubahan tanpa mengirim isi dokumen sensitif. |
| **Storage** | Supabase Storage self-hosted | Penyimpanan privat terpusat; path production tetap utama dan staging diisolasi dalam namespace `staging/`. |
| **Workflow** | PostgreSQL RPC + RLS | Reservasi nomor, routing approval, pemeriksaan, revisi, dan audit secara server-side. |
| **PDF Worker** | Node.js worker + renderer PDF native | Membuat PDF dari snapshot database ketika diminta atau saat dokumen final dibutuhkan. |
| **Generator PGD** | PDF-native (pdfmake) | Satu renderer untuk Uji PDF, surat baru, snapshot approval, dan Buat Ulang PDF. |

Antarmuka menggunakan token tema bersama dengan pilihan `System`, `Light`, dan `Dark` yang disimpan per akun. Konfigurasi aturan sistem dipusatkan pada menu admin `Configuration`, terpisah dari master data operasional.

Avatar user disimpan pada Supabase Storage self-hosted yang private. Aplikasi menampilkan thumbnail WebP melalui domain SIGAP untuk mengurangi bandwidth, sedangkan file asli dikirim ketika avatar dibuka langsung.

---

## 🔄 Alur Kerja Digital (Workflow)

SIGAP menjaga konsistensi proses melalui jalur server-side:

1. **Drafting**: User mengisi data dan sistem mereservasi nomor surat sebagai draft.
2. **Registration**: BFF dan RPC memvalidasi identitas, form, kegunaan, serta matrix approval.
3. **Routing**: Database mengaktifkan pemeriksa atau penandatangan yang berhak pada tahap berjalan.
4. **Processing**: Pemeriksaan, persetujuan, penolakan, dan revisi dicatat sebagai histori yang dapat diaudit.
5. **Attention**: SSE mengirim sinyal ringan agar badge dan tugas aktif segera disinkronkan.
6. **Document**: PDF worker membangun dokumen dan snapshot berdasarkan data serta status approval terbaru.

---

## 📚 Dokumentasi Lengkap

Garis besar dokumentasi:

- [FITUR.md](./FITUR.md) menjadi pusat fitur fungsional dan non-fungsional.
- Dokumen KPI project dan server tetap terpisah karena berisi target manajemen proyek dan operasional infrastruktur.
- Dokumentasi API external tetap terpisah karena dikonsumsi oleh sistem/client lain.

| File | Deskripsi |
|------|-----------|
| [FITUR.md](./FITUR.md) | Indeks fitur SIGAP: fungsional, non-fungsional, termasuk Hirarki Organisasi, dan rencana fitur berjalan |
| [CAL-03_WORK_CALENDAR.md](./CAL-03_WORK_CALENDAR.md) | Manual singkat fitur Kalender Kerja (CAL-03 F1–F7): tampilan, siklus hidup pekerjaan, hari kerja & libur, dashboard, notifikasi, dan aksesibilitas |
| [WORKFLOW_ASET_UNIT.md](./WORKFLOW_ASET_UNIT.md) | Flowchart lengkap Permohonan Aset dan Unit, termasuk pemeriksaan, rekomendasi, revisi, dan tanda tangan ulang |
| [FEATURE_RELEASE_MAP.md](./FEATURE_RELEASE_MAP.md) | Status fitur per environment, dependensi, selective release, dan prosedur penarikan production |
| [AI_COLLABORATION.md](./AI_COLLABORATION.md) | Protokol koordinasi manusia dan AI untuk branch, worktree, klaim pekerjaan, konflik, dan handoff |
| [PROJECT_STRUCTURE_GUIDE.md](./PROJECT_STRUCTURE_GUIDE.md) | Standar struktur frontend, backend, docs, dan External API agar kode tetap ramping dan maintainable |
| [EXTERNAL_API_SURAT.md](./EXTERNAL_API_SURAT.md) | Dokumentasi API External untuk integrasi sistem eksternal |
| [KPI_IT_PROJECT_IMPLEMENTATION.md](./KPI_IT_PROJECT_IMPLEMENTATION.md) | KPI project berdasarkan tahap implementasi |
| [KPI_SERVER.md](./KPI_SERVER.md) | KPI operasional server, database, dan media storage |
| [Kontrak Outbound Marison v1](./contracts/marison/v1/README.md) | Payload kanonis Aset dan Unit yang disepakati bersama vendor |

---

## Deploy Production

Gunakan Docker context server saat deploy aplikasi utama:

```powershell
docker --context ubuntu-server compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Jika perubahan tidak menyentuh PDF worker, jangan redeploy `docker-compose.worker.yml`. Worker hanya perlu redeploy jika ada perubahan pada `pdf-worker.mjs`, dependency/runtime PDF, atau konfigurasi worker. Detail aturan deploy ada di [FITUR.md](./FITUR.md#30-operasional-deployment-dan-worker).

---

## 🔗 Quick Links

### API Documentation
- Base URL: `https://external.marison-testing.biz.id`
- Interaktif: `https://external.marison-testing.biz.id/docs`
- OpenAPI: `https://external.marison-testing.biz.id/openapi.json`

### Supabase
- [Dashboard](https://supabase.com/dashboard/project/xuhyodtmgwteyslhrkfx)
- Project: `agenda`
- Region: `ap-southeast-1`

---

*Last updated: 2026-07-28*
