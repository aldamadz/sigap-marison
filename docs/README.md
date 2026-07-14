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
| **Backend** | Node.js server + Supabase | API terautentikasi, integrasi server-side, dan routing dokumen. |
| **Database** | PostgreSQL | Penyimpanan data relasional dengan integritas tinggi. |
| **Realtime** | Supabase Broadcast/Presence | Pengiriman notifikasi instan via WebSocket. |
| **Storage** | Supabase Storage self-hosted | Penyimpanan privat file PDF dan lampiran transaksi. |
| **Generator PGD** | PDF-native (pdfmake) | Satu renderer untuk Uji PDF, surat baru, snapshot approval, dan Buat Ulang PDF. |
| **Template Builder** | JSON native template | Fondasi rancangan dokumen dari nol: elemen, binding data, tabel berulang, tanda tangan, versioning. |

Antarmuka menggunakan token tema bersama dengan pilihan `System`, `Light`, dan `Dark` yang disimpan per akun. Konfigurasi aturan sistem dipusatkan pada menu admin `Configuration`, terpisah dari master data operasional.

Avatar user disimpan pada Supabase Storage self-hosted yang private. Aplikasi menampilkan thumbnail WebP melalui domain SIGAP untuk mengurangi bandwidth, sedangkan file asli dikirim ketika avatar dibuka langsung.

---

## 🔄 Alur Kerja Digital (Workflow)

SIGAP mengeliminasi *race condition* melalui sinkronisasi server-side:

1.  **Drafting**: User membuat agenda/surat di Dashboard SIGAP.
2.  **Triggering**: Database mengirim sinyal Webhook ke Edge Function.
3.  **Routing**: Backend menganalisis tabel `surat_signatures` untuk menentukan penandatangan aktif.
4.  **Broadcasting**: Pesan dikirimkan secara spesifik ke ID pengguna yang dituju.
5.  **Notifying**: Browser penerima memutar audio `notif.WAV` dan memperbarui UI secara otomatis.

---

## 📚 Dokumentasi Lengkap

Garis besar dokumentasi:

- [FITUR.md](./FITUR.md) menjadi pusat fitur fungsional dan non-fungsional.
- Dokumen KPI project dan server tetap terpisah karena berisi target manajemen proyek dan operasional infrastruktur.
| File | Deskripsi |
|------|-----------|
| [FITUR.md](./FITUR.md) | Indeks fitur SIGAP: fungsional, non-fungsional, termasuk Hirarki Organisasi, dan rencana fitur berjalan |
| [KPI_IT_PROJECT_IMPLEMENTATION.md](./KPI_IT_PROJECT_IMPLEMENTATION.md) | KPI project berdasarkan tahap implementasi |
| [KPI_SERVER.md](./KPI_SERVER.md) | KPI operasional server, database, dan media storage |

---

## Deploy Production

Gunakan Docker context server saat deploy aplikasi utama:

```powershell
docker --context ubuntu-server compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Jika perubahan tidak menyentuh PDF worker, jangan redeploy `docker-compose.worker.yml`. Worker hanya perlu redeploy jika ada perubahan pada `pdf-worker.mjs`, dependency/runtime PDF, atau konfigurasi worker. Detail aturan deploy ada di [FITUR.md](./FITUR.md#30-operasional-deployment-dan-worker).

---

## 🔗 Quick Links

### Supabase
- [Dashboard](https://supabase.com/dashboard/project/xuhyodtmgwteyslhrkfx)
- Project: `agenda`
- Region: `ap-southeast-1`

---

*Last updated: 2026-07-14*
