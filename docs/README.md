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

SIGAP dibangun di atas infrastruktur **Event-Driven Architecture (EDA)** untuk menjamin skalabilitas:

| Layer | Teknologi | Peran |
| :--- | :--- | :--- |
| **Frontend** | React.js + Tailwind CSS | Antarmuka pengguna yang responsif dan interaktif. |
| **Backend** | Supabase Edge Functions (Deno) | Logika serverless untuk routing dokumen otomatis. |
| **Database** | PostgreSQL | Penyimpanan data relasional dengan integritas tinggi. |
| **Realtime** | Supabase Broadcast/Presence | Pengiriman notifikasi instan via WebSocket. |
| **Storage** | Supabase Storage | Penyimpanan aman file PDF dan dokumen digital. |

---

## 🔄 Alur Kerja Digital (Workflow)

SIGAP mengeliminasi *race condition* melalui sinkronisasi server-side:

1.  **Drafting**: User membuat agenda/surat di Dashboard SIGAP.
2.  **Triggering**: Database mengirim sinyal Webhook ke Edge Function.
3.  **Routing**: Edge Function menganalisis tabel `surat_signatures` untuk menentukan "Siapa pemeriksa saat ini?".
4.  **Broadcasting**: Pesan dikirimkan secara spesifik ke ID pengguna yang dituju.
5.  **Notifying**: Browser penerima memutar audio `notif.WAV` dan memperbarui UI secara otomatis.

---

## 📚 Dokumentasi Lengkap

| File | Deskripsi |
|------|-----------|
| [EXTERNAL_API_SURAT.md](./EXTERNAL_API_SURAT.md) | Dokumentasi API External untuk integrasi sistem eksternal |
| [KPI_IT_PROJECT_IMPLEMENTATION.md](./KPI_IT_PROJECT_IMPLEMENTATION.md) | KPI project berdasarkan tahap implementasi |
| [KPI_SERVER.md](./KPI_SERVER.md) | KPI operasional server, database, dan media storage |

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

*Last updated: 2026-05-29*