# Kalender Kerja (Unified Work Calendar)

Manual singkat fitur **Kalender Kerja** SIGAP. Dokumen ini adalah rujukan
pengguna, admin, dan operator untuk fitur CAL-03 fase **F1–F7** yang saat ini
berstatus **kandidat staging**.

- Route aplikasi: `/calendar`
- Modul frontend: `src/features/work-calendar/**`
- Halaman: `src/pages/work-calendar/WorkCalendarPage.tsx`

> Catatan rilis: fitur ini belum dirilis ke production. Promosi ke `main`
> menunggu instruksi rilis eksplisit. Lihat
> [`FEATURE_RELEASE_MAP.md`](./FEATURE_RELEASE_MAP.md).

---

## 1. Ringkasan Fase F1–F7

| Fase | Lingkup |
| --- | --- |
| **F1** | Fondasi Unified Work Calendar: workspace Hari/Minggu/Bulan, quick entry, status pekerjaan, dan overdue turunan. |
| **F2** | Skema database + repository Supabase (`work_calendar_entries`, RLS kepemilikan). |
| **F3** | Cutover route resmi `/calendar`, RPC anggota tim, repository profil, dan penghapusan ketergantungan pada kalender agenda lama. |
| **F4A** | Ketepatan filter Tim, keterbacaan dark mode, label aksi tambah kontekstual, dan Team Overview skala Direktur (paginasi + agregat server-side). |
| **F4B** | Detail entri responsif (side sheet desktop/tablet, dialog layar penuh mobile) di Hari/Minggu/Bulan/Tim + Quick Add dari sel tanggal kosong. |
| **F5** | Siklus hidup pekerjaan: satu pekerjaan = satu baris, aksi Ubah jadwal/Terhambat/Selesai, histori peristiwa server-side, tenggat `due_date`, warna penanda, dan timeline. |
| **F6** | Hari & jam kerja dari konfigurasi KPI existing (read-only), tabel `holidays` (libur nasional/cuti bersama), dan pembeda visual hari nonkerja/libur. |
| **F7** | Ringkasan pekerjaan hari ini & tertunda di dashboard, notifikasi lonceng, dan integrasi aktivitas terbaru. |

---

## 2. Tampilan dan Navigasi

Kalender Kerja menyediakan empat tampilan yang dipilih dari toolbar:

- **Hari** — fokus satu tanggal: ringkasan progres lalu daftar pekerjaan.
- **Minggu** — tujuh kolom tanggal dengan penanda hari kerja/nonkerja/libur.
- **Bulan** — grid bulan; klik sel tanggal membuka daftar pekerjaan tanggal itu.
- **Tim** — pekerjaan anggota bawahan (read-only) dengan filter pemilik dan
  paginasi server-side.

Kontrol toolbar: tombol rentang sebelumnya/berikutnya, tombol **Hari Ini**,
pemilih tampilan, filter pemilik (khusus mode Tim), dan tombol tambah
kontekstual. Mode Hari tidak menampilkan tombol tambah karena kolom quick entry
sudah tersedia di halaman.

---

## 3. Siklus Hidup Pekerjaan (F5)

Status tersimpan ada empat: **Direncanakan**, **Sedang Dikerjakan**,
**Selesai**, dan **Terhambat**. Status akhir hanya `Selesai`; pekerjaan
`Terhambat` tetap dihitung belum selesai dan tetap bisa terlambat.

- **Terlambat** bukan status tersimpan. Nilai ini diturunkan dari tanggal kerja
  dan tenggat, sehingga tidak pernah bertabrakan dengan status.
- Setiap aksi siklus hidup mengubah **baris pekerjaan yang sama** (PATCH),
  tidak membuat baris atau duplikat baru.
- `Selesai` meminta realisasi singkat; `Terhambat` meminta alasan.
- Riwayat peristiwa (dibuat, perubahan status, perubahan tanggal, perubahan
  tenggat) dicatat server-side dan tampil sebagai timeline di panel detail.
- Warna penanda (`slate`, `blue`, `teal`, `amber`, `rose`, `violet`) bersifat
  dekoratif; makna status tetap dibawa oleh ikon dan label.

---

## 4. Hari Kerja, Jam Kerja, dan Hari Libur (F6)

- Konfigurasi hari/jam kerja **dibaca read-only** dari konfigurasi KPI existing.
  Default: Senin–Jumat, `08:00–17:00`, istirahat `12:00–13:00`,
  zona `Asia/Jakarta`.
- Tabel `holidays` menyimpan libur nasional dan cuti bersama. Hari libur dan
  hari nonkerja dibedakan lewat **label teks** (`Hari nonkerja`,
  `Cuti bersama: <nama>`), bukan warna saja.
- Tanggal nonkerja tetap dapat ditambahi pekerjaan; catatan pada tampilan Hari
  bersifat informatif dan tidak memblokir input.

### Impor hari libur

Impor resmi memakai script `scripts/import-holidays.mjs` (default **dry-run**):

```powershell
$env:MARISON_DEPLOYMENT_ENVIRONMENT = "staging"
node scripts/import-holidays.mjs supabase/data/holidays-2026.csv
node scripts/import-holidays.mjs supabase/data/holidays-2026.csv --apply
```

Script hanya berjalan untuk `MARISON_DEPLOYMENT_ENVIRONMENT=staging`, menolak
host Supabase production, memakai service role dari environment, tidak pernah
mencetak credential, dan idempotent (tanggal sama di-update, bukan diduplikasi).
Format CSV: `holiday_date,name,is_cuti_bersama`.

---

## 5. Dashboard dan Aktivitas Terbaru (F7)

- **Widget dashboard** menampilkan ringkasan pekerjaan hari ini (tanpa status
  `Selesai`) dan pekerjaan tertunda (belum selesai dan tenggat/tanggal kerja
  sudah lewat). Widget menyediakan tautan langsung ke `/calendar`.
- **Aktivitas Terbaru** menyertakan peristiwa Work Calendar lewat
  `get_my_recent_work_calendar_events`, sehingga perubahan pekerjaan tampil di
  modul aktivitas dashboard yang sudah ada.

### RPC terkait

| RPC | Kegunaan |
| --- | --- |
| `get_work_calendar_dashboard_entries(p_owner_id, p_today)` | Sumber entri widget dashboard. |
| `get_my_recent_work_calendar_events(p_limit)` | Aktivitas Work Calendar terbaru milik pemanggil. |
| `generate_work_calendar_notifications(p_today, p_escalation_work_days, p_debounce_hours)` | Generator notifikasi on-demand dan idempotent. |

---

## 6. Notifikasi Lonceng (F7)

Notifikasi Work Calendar memakai tabel `notifications` bersama sehingga badge
lonceng, penandaan dibaca, dan penghapusan langsung bekerja tanpa sumber data
kedua.

| Kategori | Tipe | Pemicu |
| --- | --- | --- |
| `deadline_overdue` | `warning` | Pekerjaan belum selesai sudah melewati tenggat. |
| `follow_up_reminder` | `info` | Pekerjaan terhambat perlu ditindaklanjuti. |
| `blocked_escalation` | `error` | Pekerjaan bawahan terhambat melewati ambang hari kerja; dikirim ke atasan. |

Perilaku anti-spam:

- **Deduplikasi** memakai kunci
  `work-calendar:<kategori>:<user>:<tanggal>` pada `data->>'dedupe_key'` dengan
  indeks unik parsial.
- **Batching** menggabungkan beberapa pekerjaan ke dalam **satu** notifikasi per
  kategori, per pengguna, per hari.
- **Debounce** default **6 jam** untuk event berdekatan.
- **Ambang eskalasi** default **2 hari kerja**. Perhitungan eskalasi mengabaikan
  Sabtu/Minggu dan hari pada tabel `holidays`.
- Generator dipanggil **on-demand** dari aplikasi (bukan `pg_cron`), aman
  dijalankan berulang kali.

Badge angka pada ikon lonceng menampilkan jumlah belum dibaca, dan daftar
notifikasi kalender dirender di popover lonceng dengan ikon kategori.

---

## 7. Hak Akses

- Seluruh keputusan otorisasi berjalan server-side lewat RLS dan RPC
  `security definer`.
- Pemilik hanya melihat dan mengubah pekerjaannya sendiri.
- Mode Tim hanya menampilkan pekerjaan bawahan secara read-only.
- Helper internal `work_calendar_emit_notification` **tidak** diberikan hak ke
  `authenticated`/`anon`; hanya generator yang memakainya.
- Notifikasi eskalasi hanya dibuat untuk data pekerjaan yang benar-benar berasal
  dari bawahan pemanggil.

---

## 8. Aksesibilitas dan Dark Mode

- Status, hari nonkerja, dan kategori notifikasi **tidak pernah** dibedakan
  hanya lewat warna; selalu ada ikon dan/atau label teks.
- Seluruh kontrol ikon memiliki nama aksesibel (`aria-label`).
- Target sentuh kontrol utama minimal **44px**.
- Mode tampilan ditenagai token tema bersama (`System`, `Light`, `Dark`).
- Override token dark mode Work Calendar dibatasi pada scope
  `.work-calendar-scope` / `.dark .work-calendar-scope`, bukan token global,
  sehingga halaman lain tidak mengalami regresi. Rasio kontras token terjaga
  (teks status ≥ 4.5:1, batas kontrol interaktif ≥ 3:1 pada kedua tema).
- Animasi menghormati preferensi reduced motion.

Audit aksesibilitas otomatis tersedia di
`src/test/cal-03-f8-accessibility.test.tsx` (render + perhitungan kontras token
WCAG 2.1 untuk tema terang dan gelap), dan dapat dijalankan dengan
`npx vitest run src/test/cal-03-f8-accessibility.test.tsx`.

---

## 9. Data dan Migration

| Objek | Keterangan |
| --- | --- |
| `work_calendar_entries` | Satu baris per pekerjaan, kepemilikan per `owner_id`. |
| `work_calendar_events` | Histori peristiwa per pekerjaan (dibuat oleh trigger). |
| `holidays` | Libur nasional dan cuti bersama. |
| `notifications` | Tabel bersama; notifikasi kalender dikenali dari `data->>'dedupe_key'`. |

Migration CAL-03 (hanya boleh diterapkan ke staging selama pengembangan):

- `20260915072607_work_calendar_entries.sql`
- `20260915093000_work_calendar_team_members.sql`
- `20260916170000_work_calendar_team_overview.sql`
- `20260916171000_work_calendar_team_overview_scale.sql`
- `20260917120000_work_calendar_lifecycle.sql`
- `20260918090000_work_calendar_holidays.sql`
- `20260918120000_work_calendar_notifications.sql`

Terapkan migration staging mengikuti runbook
[`STAGING_MIGRATION_RECONCILIATION.md`](./STAGING_MIGRATION_RECONCILIATION.md)
(`migration list` → `--dry-run` → `db push`; dilarang memakai `--include-all`
atau repair secara buta).

---

## 10. Batasan yang Disengaja

- Tidak ada tabel atau kolom tambahan di luar daftar migration di atas.
- Generator notifikasi dipanggil dari aplikasi, bukan job terjadwal.
- Tidak menyentuh KPI, dashboard lama, notifikasi lama, maupun modul agenda
  legacy.
- Mode Tim tidak pernah mengizinkan penyuntingan pekerjaan anggota lain.
