# Unified Work Calendar Redesign Baseline — Audit, Characterization & Removal Map

Feature ID: **CAL-03** (Unified Work Calendar; pass **CAL-03A**)

Base: `origin/staging` @ `69b3b785ab17039b0c8f4029a54059255f855e53`

Snapshot audit: 2026-09-15 (Asia/Jakarta)

Scope of this pass (CAL-03A): **audit, characterization, dan removal map saja.**
Tidak ada perubahan UI, route, sidebar, schema, RLS, migration, atau behavior
runtime. Dokumen ini adalah fondasi untuk CAL-03B (data contract + backfill),
CAL-03C (UI/route cutover), dan CAL-03D (cleanup).

> Product decisions (final, dari pemilik pekerjaan):
> - Agenda dan Kalender lama boleh dirombak atau dihapus.
> - Hanya ada satu fitur/menu: **Kalender Kerja**.
> - Canonical route: **`/calendar`**.
> - Route **`/agenda` dihapus permanen tanpa redirect.**
> - **Data bisnis existing wajib dipertahankan.**
> - **Atasan hanya membaca agenda bawahan; tidak boleh mengubah.**
> - Tidak ada compatibility obligation untuk UI/component/service lama.
> - Tidak ada production action pada tahap ini.

## 1. Current Architecture

Dua fitur terpisah hari ini:

| Aspek | `/agenda` (AgendaPage) | `/calendar` (CalendarPage) |
| --- | --- | --- |
| Bentuk | Daftar kartu + tab bulan/minggu | Grid kalender bulanan + drag-drop |
| Data personal | `getAgendas()` (tanpa filter) | `getAgendasForParent()` (selalu lewat hirarki) |
| Data atasan | `getAgendasForParent()` | `getAgendasForParent()` |
| Tulis | `agenda.service.saveAgenda` | Query Supabase inline di `CalendarPage` |
| Status | Status DB apa adanya | `getAutomaticStatus()` dihitung di klien |
| Timezone | `toISOString()` (UTC) di `saveAgenda` | `toLocalIso()` (offset lokal) inline |
| Export | — | `exportCalendarData()` (Excel/PDF) |
| Realtime | `RealtimeSync` (query invalidation) | `RealtimeSync` + invalidate manual |

Kesimpulan: ada **dua implementasi tulis/baca/status/timezone yang berbeda** untuk
tabel yang sama (`public.agendas`). Ini sumber utama drift yang harus dihilangkan
oleh CAL-03.

### 1.1 Duplication findings

| # | Duplikasi | Lokasi | Dampak |
| --- | --- | --- | --- |
| D1 | `getAllSubordinateIds` (rekursi `profiles`) | `agenda.service.ts:37`, `agenda-filter.service.ts:31` | Dua implementasi hirarki identik; `agenda-filter` bahkan `console.log`/`console.table` data profil |
| D2 | `mapAgenda` / `mapAgendaWithProfile` | `agenda.service.ts:8`, `agenda-filter.service.ts:6` | Dua pemetaan snake→camel dengan bentuk `profiles` berbeda (`officeName` vs `offices`) |
| D3 | `getAgendasForParent` | `agenda.service.ts:63` (aktif), `agenda-filter.service.ts:71` (dormant, tidak diekspor) | Nama sama, signature beda; hanya satu dipakai |
| D4 | `toLocalIso` | `CalendarPage.tsx:77` (inline `toLocalIso`), `CalendarPage.tsx:130` (`toLocalIsoStatic`), `AgendaDetailModal.tsx:29` | Konversi timezone disalin tiga kali |
| D5 | Create/update | `agenda.service.saveAgenda` vs inline `.from('agendas').update/insert` di `CalendarPage.tsx:103-116` | Aturan `completed_at`, default status, dan konversi waktu berbeda |
| D6 | Delete | `deleteAgenda` (soft delete) vs tidak ada di Calendar | Perilaku hapus tidak konsisten antar fitur |
| D7 | Reschedule | `dropMutation` (Calendar) vs `rescheduleNowMutation` (Detail modal) | Dua jalur ubah waktu |
| D8 | Status visual map | `AgendaCard`, `AgendaTabs`, `AgendaDetailModal`, `CalendarAgendaItem` masing-masing punya `Record<AgendaStatus, string>` | Empat sumber warna/label status |
| D9 | Adapter dormant | `agenda.adapter.ts` (`toUIAgenda`/`toDatabaseAgenda`) tidak diimpor siapa pun (`adapters/index.ts` mengekspornya, tetapi tidak ada consumer) | Kode mati paralel |
| D10 | Export | `export.service.ts` mencampur helper tanggal + ExcelJS + jsPDF | Modul god-service satu fungsi |
| D11 | Auto status | `getAutomaticStatus` (klien) vs status kolom DB (persisted) | Dua sumber kebenaran status |

## 2. Entry Points, Navigation, dan Consumers

### 2.1 Route dan lazy import

| Objek | Lokasi | Kondisi |
| --- | --- | --- |
| `AgendaPage` lazy import | `src/App.tsx:22` | legacy |
| `CalendarPage` lazy import | `src/App.tsx:23` | dipertahankan (menjadi target) |
| `<Route path="/agenda" …>` | `src/App.tsx:193` | **dihapus** |
| `<Route path="/calendar" …>` | `src/App.tsx:194` | canonical target |
| catch-all | `src/App.tsx` (`*` → `NotFound`) | `/agenda` harus jatuh ke 404 setelah route dihapus, tanpa redirect |

### 2.2 Sidebar dan layout metadata

| Objek | Lokasi | Tindakan |
| --- | --- | --- |
| Nav link Kalender | `Sidebar.tsx:304` `renderNavLink('/calendar', 'Kalender', Calendar)` | **KEEP**, ubah label menjadi `Kalender Kerja` (CAL-03C) |
| Nav link Agenda | `Sidebar.tsx:305` `renderNavLink('/agenda', 'Agenda', ClipboardList)` | **DELETE** |
| Layout title `/agenda` | `AppLayout.tsx:11` | **DELETE** |
| Layout title `/calendar` | `AppLayout.tsx:10` | **KEEP**, sesuaikan subtitle (CAL-03C) |
| Breadcrumb | `src/components/ui/Breadcrumbs.tsx` | generik; ikut hilang saat route `/agenda` dihapus |
| Header `onNewAgenda` | `Header.tsx:46,51,153` | prop dormant (tidak dipakai `AppLayout.tsx:78`); **DELETE** saat cleanup |

`Header` tidak dirender dengan `onNewAgenda` oleh `AppLayout`, jadi tidak ada
tombol "Permintaan Baru" yang perlu dimigrasikan.

### 2.3 Dashboard dan Activity Logs consumers

| Consumer | File | Ketergantungan pada agenda |
| --- | --- | --- |
| `AgendaParentFilter` | `Dashboard.tsx:25,252` | Filter organisasi (bukan agenda-spesifik secara semantik) |
| KPI/Section Agenda | `Dashboard.tsx:179-293` | `getDashboardKPI`, `getStatusDistribution`, `getDepartmentActivity` |
| `RecentActivity` | `components/dashboard/RecentActivity.tsx:9,42,60,74,100-105,223,295` | Membaca `activity_logs` dengan `table_name='agendas'` |
| `ActivityLogsPage` | `pages/activity-logs/ActivityLogsPage.tsx:4,8,41,121` | `AgendaParentFilter`, `getAgendas`, `getUsers` |
| `ActivityLogsView` | `components/activity/ActivityLogsView.tsx:7,13,32,36` | `table_name 'agendas' → 'Agenda'` |
| `Departemen activity` | `backend/src/domain-runtime.ts:2163-2194` | Agregat `agendas` per departemen (BFF `/api/dashboard/department-activity`) |

Catatan penting: **`AgendaParentFilter` tidak boleh dihapus buta** — dipakai
Dashboard, Activity Logs, dan Calendar. Ia adalah filter scope organisasi yang
reusable. Rencana: **KEEP SHARED**, kelak di-rename `TeamScopeFilter` di pass
terpisah tanpa mengubah perilaku.

Activity Logs dan RecentActivity bergantung pada **nama tabel `agendas`** di
`activity_logs.table_name`. Selama tabel dipertahankan, label `'agenda'` di
Activity Logs tetap benar. Ganti kelak hanya bila label produk ikut berubah.

### 2.4 Documentation topics

| Objek | Lokasi | Tindakan |
| --- | --- | --- |
| Topic Agenda | `pages/docs/content/user/agenda.ts` | **REPLACE** menjadi bagian Kalender Kerja |
| Topic Kalender | `pages/docs/content/user/calendar.ts` | **REPLACE** menjadi topik utama |
| Registrasi user docs | `pages/docs/content/user/index.ts:2-3,31-32,45-46` | sesuaikan daftar topic |
| Slug | `pages/docs/content/navigation.ts:16-17` | `agenda` dan `calendar` |
| Related titles | `pages/docs/DocsArticle.tsx:38-40` | `dashboard`/`agenda`/`calendar` saling terkait |
| PublicDocsPage | `pages/docs/PublicDocsPage.tsx:60` | hanya memakai tipe `User` |
| Changelog aplikasi | `pages/docs/content/version/changelog.ts` | **JANGAN diubah** pada pass ini |

`docs-user-content.test.ts` mengunci jumlah/urutan/hash topik docs. Setiap
perubahan topik docs di CAL-03C **wajib** memperbarui test tersebut beserta hash
`normalizedRuntime` — dicatat di sini agar tidak menjadi kejutan.

### 2.5 Export

`exportCalendarData()` di `export.service.ts` adalah satu-satunya export agenda,
dipakai `CalendarPage.tsx:233,239`. Kontrak kolom: `TANGGAL, AGENDA, DESKRIPSI,
MULAI, SELESAI, DURASI, STATUS` dengan nama file `Agenda_<user>_<yyyyMMdd>`.
Export tetap dibutuhkan pada fitur baru; implementasi akan ditulis ulang pada
komponen/format target (CAL-03C), dengan kontrak field dijaga (lihat §7.5).

### 2.6 Realtime

`RealtimeSync.tsx:26,36` berlangganan `postgres_changes` tabel `agendas` dan
menginvalidasi query keys `["agendas","kpi","status-dist","dept-activity",
"recent-logs","activity-logs"]`. Karena tabel dipertahankan, realtime tetap valid;
query key `agendas` akan diganti nama bila service baru memakai key baru
(CAL-03C), dan daftar key di `RealtimeSync` harus disesuaikan.

## 3. Komponen — Klasifikasi

| File | Simbol | Konsumen | Klasifikasi |
| --- | --- | --- | --- |
| `pages/agenda/AgendaPage.tsx` | `AgendaPage` | route `/agenda` | **DELETE** |
| `pages/calendar/CalendarPage.tsx` | `CalendarPage` | route `/calendar` | **REPLACE** (menjadi halaman Kalender Kerja) |
| `components/agenda/AgendaTabs.tsx` | `AgendaTabs` | AgendaPage | **DELETE** |
| `components/agenda/AgendaCard.tsx` | `AgendaCard` | AgendaTabs | **DELETE** |
| `components/agenda/AgendaModal.tsx` | `AgendaModal` | AgendaPage, CalendarPage | **REPLACE** (`WorkEntryModal`, mendukung field target) |
| `components/agenda/AgendaDetailModal.tsx` | `AgendaDetailModal` | AgendaPage, CalendarPage | **REPLACE** (`WorkEntryDetailModal`) |
| `components/agenda/AgendaParentFilter.tsx` | `AgendaParentFilter` | Dashboard, ActivityLogsPage, CalendarPage, AgendaPage | **KEEP SHARED** (kelak `MOVE/RENAME` → `TeamScopeFilter`) |
| `components/calendar/CalendarView.tsx` | `CalendarView` | CalendarPage | **REPLACE** (multi-view: Hari Ini/Minggu/Bulan/Progres Tim) |
| `components/calendar/CalendarAgendaItem.tsx` | `CalendarAgendaItem` | CalendarView | **REPLACE** (`WorkEntryChip`) |
| `components/ui/calendar.tsx` | `Calendar` (shadcn/day-picker primitive) | `SuratForm`, `InboxPage`, `RiwayatKeterlibatanPage` | **KEEP SHARED** (generik, bukan agenda) |
| `src/lib/utils.ts` | `getAutomaticStatus` | CalendarView | **MOVE** ke domain kalender (hapus dari `lib/utils`) |
| `src/lib/local-date.ts` | `parseLocalDateInput` | surat/forms | **KEEP SHARED** (generik) |
| `src/data/mockData.ts` | mock agenda | tidak ada importer | **DELETE** (legacy dormant) |

## 4. Services dan State

| Objek | Lokasi | Query/mutation utama | Klasifikasi |
| --- | --- | --- | --- |
| `agenda.service.ts` | `src/services/` | `getAgendas`, `getAgendasForParent`, `saveAgenda`, `updateAgendaStatus`, `deleteAgenda`, `mapAgenda`, `getAllSubordinateIds` | **REPLACE** oleh domain kalender; `DELETE` setelah cutover |
| `agenda-filter.service.ts` | `src/services/` | `getAgendasForParent` (dormant), `groupAgendasByOffice` (dormant), `getAllSubordinateIds` | **DELETE** (tidak diekspor di `services/index.ts:18`) |
| `agenda.adapter.ts` | `src/adapters/` | `toUIAgenda`, `toDatabaseAgenda` | **DELETE** (tanpa consumer; `adapters/index.ts:1`) |
| `export.service.ts` | `src/services/` | `exportCalendarData` | **REPLACE** (dipecah; kontrak export dipertahankan) |
| `parent-user.service.ts` | `src/services/` | `getChildUsers`, `isParentUser`, `getUserHierarchy` | **KEEP SHARED** (dipakai filter dan hirarki) |
| `dashboard.service.ts` | `src/services/` | `getDashboardStats`, `getDashboardKPI`, `getStatusDistribution`, `getDepartmentActivity`, `getRecentActivities` | **KEEP**, sesuaikan agregasi ke domain baru bila perlu (CAL-03C) |
| `RealtimeSync.tsx` | `src/providers/` | invalidasi query key `agendas` | **KEEP**, sesuaikan key |
| `ActivityLogsView` / `activity-log.service` | dashboard/activity | baca `activity_logs` (`table_name='agendas'`) | **KEEP SHARED** |

Query keys yang dipakai: `['agendas', …]`, `['users']`, `['visible-users-recursive', userId]`, `['offices-list']`, `['calendar-profile', userId]`, `['kpi', …]`, `['status-dist', …]`, `['dept-activity', …]`, `['recent-logs']`, `['activity-logs', …]`.

Tidak ada subscription realtime khusus di dalam komponen agenda; semuanya lewat
`RealtimeSync` global.

## 5. Types Audit — `src/types/agenda.ts`

File ini mencampur empat domain berbeda. Rencana pemisahan konseptual:

| Isi saat ini | Target file | Consumer | Klasifikasi |
| --- | --- | --- | --- |
| `Role`, `OfficeType`, `User` | `types/user.ts` | `Sidebar`, `*Modal` user, `profile.service`, `user.service`, `user-ui.service`, `visibility.service`, `admin` pages, `PublicDocsPage`, `ActivityLogsView`, `RecentActivity` | **MOVE** (pass tersendiri, banyak consumer) |
| `AgendaStatus`, `Agenda`, `agendaSchema`, `AgendaFormValues` | `types/work-calendar.ts` | `agenda.service`, `agenda.adapter`, `Agenda*`, `Calendar*`, `export.service`, `dashboard.service` | **REPLACE** |
| `ActivityAction`, `ActivityLog` | `types/activity-log.ts` | `activity-log.service`, `activity-log.adapter`, `ActivityLogsView`, `RecentActivity`, `Dashboard` | **MOVE** |
| `KPIData`, `ChartData` | `types/dashboard.ts` | `dashboard.service`, dashboard charts | **MOVE** |

Catatan: `types/agenda.ts` mengimpor `zod` untuk `agendaSchema`. Setelah split,
`zod` hanya diperlukan di `types/work-calendar.ts`. Pemindahan `User` menyentuh
banyak file; **jangan** dicampur ke pass UI cutover. Dokumentasikan consumer di
atas sebagai checklist pass pemindahan tipe (CAL-03D).

## 6. Database Staging — Audit Read-Only

Sumber: Supabase **staging** (`wrufczusfopgvwvxsmjk`), read-only. Production
**tidak** di-query.

### 6.1 Schema `public.agendas`

| Kolom | Tipe | Null | Default | Catatan |
| --- | --- | --- | --- | --- |
| `id` | `integer` | NO | `nextval('agendas_id_seq')` | PK, serial |
| `title` | `text` | NO | — | |
| `description` | `text` | YES | — | dipakai UI sebagai catatan/realisasi |
| `location` | `text` | YES | — | tidak dipakai target |
| `start_time` | `timestamptz` | NO | — | |
| `end_time` | `timestamptz` | NO | — | |
| `status` | `agenda_status` | YES | `'Scheduled'` | enum, bukan generated |
| `created_by` | `uuid` | YES | — | FK `profiles(id)` |
| `completed_at` | `timestamptz` | YES | — | |
| `deleted_at` | `timestamptz` | YES | — | soft delete |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | tidak dipetakan UI |

Enum `public.agenda_status`: `Scheduled, Ongoing, Completed, Deleted, Overdue`
(urutan sortorder 1..5).

Constraints:

- `agendas_pkey` PRIMARY KEY (`id`)
- `agendas_created_by_fkey` FOREIGN KEY (`created_by`) → `public.profiles(id)` **ON DELETE SET NULL**

Indexes:

- `agendas_pkey` btree (`id`) UNIQUE
- `idx_agendas_created_by` btree (`created_by`)
- `idx_agendas_created_by_date` btree (`created_by, start_time`)
- `idx_agendas_created_by_status` btree (`created_by, status`)

Triggers:

- `trg_audit_agendas` AFTER INSERT/DELETE/UPDATE → `public.audit_log_table_changes()` (SECURITY DEFINER). Setiap tulis agenda menghasilkan baris audit.

RLS: `relrowsecurity = true`, `relforcerowsecurity = false`.

Grants (informasional): `anon`, `authenticated`, `postgres`, `service_role`
memiliki SELECT/INSERT/UPDATE/DELETE (dan TRUNCATE/REFERENCES/TRIGGER). Karena
semua policy `to authenticated`, `anon` secara efektif tidak mendapat baris.

Tidak ada kolom generated dan tidak ada **automatic status persist**: status
otomatis murni dihitung di klien (`getAutomaticStatus`). Kolom `status` dapat
berisi nilai apa pun dari enum.

### 6.2 Agregat data staging (tanpa PII, tanpa isi agenda)

| Metrik | Nilai |
| --- | --- |
| total baris | 0 |
| aktif (`deleted_at is null`) | 0 |
| soft-deleted | 0 |
| per status (Scheduled/Ongoing/Completed/Deleted/Overdue/null) | 0/0/0/0/0/0 |
| `description` null/kosong | 0 |
| `location` null/kosong | 0 |
| `start_time` / `end_time` null | 0 / 0 |
| owner unik (`created_by`) | 0 |
| `created_by` null | 0 |
| rentang tanggal (earliest/latest) | null / null |
| multi-hari (`date(start)<>date(end)`) | 0 |
| `completed_at` terisi | 0 |
| inkonsistensi `completed_at` vs status | 0 |
| inkonsistensi `deleted_at` vs status | 0 |
| `updated_at > created_at` | 0 |
| baris `activity_logs` dengan `table_name='agendas'` | 0 |
| profil dengan atasan (indikator kandidat subordinate) | 220 |
| profil yang mungkin atasan (punya anak langsung) | 60 |

**Temuan kunci:** tabel `agendas` di staging **kosong**. Artinya tidak ada data
bisnis agenda yang berisiko hilang di staging. Namun **production tidak boleh
diasumsikan kosong.** Audit agregat read-only production wajib dilakukan
sebelum CAL-03C/CAL-03D menghapus jalur tulis lama dan sebelum memutuskan
backfill produksi (lihat §7.6). Indikasi "description sebagai realisasi" tidak
dapat diukur dari data staging karena nol baris; harus diukur ulang di production
secara agregat dan aman.

## 7. RLS Matrix (dibuktikan dari policy aktual)

Policy aktif pada `public.agendas` (dari `pg_policies` dan migration
`20260622171000_consolidate_core_rls_policies.sql`):

| Aksi | Policy | Ekspresi | Konsekuensi |
| --- | --- | --- | --- |
| SELECT | `agendas_select_scope` (authenticated) | `created_by = auth.uid() OR created_by IN (recursive descendants via profiles.parent_id)` | user SELECT **own** ✓; atasan SELECT **seluruh bawahan** (anak, cucu, dst) ✓; **peer tidak terlihat** (tidak ada klausa peer) |
| INSERT | `agendas_insert_own` (authenticated) | `with check (created_by = auth.uid())` | user INSERT **own** ✓; tidak bisa menyisipkan atas nama orang lain |
| UPDATE | `agendas_update_own` (authenticated) | `using (created_by = auth.uid()) with check (created_by = auth.uid())` | user UPDATE **own** ✓; **atasan TIDAK bisa UPDATE baris bawahan** ✓; tidak bisa memindahkan kepemilikan |
| DELETE | `agendas_delete_own` (authenticated) | `using (created_by = auth.uid())` | user DELETE **own** ✓; **atasan TIDAK bisa DELETE baris bawahan** ✓ |

Kesimpulan yang diminta:

- user SELECT own — **terbukti** (`created_by = auth.uid()`).
- parent SELECT descendants — **terbukti** (CTE rekursif `profiles.parent_id`).
- user INSERT own — **terbukti** (`with check`).
- user UPDATE/DELETE own — **terbukti** (`using`).
- parent tidak dapat UPDATE/DELETE bawahan — **terbukti** (`using` membatasi ke own).
- **Admin behavior:** **tidak ada** policy khusus admin pada `agendas`.
  `public.is_current_user_admin()` hanya dipakai untuk `profiles`, bukan
  `agendas`. Jadi admin berperilaku sama seperti user terautentikasi biasa
  (own + descendants). **Jangan mengasumsikan admin bisa mengubah agenda siapa
  pun.** Perilaku admin cukup untuk target "atasan hanya membaca bawahan";
  prinsip read-only atasan sudah ditegakkan di level RLS, bukan hanya UI.

Catatan soft-delete: aplikasi memakai UPDATE (`deleted_at`, `status='Deleted'`)
untuk hapus (`agenda.service.deleteAgenda`), yang membutuhkan izin UPDATE own.
Policy DELETE fisik ada tetapi tidak dipakai alur aplikasi saat ini. Target
desain harus memutuskan: pertahankan soft-delete (disarankan, demi historis) dan
tetap pakai UPDATE policy.

### 7.1 Anonim

Tidak ada policy `to anon`/`public`. Meski `anon` memiliki grant tabel, RLS
menolak baris. Tidak ada akses anonim.

## 8. Target Contract CAL-03

### 8.1 Route

- `/calendar` — satu-satunya entry point (canonical).
- `/agenda` — **404**, tanpa redirect. Setelah `<Route path="/agenda">` dihapus,
  path jatuh ke route `*` (NotFound) yang sudah ada.
- Tidak ada menu, breadcrumb, atau dokumen yang menautkan `/agenda`.

### 8.2 Views

| View | Isi | Akses |
| --- | --- | --- |
| **Hari Ini** (default) | Daftar/timeline entri hari berjalan | semua user |
| **Minggu** | Grid 7 hari | semua user |
| **Bulan** | Grid bulan | semua user |
| **Progres Tim** | Ringkasan progres bawahan (read-only) | hanya user yang punya bawahan (`isParentUser`) |
| **Arsip** | Filter status/hapus (soft-deleted/Completed) | sebagai filter, bukan view terpisah |

Aturan akses atasan: **read-only** untuk baris bawahan. Ini konsisten dengan RLS
(§7): atasan hanya bisa SELECT, tidak bisa UPDATE/DELETE baris bawahan. UI tidak
perlu mekanisme tambahan selain menyembunyikan aksi tulis untuk baris yang bukan
milik user.

### 8.3 Canonical fields (evaluasi, belum migration)

| Field target | Sumber existing | Catatan desain |
| --- | --- | --- |
| `title` | `agendas.title` | wajib; pertahankan |
| `realization` | `agendas.description` | **keputusan:** description saat ini dipakai sebagai realisasi pada sebagian UI. Perlu kolom eksplisit atau pemetaan terdokumentasi. Jangan andalkan data staging (0 baris) untuk memutuskan; audit production agregat dulu |
| `work_date` | `date(start_time)` | turunan; pertimbangkan generated column atau kolom eksplisit untuk query rentang cepat |
| `entry_type` | — | **baru**: `work` \| `event` \| `availability`; butuh enum + default |
| `is_all_day` | — | **baru**: boolean; menggantikan konvensi 00:00–23:59 |
| `start_time` / `end_time` | `agendas.start_time/end_time` | **ubah**: menjadi optional secara UX (mis. `availability`/`all_day` tanpa jam). Schema saat ini NOT NULL |
| `status` | `agendas.status` | pertimbangkan menyederhanakan enum atau memindahkan auto-status ke DB untuk satu sumber kebenaran |
| `blocked_reason` | — | **baru**: text nullable, untuk entri `availability`/terblokir |
| `created_by` | `agendas.created_by` | pertahankan; RLS bergantung padanya |
| `completed_at` | `agendas.completed_at` | pertahankan |
| `deleted_at` | `agendas.deleted_at` | pertahankan (soft delete) |

**Tidak ada migration pada CAL-03A.** Desain final dan strategi backfill
ditentukan di CAL-03B.

### 8.4 Backfill strategy (rekomendasi untuk CAL-03B)

Karena staging `agendas` kosong, backfill staging bersifat no-op. Untuk
production:

1. Ukur agregat production read-only (jumlah, distribusi status, `description`
   non-kosong, multi-hari, rentang tanggal) tanpa menarik PII.
2. Pemetaan langsung (lossless): `title→title`, `created_by→created_by`,
   `status→status`, `completed_at→completed_at`, `deleted_at→deleted_at`.
3. Field baru diberi default aman: `entry_type='work'`, `is_all_day=false`,
   `blocked_reason=null`, `realization` dari `description` **hanya bila** hasil
   audit production menunjukkan description memang dipakai sebagai realisasi;
   jika tidak, pertahankan description sebagai catatan.
4. `location`: pertahankan sebagai kolom legacy (jangan drop) sampai ada
   keputusan produk; nilai lama tetap tersimpan.
5. Migration harus **forward-only, aditif, idempotent**, kompatibel dengan versi
   aplikasi yang sedang berjalan selama promosi (add nullable column + backfill
   + default), bukan rename/drop destruktif dalam satu langkah.

## 9. Characterization Tests (CAL-03A)

Ditambahkan sebagai safety net reusable untuk CAL-03B+:

| File | Mengunci perilaku | Catatan |
| --- | --- | --- |
| `src/test/work-calendar-agenda-adapter.test.ts` | Ownership mapping (`created_by↔createdBy`), status default, snake→camel, pruning `undefined` | Menguji `agenda.adapter` (kode yang akan dihapus) sebagai **kontrak realisasi**, bukan boundary permanen |
| `src/test/work-calendar-status-mapping.test.ts` | Status mapping `getAutomaticStatus`: `Completed`/`Deleted` final, future→`Scheduled`, in-window→`Ongoing`, past→`Overdue`, `endTime` absen → +60 menit | Pure, tanpa network |
| `src/test/work-calendar-timezone.test.ts` | Konversi waktu lokal (offset) dan `parseLocalDateInput` mempertahankan tanggal kalender lokal; round-trip wall-clock | Frozen contract (fungsi `toLocalIso` masih inline di UI) |
| `src/test/work-calendar-hierarchy-visibility.test.ts` | `isParentUser`, `getUserHierarchy`, `getChildUsers`: self selalu termasuk, rekursi descendants, exclude `deleted_at` | Supabase di-mock fail-closed; tanpa network |
| `src/test/work-calendar-export-contract.test.ts` | Field export: kolom `TANGGAL, AGENDA, DESKRIPSI, MULAI, SELESAI, DURASI, STATUS` + pemetaan baris + warna status | jsPDF/ExcelJS/file-saver di-mock; tidak menulis file |
| `src/test/work-calendar-agenda-schema.test.ts` | Validasi form: `title` ≥ 3, `end > start`, enum status, default `Scheduled` | Pure zod |

Prinsip:

- Tidak ada network nyata, tidak ada DB write, dependency eksternal di-mock
  fail-closed.
- Test strict-typed tanpa `any` eksplisit, double-cast, atau `@ts-*`.
- Perilaku yang **sengaja dihapus** (mis. route `/agenda`, `location`,
  `AgendaTabs`/`AgendaCard`) **tidak** dikunci sebagai boundary test; hanya
  didokumentasikan di removal map (§10).

## 10. Removal Map

Kolom "Pass" mengacu pada tahap:
**B** = CAL-03B (fondasi data aditif), **C** = CAL-03C (cutover UI/route),
**D** = CAL-03D (cleanup service/tipe/docs/test), **X** = pass rename terpisah.

| # | Objek saat ini | Consumer | Aksi target | Pengganti | Pass |
| --- | --- | --- | --- | --- | --- |
| 1 | `App.tsx:22` lazy `AgendaPage` | route | DELETE | — | C |
| 2 | `App.tsx:193` route `/agenda` | navigasi | DELETE (404, tanpa redirect) | `/calendar` | C |
| 3 | `App.tsx:194` route `/calendar` | navigasi | KEEP | halaman Kalender Kerja | C |
| 4 | `AgendaPage.tsx` | route `/agenda` | DELETE | `CalendarPage` baru | C |
| 5 | `Sidebar.tsx:305` link Agenda | navigasi | DELETE | — | C |
| 6 | `Sidebar.tsx:304` link Kalender | navigasi | KEEP, ubah label `Kalender Kerja` | — | C |
| 7 | `AppLayout.tsx:11` title `/agenda` | layout | DELETE | — | C |
| 8 | `AppLayout.tsx:10` title `/calendar` | layout | KEEP, sesuaikan subtitle | — | C |
| 9 | `Header.tsx` `onNewAgenda` prop | dormant | DELETE | — | D |
| 10 | `AgendaTabs.tsx` | AgendaPage | DELETE | view baru | C |
| 11 | `AgendaCard.tsx` | AgendaTabs | DELETE | `WorkEntryChip`/kartu baru | C |
| 12 | `AgendaModal.tsx` | AgendaPage, CalendarPage | REPLACE | `WorkEntryModal` (field target) | C |
| 13 | `AgendaDetailModal.tsx` | AgendaPage, CalendarPage | REPLACE | `WorkEntryDetailModal` | C |
| 14 | `AgendaParentFilter.tsx` | Dashboard, ActivityLogs, Calendar, Agenda | KEEP SHARED (rename) | `TeamScopeFilter` | X |
| 15 | `CalendarView.tsx` | CalendarPage | REPLACE | multi-view calendar | C |
| 16 | `CalendarAgendaItem.tsx` | CalendarView | REPLACE | `WorkEntryChip` | C |
| 17 | `components/ui/calendar.tsx` | Surat/Inbox/Riwayat | KEEP SHARED | — | — |
| 18 | `lib/utils.getAutomaticStatus` | CalendarView | MOVE ke domain kalender | helper domain | D |
| 19 | `lib/local-date.parseLocalDateInput` | surat/forms | KEEP SHARED | — | — |
| 20 | `data/mockData.ts` | tidak ada | DELETE | — | D |
| 21 | `services/agenda.service.ts` | AgendaPage, CalendarPage, ActivityLogsPage | REPLACE lalu DELETE | service domain kalender | D |
| 22 | `services/agenda-filter.service.ts` | dormant | DELETE | — | D |
| 23 | `adapters/agenda.adapter.ts` | dormant | DELETE | — | D |
| 24 | `adapters/index.ts:1` export | internal | DELETE | — | D |
| 25 | `services/export.service.ts` exportCalendarData | CalendarPage | REPLACE | exporter domain kalender (kontrak field tetap) | D |
| 26 | `services/index.ts:5` export agenda.service | internal | DELETE | export domain baru | D |
| 27 | `types/agenda.ts` `Agenda*` | banyak | REPLACE | `types/work-calendar.ts` | D |
| 28 | `types/agenda.ts` `User`, `Role` | banyak | MOVE | `types/user.ts` | D |
| 29 | `types/agenda.ts` `ActivityLog`, `ActivityAction` | activity/dashboard | MOVE | `types/activity-log.ts` | D |
| 30 | `types/agenda.ts` `KPIData`, `ChartData` | dashboard | MOVE | `types/dashboard.ts` | D |
| 31 | `RealtimeSync.tsx` agenda query key | global | KEEP, sesuaikan key | key domain baru | C |
| 32 | `dashboard.service.ts` | Dashboard | KEEP, sesuaikan agregasi | — | C/D |
| 33 | `ActivityLogsPage/View` label `agenda` | Activity Logs | KEEP (bergantung `table_name`) | — | — |
| 34 | `pages/docs/content/user/agenda.ts` | docs registry | REPLACE | bagian Kalender Kerja | C |
| 35 | `pages/docs/content/user/calendar.ts` | docs registry | REPLACE | topik utama | C |
| 36 | `docs/content/user/index.ts` topic list | docs | sesuaikan | — | C |
| 37 | `docs/content/navigation.ts:16-17` slug | docs | sesuaikan | — | C |
| 38 | `DocsArticle.tsx:38-40` related titles | docs | sesuaikan | — | C |
| 39 | `docs-user-content.test.ts` (jumlah/urutan/hash) | test | sesuaikan bersama docs | — | C |
| 40 | `plugins/docs content version/changelog.ts` | changelog | JANGAN ubah di CAL-03A | — | — |

Pass pemulihan/hapus sederhana: setelah cutover (C) stabil, hapus service/adapter/
tipe/test lama (D). Setiap pass tetap satu branch + satu PR ke `staging`.

## 11. Risiko dan Blocker

| Prioritas | Temuan | Dampak | Tindakan |
| --- | --- | --- | --- |
| P0 | Data production `agendas` belum diaudit (staging kosong) | Backfill dan keputusan `description→realization` bisa salah | Audit agregat read-only production sebelum CAL-03C; jangan lakukan pada CAL-03A |
| P0 | `start_time`/`end_time` NOT NULL, target butuh optional (all-day/availability) | Perlu migration + backfill aman | Desain di CAL-03B, forward-only |
| P1 | `AgendaParentFilter` dipakai Dashboard + Activity Logs | Hapus buta akan merusak dua fitur | KEEP SHARED; rename terpisah |
| P1 | Activity Logs bergantung `table_name='agendas'` | Ganti nama tabel akan memutus label | Pertahankan tabel; label produk terpisah |
| P1 | `docs-user-content.test.ts` mengunci hash docs | Perubahan docs CAL-03C memecah test | Perbarui test + hash di pass yang sama |
| P1 | Empat definisi status visual | Inkonsistensi warna/label | Satukan di domain baru (CAL-03C) |
| P2 | `types/agenda.ts` mencampur `User` lintas fitur | Refactor tipe berisiko luas | Pisahkan di pass khusus, dokumentasi consumer ada di §5 |
| P2 | `getAgendasForParent` ganda (satu dormant) | Kebingungan maintenance | Hapus varian dormant di CAL-03D |

## 12. Keputusan yang Masih Diperlukan

1. Perlakuan `location`: drop, pertahankan dorman, atau ubah menjadi `blocked_reason`/`location` terpisah?
2. Apakah `description` **menjadi** `realization` (dengan migrasi nilai), atau tetap catatan bebas dan `realization` kolom baru?
3. Apakah auto-status dipindahkan ke DB (generated/trigger) atau tetap dihitung klien? (mempengaruhi single source of truth)
4. Apakah export Excel/PDF dipertahankan dengan kontrak field yang sama persis, atau boleh berubah bentuk pada fitur baru?
5. Batas akses Admin pada agenda: tetap setara user (sesuai RLS aktual) atau perlu policy admin baru? (perubahan RLS = migration baru)
6. Target `entry_type`/`is_all_day`/`blocked_reason`: apakah benar-benar dipakai di iterasi pertama, atau ditunda agar migration minimal?

## 13. Konfirmasi Batasan CAL-03A

- Tidak ada perubahan UI, route, sidebar, breadcrumb, atau layout runtime.
- Tidak ada perubahan schema, RLS, grant, trigger, atau migration.
- Tidak ada DB write; audit database staging murni read-only.
- Tidak ada akses atau query ke production.
- Tidak ada merge dan tidak ada deployment.
- Tidak ada perubahan `index.html` atau perubahan lokal pengguna.
- Test baru tidak memakai network nyata, tidak menulis DB, dependency eksternal
  fail-closed, dan tidak memakai `any` eksplisit/double cast/`@ts-*`.
- `changelog.ts` dan versi aplikasi tidak diubah.
