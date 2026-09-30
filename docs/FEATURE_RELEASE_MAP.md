# SIGAP Feature and Release Map

Snapshot audit: 2026-08-04 (Asia/Jakarta)

Dokumen ini adalah baseline untuk menentukan fitur mana yang berada di staging,
fitur mana yang boleh dipromosikan ke production, dan cara menarik fitur dari
production tanpa merusak data atau fitur lain. Perbarui dokumen ini pada setiap
PR fitur, perubahan schema, atau perubahan deployment.

## 1. Sumber Kebenaran

Status pada dokumen ini diverifikasi dari:

- route dan menu aplikasi React;
- service browser dan endpoint Fastify di `backend/src`;
- migration PostgreSQL dan schema PostgREST kedua project Supabase;
- container yang berjalan pada `ubuntu-server`;
- riwayat commit dan branch remote GitHub;
- dokumentasi OpenAPI Marison External API staging.

Arti status:

| Status | Arti |
| --- | --- |
| Production + Staging | Tersedia pada kedua environment saat snapshot dibuat |
| Staging only | Hanya boleh diuji di staging dan belum boleh dipromosikan |
| Dormant | Source atau schema masih ada, tetapi runtime/entry point tidak aktif |
| Removed | Sudah sengaja dikeluarkan dari alur aktif |
| Drift | Versi runtime tidak sama dengan source/worker yang seharusnya |
| Development branch | Sedang dibangun dan belum boleh dianggap tersedia di staging atau production |

## 2. Snapshot Environment

| Area | Production | Staging | Kesimpulan |
| --- | --- | --- | --- |
| Domain | `sigap.marisoncloud.com` | `sigap.marison-testing.biz.id` | Sudah terpisah |
| App container | `agenda-flow-prod` | `agenda-flow-staging` SHA `b368fd6` (healthy) | Keempat service staging sehat; production tidak diubah |
| PDF worker | `agenda-pdf-worker` | `agenda-pdf-worker-staging` (up, started) | Staging sudah ikut image terbaru |
| Marison outbound worker | `agenda-marison-outbound-staging` | Up 20+ hours (healthy) | Tidak diubah deployment ini; sehat |
| Marison sync | — | `agenda-marison-sync-staging` (started) | Cron sync aktif |
| Git source | `main` @ `aca7cfc` | `staging` @ `b368fd6` | staging 97+ commit di depan main |
| Supabase project | `xuhyodtmgwteyslhrkfx` | `wrufczusfopgvwvxsmjk` | Database sudah terpisah |
| PostgREST objects | 48 table/view | 48 table/view | Tidak ada perbedaan object |
| RPC | 51 RPC | 51 RPC | Tidak ada perbedaan RPC |
| PDF worker | Source commit `8918d34` | Source terbaru saat deploy | Production worker mengalami drift |
| Marison environment | Dikunci `production` | Dikunci `staging` | Tidak dapat ditukar dari browser |
| Marison outbound host | `external.marisonregency.id` | `marison-external.digivasi.com` | Sudah terisolasi |
| Realtime Sidebar | Konfigurasi publication belum diaudit penuh | Lima tabel sudah dipublikasikan | Staging telah lulus tes SSE end-to-end |
| Deployment | Docker Compose manual | Docker Compose manual | Belum ada GitHub Actions berbasis branch |

Catatan: commit dokumentasi dan migration yang lebih baru dari image tidak selalu
berarti app container tertinggal. Audit source dilakukan dengan hash isi file,
bukan hanya waktu pembuatan image.

> **Hotfix Dockerfile 2026-08-04**: Commit `83abeb0` (`fix(docker): include
> marison-rejection-diagnosis.mjs in staging image`) dipush langsung ke branch
> `staging` sebagai darurat karena container tidak dapat start tanpa file tersebut.
> Perubahan ini **belum melalui PR**. Saat PR #89 dirilis ke `main`, Dockerfile
> harus memuat baris COPY yang sama agar production image tidak mengalami error
> identik. Pastikan Dockerfile di branch rilis production sudah menyertakan baris:
> `COPY server/marison-rejection-diagnosis.mjs ./server/marison-rejection-diagnosis.mjs`

## 3. Kondisi GitHub

| Komponen | Status saat audit | Tindakan yang diperlukan |
| --- | --- | --- |
| `main` | Ada; saat ini menjadi source seluruh runtime | Pertahankan sebagai production |
| `staging` | Sudah ada; 88 commit di depan `main` saat snapshot | Gunakan hanya sebagai target PR pengujian staging |
| `feature/*` | Belum menjadi alur baku historis | Wajib untuk fitur baru |
| `fix/*` | Belum menjadi alur baku historis | Wajib untuk perbaikan rutin |
| GitHub Actions | Quality workflow aktif; Node.js 24 dan affected-test PR candidate | PR menjalankan lint, typecheck, dan test terdampak; push staging/main tetap full quality sebelum deploy manual |
| Branch protection | Tidak tersedia untuk repository private pada paket GitHub saat ini | Gunakan review/check PR secara manual atau upgrade paket |
| Selective release | Belum dapat diandalkan dari branch staging | Promosikan branch fitur langsung ke `main` |

Aturan operasional lengkap berada di root `AGENTS.md`.

## 4. Peta Fitur

### 4.1 Platform, Akun, dan Keamanan

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| AUTH-01 | Login email/password dan remember session | Production + Staging | Login page, BFF auth, Supabase Auth | `profiles`, cookie session | Risiko tinggi; jangan ditarik, hanya ganti mekanisme |
| AUTH-02 | Session HttpOnly terenkripsi dan facade BFF | Production + Staging; staging memakai Fastify | `backend/src`, `shared/src`, `src/lib/supabase.ts` | Seluruh query browser | Cross-cutting; tidak boleh direvert parsial |
| AUTH-06 | Runtime Fastify TypeScript tanpa server legacy | Staging deployed dan smoke-tested 27 Juli 2026 | Fastify routes/services/domain runtime, healthcheck, graceful shutdown | AUTH-01 sampai AUTH-05, seluruh API domain | Runtime staging tidak memiliki `/app/server.mjs`; branch membawa baseline staging dan belum dapat dipromosikan selektif ke production sebelum dependensi staging dirilis |
| AUTH-03 | Reset password via email recovery link | Production + Staging | Reset page, SMTP, auth endpoints | Supabase Auth, SMTP | Nonaktifkan route dan email bersama-sama |
| AUTH-04 | Rate limit login dan reset password | Production + Staging | In-memory server rate limits | BFF auth | Jangan ditarik tanpa pengganti keamanan |
| AUTH-05 | Role user/admin dan route protection | Production + Staging | `AdminOnlyRoute`, RLS, profile role | Seluruh menu admin | Risiko tinggi; perubahan harus audit RLS |
| AUTH-07 | Profile-field dan active-account authorization hardening | Staging deployed and smoke-tested 29 Juli 2026 | Sensitive profile-field trigger, PostgREST active-profile pre-request, Fastify session rejection, canonical active-admin checks, entity/office RLS, admin route guards | AUTH-01, AUTH-02, AUTH-05, ADM-01, ADM-04, ADM-06, AUD-01 | Security control; jangan tarik parsial setelah diterapkan. Auth token revocation dan source privileged account handlers masih follow-up |
| SEC-01 | Dependency hardening: React 19, React Router v8, ExcelJS streaming fail-closed, js-yaml 4.3.1, dan nanoid 3.3.18 | Staging deployed; nanoid advisory fix pending staging review | React Router integration tests, ExcelJS workbook round-trip, clean install, audit, Docker, and staging smoke tests | Target staging only; do not change production or database |
| ARCH-01 | Standar struktur project dan refactor boundary awal | Development branch | `docs/PROJECT_STRUCTURE_GUIDE.md`, backend BFF runtime module, surat feature API facades, pure SuratForm/Inbox helpers | AUTH-02, SUR-01, SUR-06 | Behavior-preserving; tidak mengubah schema/API bisnis. Jika ditarik, kembalikan import helper ke file lama dan hapus facade feature tanpa migrasi data |
| PROF-01 | Profil, tema, dan avatar privat ber-thumbnail | Production + Staging | Settings, avatar BFF, storage | `profiles`, bucket `avatars`, self-hosted storage | UI dapat disembunyikan; storage/data tetap dipertahankan |

### 4.2 Agenda, Kalender, dan Dashboard

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| DASH-01 | Dashboard ringkasan agenda dan surat | Production + Staging | Dashboard pages/services | Agenda, surat, attention | UI-only bila hanya menu yang ditarik |
| DASH-02 | Aktivitas agenda per departemen | Production + Staging | BFF department activity | `agendas`, hierarchy office | Hapus endpoint dan widget bersama-sama |
| AGD-01 | CRUD agenda dan status otomatis | Production + Staging | Agenda page/service | `agendas`, office hierarchy | Pertahankan data; nonaktifkan write lebih dahulu |
| AGD-02 | Filter agenda berdasar hirarki organisasi | Production + Staging | Agenda filter service | offices, profiles | Bergantung pada master organisasi |
| CAL-01 | Kalender agenda dan navigasi tanggal | Production + Staging | Calendar page/components | Agenda | Aman ditarik sebagai UI bila agenda tetap ada |
| CAL-02 | Export kalender | Production + Staging | Export service | Agenda/calendar | Aman ditarik terpisah |
| CAL-03 | Unified Work Calendar — route cutover /calendar, team members RPC, profile repository (F3); F4A: ketepatan filter Tim, keterbacaan dark mode, label aksi tambah kontekstual; F4A Director Scale: Team Overview server-side (pagination + agregat); F4B: detail entri responsif (side sheet 480–560px desktop/tablet, dialog layar penuh mobile) di Hari/Minggu/Bulan/Tim + Quick Add dari area tanggal kosong Minggu/Bulan; F5: siklus hidup pekerjaan (satu pekerjaan = satu baris, aksi "Lanjutkan hari ini"/"Ubah jadwal"/"Terhambat"/"Selesai" hanya PATCH baris yang sama), histori peristiwa server-side, tenggat `due_date`, warna penanda statis aksesibel, dan timeline peristiwa di panel detail; F6: hari & jam kerja diturunkan dari konfigurasi KPI existing (read-only, default Senin-Jumat 08:00-17:00), tabel `holidays` (libur nasional/cuti bersama) dengan impor terkurasi, dan pembeda visual nonkerja/libur berlabel di tampilan Hari/Minggu/Bulan; F7: ringkasan pekerjaan hari ini & tertunda di dashboard (`get_work_calendar_dashboard_entries`), notifikasi lonceng berbasis tabel `notifications` bersama (badge angka + ikon kategori, generator on-demand idempotent `generate_work_calendar_notifications` untuk tenggat terlewati/pengingat tindak lanjut/eskalasi atasan dengan dedupe unik + debounce 6 jam serta eskalasi berbasis hari kerja) dan integrasi `work_calendar_events` ke modul Aktivitas Terbaru (`get_my_recent_work_calendar_events`); F8: penutupan produk — manual Kalender Kerja `docs/CAL-03_WORK_CALENDAR.md`, changelog gabungan staging, audit aksesibilitas ringan termasuk Dark Mode (tanpa fitur/kolom database baru) | Production deployed 2026-09-23 (PR #333, SHA 0acbdf1; F1-F8, tanpa fixture/config staging-only) | `src/pages/work-calendar/WorkCalendarPage.tsx`, `src/features/work-calendar/**` (termasuk `lib/work-calendar-add-action.ts`, `lib/work-day-config.ts`, `lib/work-team-overview.ts`, `data/supabase-work-team-overview-repository.ts`, `data/supabase-work-calendar-settings-repository.ts`, `data/work-calendar-holiday-mapper.ts`, `components/WorkCalendarDayBadge.tsx`, `hooks/use-work-team-overview.ts`, `components/TeamOverviewView.tsx`, `components/TeamOverviewFilters.tsx`), `supabase/migrations/20260915093000_work_calendar_team_members.sql`, `supabase/migrations/20260916170000_work_calendar_team_overview.sql`, `supabase/migrations/20260916171000_work_calendar_team_overview_scale.sql`, `supabase/migrations/20260917120000_work_calendar_lifecycle.sql`, `supabase/migrations/20260918090000_work_calendar_holidays.sql`, `supabase/migrations/20260918120000_work_calendar_notifications.sql`, `supabase/tests/work_calendar_team_members.integration.sql`, `supabase/tests/work_calendar_team_overview.integration.sql`, `supabase/tests/work_calendar_team_overview_scale.integration.sql`, `supabase/tests/work_calendar_lifecycle.integration.sql`, `supabase/tests/work_calendar_holidays.integration.sql`, `supabase/tests/work_calendar_notifications.integration.sql`, `scripts/test-work-calendar-sql.mjs`, `scripts/import-holidays.mjs`, `supabase/data/holidays.example.csv`, `src/index.css` (blok `.work-calendar-scope`), `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Header.tsx` (badge angka + ikon notifikasi kalender), `src/components/dashboard/Dashboard.tsx` (widget ringkasan), `src/components/dashboard/RecentActivity.tsx`, `src/services/dashboard.service.ts`, `src/services/notification.service.ts`, `src/test/work-calendar-*.test.*` | `profiles` (hierarchy parent_id), `master_offices`, `master_departments`, `department_kpi_configs` (dibaca, tidak diubah); audit logs; tabel `agendas` dan modul legacy dipertahankan di database | Route `/calendar` aktif sebagai kanonikal, route `/agenda` dilepas; migration team members siap diuji di staging. F4A F3 tidak menambah migration/schema: kelompok, metrik, dan rasio Tim kini dibangun dari `visibleEntries` sehingga satu anggota terpilih hanya menampilkan pekerjaannya, override kontras/hierarki gelap dibatasi pada `.work-calendar-scope` (light `--primary` 30%, `--destructive` 45%, dark `--primary` 62%), dan aksi tambah memakai label kontekstual per tampilan tanpa duplikasi di Hari. F4A Director Scale menambah migration `20260916170000_work_calendar_team_overview.sql` berisi RPC `list_work_calendar_team_overview` (scope `auth.uid()` recursive descendants, page 25 + `total_count` + agregat seluruh filtered result), `list_work_calendar_team_overview_options` (opsi Kantor/Departemen/Anggota terotorisasi), dan `list_work_calendar_member_entries` (lazy-load per anggota/tanggal, menolak self/anon). Semua `security invoker`, `search_path = ''`, revoke anon + grant authenticated. Filter runtime (Kantor → Departemen → Anggota) hanya mempersempit; Entitas belum diimplementasikan karena tidak dapat diturunkan per-anggota dari relasi kanonikal. Migration telah diterapkan ke production pada 2026-09-23. Koreksi final F4A Director Scale (`20260916171000_work_calendar_team_overview_scale.sql`, diterapkan ke production 2026-09-23) menyambungkan `createSupabaseWorkTeamOverviewRepository` dari `WorkCalendarPage` ke `WorkCalendarWorkspace` pada route `/calendar` nyata, menghapus eager `listTeamMembers()` (bootstrap hanya profil sendiri + probe boolean `has_work_calendar_team_members()`), memakai satu `calendar.anchorDate` untuk heading/query/agregat/lazy detail, memindahkan state filter/page ke React Router (Back/Forward/refresh/deep link), membatalkan request basi dan menutup detail saat konteks berubah, serta menambah pencarian Anggota terbatas server (`search_work_calendar_team_members`, hard cap 50) yang lazy. RPC baru 171000: `has_work_calendar_team_members()`, `search_work_calendar_team_members(text, integer, integer, uuid, uuid)`, `get_work_calendar_team_member(uuid)`; `list_work_calendar_team_overview_options()` dan `list_work_calendar_team_overview(...)` di-`create or replace` dengan offset di-clamp lewat `ranked` CTE (`row_number()` + `WHERE`) agar halaman di luar rentang tidak menyimpulkan `total_count = 0`. F4B tidak menambah migration/schema maupun kontrak repository: satu pola detail entri dipakai di keempat tampilan (side sheet dari kanan 480–560px pada desktop/tablet, dialog layar penuh pada mobile) dengan focus trap, fokus awal ke heading, Escape/tombol tutup/overlay menutup, fokus kembali ke pemicu, dan seleksi `entry` disimpan di query param sehingga Browser Back menutup detail serta id tidak valid/tidak terotorisasi dibuang setelah data selesai dimuat. Edit dilakukan di dalam sheet yang sama (crossfade detail↔editor, tanpa modal bertumpuk); entri bawahan tetap read-only. Quick Add dari area tanggal kosong Minggu/Bulan menampilkan tanggal target, memfokuskan input judul, Enter menyimpan/Escape membatalkan, anti double-submit, error tetap di panel, dan aksi "Tambah detail" menuju editor lengkap tanpa entry ganda; `+N lainnya` serta klik pekerjaan existing tetap membuka Hari/detail. Motion memakai Framer Motion terbatas (overlay 160ms, sheet 240ms, crossfade 120ms, reduced 80ms) dengan `useReducedMotion`. Audit visual menemukan dan memperbaiki dua regresi: permukaan `fixed` (overlay/sheet) semula menjadi anak `.sigap-page` sehingga `space-y-5` menambahkan `margin-top: 20px` dan membuat sheet terpotong 20px serta overlay menyisakan celah; permukaan itu kini dipindahkan ke `document.body` lewat portal. Anak `AnimatePresence` pada Quick Add mobile juga diberi kunci eksplisit agar tidak ada peringatan React duplicate key. |

### 4.3 Persuratan Inti

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| SUR-01 | Registrasi surat dinamis | Production + Staging | Surat form/service, registration RPC | Form usage, numbering, workflow, storage | Sangat tinggi; gunakan feature flag, jangan revert migration |
| SUR-17 | Matrix pengajuan SPK Unit/Non Unit, Aset, Dana kanonikal | Staging; pemulihan konfigurasi rekomendasi Aset pada branch perbaikan | Delapan jalur baru Pusat/Cabang, signer pemohon otomatis, pilihan Direksi, input operator pemeriksa yang terkonfigurasi; migrasi `20260917130000`–`20260917133000`, pemulihan rekomendasi `20260918100000`, dan tes SQL disposable | SUR-01, SUR-06, REC-03, PGD, master profil dan kantor | Kegunaan lama diarsipkan, tidak dihapus fisik; template rekomendasi lama tetap aktif khusus tugas tertaut dan disembunyikan dari pilihan biasa. Tiga jalur Aset kanonikal harus menunjuk template rekomendasi PBO/REK/UAI. Surat lama mempertahankan snapshot. Production tidak disentuh |
| MAR-10 | Form KEU 1 dan hierarki proyek Non Unit; status PGD dan tim pemeriksa per manajer | Production + Staging; perbaikan lanjutan KEU 1 kandidat staging | Editor/PDF/seed KEU 1, pilihan proyek KCP di bawah KC, status item PGD 1-4, judul pengajuan, migrasi `20260929070000`-`20260930140000` | SUR-01, SUR-17, master kantor/proyek/departemen, renderer PDF | KEU 1 Cabang dapat bernomor tanpa proyek. Kandidat lanjutan menambahkan input Free Cash, menyelaraskan ringkasan/ekspor/outbound KEU 1 dengan Kebutuhan Dana, dan memperbaiki border PDF. Pertahankan migrasi dan data saat menarik perubahan UI/renderer. |
| SUR-02 | Draft registrasi, reservasi nomor, dan sinkronisasi matrix aktif | Production + Staging; rekonsiliasi matrix kandidat diperkuat di staging | Draft/reservation RPC, tables, signer reconciliation | SUR-01, numbering, DOC-02 | Draft aktif selalu mengikuti kandidat dan tahap terbaru saat dibuka maupun sebelum submit; surat yang sudah terdaftar tetap memakai snapshot lama untuk audit |
| SUR-03 | Nomor surat atomik dan konfigurasi counter | Production + Staging | Numbering admin, RPC | Letter type, office/entity | Tidak boleh ditarik tanpa mekanisme nomor pengganti |
| SUR-04 | Lampiran awal dan lampiran approval | Production + Staging; lampiran tambahan opsional pemohon/pemeriksa telah diuji di staging (Issue #389) | Storage upload, attachment tables | Private storage, file authorization | Pertahankan file dan metadata saat UI ditarik; submit harus membaca ulang file draft dari database. Draft kegunaan kanonikal Cabang dan alur pemohon/pemeriksa fixture telah diuji di staging; fixture UJI STAGING tidak ikut production. |
| SUR-05 | Preview detail dan file viewer bertoken | Production + Staging | Preview modal, file token BFF | Storage, surat authorization | Jangan membuka public URL sebagai pengganti |
| SUR-06 | Inbox persetujuan | Production + Staging; pipeline dokumen native kandidat staging | Inbox page, signatures, snapshot database, upload lampiran | Workflow approval, attention, storage | Approval hanya mengubah data dan versi logis dokumen dalam transaksi; tidak mengunduh, mengubah, atau mengunggah XLSX. PDF final dibuat asinkron setelah status selesai sehingga tindakan approval tidak menunggu renderer |
| INBOX-01 | Compact Approval Inbox — server-side filter, lazy detail, pagination | Staging deployed; production RPC recovery hotfix candidate | BFF GET /api/surat/inbox (compact RPC), GET /api/surat/inbox/:id/detail (lazy, auth via is_inbox_task_active RPC); server-side filter: search, request_category, task_type; keyset cursor (available_at, task_type, id) base64-encoded; count only on first page; attention badge inboxCount uses get_compact_inbox_count; is_inbox_task_active canonical predicate; debounce search 400ms | SUR-06, AUTH-02, attention badge SQL | Staging uses 20260804081000_compact_inbox_rpc.sql and 20260919000050_separate_inbox_verification_tasks.sql. Production selective release omitted get_compact_inbox and is_inbox_task_active; 20260924090000_restore_production_compact_inbox.sql restores only those contracts and the result type without replacing production get_compact_inbox_count. Deploy and authenticated smoke required. |
| SUR-07 | Status pengajuan/monitoring pengguna | Production + Staging; detail-load reliability candidate | Monitoring page/service | Surat, signatures, revision | Detail memakai ID pilihan yang stabil, request lama dibatalkan, dan kegagalan dapat dicoba ulang tanpa refresh halaman |
| SUR-08 | Riwayat keterlibatan | Production + Staging | History page | Surat/signatures | UI dapat ditarik terpisah |
| SUR-09 | Monitoring admin dan pagination server-side | Production + Staging | Admin monitoring, monitoring RPC | Surat, admin role | UI/endpoint dapat ditarik bersama-sama |
| SUR-10 | Batas waktu proses approval | Staging follow-up candidate | SLA fields and calculations, warna navigasi aktif | Signatures, department KPI, attention state | Layanan Surat dan tab aktif hijau saat SLA aman, merah bila ada tugas aktif terlambat, lalu kembali hijau setelah terselesaikan; production belum disentuh |
| SUR-11 | Fondasi pure SuratForm tahap pertama | Development branch | Type lokal, parser schema, normalizer, dan formatter pure | SUR-01, characterization tests PR #95 dan #97 | Refactor behavior-preserving; tarik dengan mengembalikan symbol ke `SuratForm.tsx` tanpa perubahan data atau runtime contract |
| SUR-12 | Performa data awal permohonan dan upload gambar rekomendasi | Staging deployed; koreksi overflow picker desktop dalam review | Endpoint master data khusus BFF, session reuse upload, file picker rekomendasi | SUR-01, SUR-04, AUTH-02 | Input file harus benar-benar hidden agar fokus native picker tidak menggeser container desktop; production belum disentuh |
| SUR-13 | Auto-approval pemohon, akses dokumen scope organisasi, dan counter tahunan | Staging follow-up candidate | Signer initialization, monitoring RPC/RLS, letter number reservation | SUR-01, SUR-03, SUR-07, AUTH-02 | Satu departemen pusat atau satu kantor KC/KCP dapat membaca detail dokumen; akses lintas scope tetap ditolak; production belum disentuh |
| SUR-14 | Penandatangan dinamis 2-8 tahap | Staging candidate | Kegunaan Form, validasi registrasi, renderer PDF native | SUR-01, DOC-02, DOC-06 | Jumlah signer harus sama persis dengan konfigurasi aktif; tidak membuat tahap atau signer sintetis |
| SUR-16 | Routing revisi keputusan sistem departemen per kegunaan | Staging candidate | Kegunaan Form, external decision RPC, revision flow | SUR-01, SUR-02, SUR-14 | Snapshot dokumen membekukan penerima perbaikan dan tahap awal tanda tangan ulang; replay keputusan tetap idempotent; production belum disentuh |
| SUR-15 | API penolakan berbasis nomor dokumen | Staging candidate | `POST /api/surat/rejections`, RPC atomik, audit, notifikasi | SUR-06, AUTH-02, NTF-01 | Hanya signer aktif pada tahap berjalan; alasan wajib; replay identik idempotent dan keputusan berbeda fail-closed |

### 4.4 Workflow, Verification, Revision, dan Recommendation

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| WF-01 | Template workflow serial/parallel | Production + Staging | Workflow configuration | Forms, departments, users | Jangan tarik bila SUR-01 tetap aktif |
| WF-02 | Matriks tanda tangan dan label jabatan | Production + Staging | Form usage steps, display overrides | Profiles, job title config | Data snapshot lama harus tetap dapat dirender |
| WF-03 | Approval/reject atomik | Production + Staging | Approval RPC v2 | Signatures, notifications | Sangat tinggi; jangan revert ke client-side writes |
| WF-04 | Verifikasi input oleh pemeriksa | Production + Staging | Verification UI/RPC | Form step verifiers | Hanya tarik untuk form yang tidak menggunakannya |
| WF-05 | Autosave draft verifikasi | Production + Staging | Verification draft RPC | WF-04 | Dapat ditarik setelah memastikan tidak ada draft aktif |
| REV-01 | Revisi proses bertipe dan histori | Production + Staging | Revision events/RPC | Surat, signatures, attention | Forward migration; pertahankan histori |
| REV-02 | Revisi jumlah Unit membuka ulang alokasi sebelum approval | Staging candidate | Wrapper acceptance/resolution, checker task reopen, count/finalization guards, signer notifications | REV-01, MRN-04, SUR-06 | Migration forward-only; repair hanya open checker revision; approval diulang setelah alokasi sama dengan jumlah pengajuan; production belum disentuh |
| REV-02 | Tindak lanjut pemohon/tujuan revisi | Production + Staging | Follow-up page and badges | REV-01 | Jangan tarik bila revisi aktif masih terbuka |
| REC-01 | Rekomendasi PBO dan child document | Production + Staging; koreksi auto-approval pembuat pada staging | Recommendation tasks/RPC, shared asset recommendation policy; migration `20260918130000` mencegah lampiran item diminta ulang pada approval pembuat | Draft, linked documents, department PBO | Pilihan rekomendasi dan field payload hanya boleh tersedia untuk PBO. Submit rekomendasi menyelesaikan tahap pembuat secara otomatis; lampiran item tetap menjadi bukti dokumen dan tidak diduplikasi sebagai requirement approval |
| REC-02 | Reopen/finalize recommendation saat revisi | Production + Staging | Recommendation revision RPC | REC-01, REV-01 | Tidak dapat ditarik terpisah dengan aman |
| REC-03 | Rekomendasi aset multi-detail | UI dan backend/data deployed di staging; layout formulir PDF native dalam perbaikan | Canonical v1 contract, editor parent/detail dengan stable ID, beberapa detail dan gambar, keputusan tertaut pada Inbox, legacy flattening, PDF_PENDING finalization dan final-status PDF refresh, immutable render snapshot/fingerprint, stable audited external link, pre-POST all-rejected recheck | REC-01, SUR-01, WF-03, MRN-07 | Halaman pertama PDF native mengikuti struktur FM-UAI.HRD-30-00 dengan kolom lengkap, baris formulir, catatan, serta tanda tangan kanan bawah; halaman lampiran multi-detail tetap terpisah. Production tidak berubah |
| SUR-16 | Keputusan eksternal dan revision generation | Staging candidate; client-credentials + Zudoku candidate; provisioning scope diperbaiki | Callback M2M strict, scoped short-lived access token, raw-body HMAC, event idempotency, immutable revision history, Tindak Lanjut pemohon, routing Unit/Rekomendasi/umum, approval dan outbound generation baru | SUR-01, REC-03, MRN-17 | Consumer menukar `client_id`/`client_secret` melalui `/api/access-token`; client provisioning default ke scope `submission:decide`, menyimpan secret hanya dalam file operator yang aman, dan tidak menghentikan proses Node secara paksa. `event_id` tetap menjadi idempotency key bisnis. Static decision token hanya internal facade-to-backend. Zudoku disajikan sekali pada `/docs` dengan kontrak OpenAPI yang sama seperti runtime. Production tidak disentuh |

Catatan kandidat SUR-16 (Issue #328): branch `fix/unit-requester-revision-editability-01`
membuka hanya proyek dan jumlah unit pada draft revisi SPK Unit yang ditujukan ke
pemohon, mengarahkan pengguna langsung ke konteks tersebut, dan tetap memakai
validasi kapasitas backend sebelum perbaikan dikirim. Identitas dan nomor dokumen
tetap terkunci; production belum disentuh.

Koreksi lanjutan SUR-16 (Issue #180): draft revisi tetap memuat konfigurasi
Kegunaan historis yang sudah diarsipkan tanpa menampilkannya kembali sebagai
opsi pengajuan baru. Restore Form, Kegunaan, Proyek, dan Jumlah Unit tidak lagi
bergantung pada daftar Kegunaan aktif; teks escape literal pada Form & Lokasi
juga dihapus. Tidak ada migration atau perubahan data.

Koreksi staging SUR-16 (Issue #385): draft revisi yang kehilangan
`payload.externalRevision` dipulihkan dari `revision_event_id` dan event terbuka;
autosave mempertahankan konteks revisi. Validasi departemen pada revisi Unit
memakai departemen surat asal (bukan departemen profil tester), sementara
pengajuan baru tetap memeriksa departemen akun. Migration forward-only
`20260924180000_allow_validated_unit_project_revision.sql` mengizinkan proyek
Marison tersinkron yang valid pada revisi, menghapus alokasi lama ketika proyek
berubah, dan membiarkan alur checker membuka ulang verifikasi. Nomor dan
identitas surat tidak berubah. Production tidak termasuk koreksi ini.

### 4.5 Permohonan Unit, Non-Unit, Aset, dan Marison

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| MRN-01 | Lookup project Marison | Production + Staging | External data source `/projects` | Token + HMAC | Dapat dinonaktifkan per data source |
| MRN-02 | Lookup unit berdasarkan project | Production + Staging | `/unit?project_id=...` | MRN-01 | Dapat dinonaktifkan per form/data source |
| MRN-03 | Lookup non-unit berdasarkan project | Production + Staging | `/non-unit?project_id=...` | MRN-01 | Dapat dinonaktifkan per form/data source |
| MRN-04 | Alokasi unit, kode produksi, dan rekap | Production + Staging; guard kategori Unit dalam perbaikan staging | Surat form/service, production-code | Unit source, PDF attachments | Tombol Unit hanya boleh aktif bila matrix Unit cocok dengan departemen dan scope kantor; snapshot lama harus tetap terbaca |
| MRN-05 | Outbound submission unit | Staging enabled; production disabled by default | `/unit-submissions` POST | Surat selesai, project/unit/branch, approvals | Staging dapat memakai NIK uji tunggal tanpa mengubah profil; matikan dispatch flag untuk menonaktifkan |
| MRN-06 | Outbound submission non-unit | Staging enabled; canonical approval-role fix in review; production disabled by default | `/non-unit-submissions` POST | Surat selesai, non-unit items, approvals | SIGAP mempertahankan label jabatan untuk UI/PDF dan mengirim kategori role vendor `planning`, `marketing`, atau `director`; mengikuti kebijakan NIK staging MRN-05 |
| MRN-07 | Outbound asset purchase request | Staging enabled; final signature PDF readiness candidate; production disabled by default | `/asset-purchase-requests` POST | Surat selesai, branch, approvals; PDF rekomendasi hanya saat dipilih | Aset tanpa rekomendasi mengirim item pemohon dan dokumen pengajuan. Dokumen native final dapat memakai pointer PDF canonical atau snapshot PDF signer tahap tertinggi hanya bila seluruh tanda tangan lengkap; dokumen belum final tetap fail-closed. Aset dengan rekomendasi tetap fail-closed sampai PDF rekomendasi final tersedia |
| MRN-08 | Status, test koneksi, dan sinkron Integrasi Marison | Production + Staging; halaman khusus siap diuji di staging | `Konfigurasi > Integration`/BFF | Environment deployment, admin role | Environment switch via UI sudah removed; Integrasi tidak dicampur dengan Kegunaan Form |
| MRN-09 | Pemisahan host staging/production | Production + Staging | Compose + server config | `.env.staging`, `.env.production` | Kontrol keamanan; jangan ditarik |
| MRN-10 | Kontrak outbound kaya Aset dan Unit v1; draft kontrak Aset vendor v2 | Staging candidate; Aset v2 dokumentasi terpisah menunggu konfirmasi vendor | Schema strict, fixture JSON, builder outbound, `docs/contracts/marison/asset-v2` | MRN-05, MRN-07, kesiapan endpoint vendor | Jangan deploy atau ubah dispatch sebelum OpenAPI vendor sesuai dan contract test bersama lulus |
| MRN-15 | Override identitas outbound Marison staging | Staging deployed and smoke-tested 30 Juli 2026 | Admin override NIK/branch/project, audit, effective payload resolver | MRN-05, MRN-06, MRN-07, master sync | Staging-only; production override ditolak oleh migration dan runtime; production belum disentuh |
| MRN-16 | Mapping payload outbound Marison per Master Data | Staging deployed and smoke-tested 31 Juli 2026 | Record hasil sync otomatis memakai external identity; record lokal/trial memakai mapping katalog mirror employee/branch/project; per-signer NIK resolver; admin endpoint; effective payload resolver | MRN-15 compatibility data, MRN-11, MRN-13, ADM-01, ADM-06, ADM-07 | Migration dan deployment staging sudah diterapkan; acceptance backend rollback serta UI desktop/mobile lulus; `marison_review_required` tidak memblokir identity payload; data SIGAP dan production tidak berubah; singleton MRN-15 tidak digunakan payload. Fix 19 Agu 2026: gate form Non Unit/Non Aset menghormati mapping staging — BFF memperkaya `/api/surat/master-data` dengan kesiapan efektif (batch query via service role, staging-only) memakai rule yang sama dengan dispatcher (`resolveStagingProjectReadiness` di shared), snapshot `requested_project` memakai identitas efektif target, fallback kolom langsung tetap untuk non-staging |
| MRN-17 | Recovery dan pengiriman pengganti Outbound Marison | Staging deployed 4 Agustus 2026 (PR #89 merged, SHA 855c873) | Recovery pre-POST pada job yang sama; diagnosis konfigurasi mengarahkan admin ke User Organization, Master Kantor, atau Master Proyek; replacement pasca-HTTP 422 menampilkan diagnosis vendor spesifik (NIK, tipe unit, proyek, branch, atau generic) dengan safe context tanpa NIK atau payload mentah; preflight replacement read-only memvalidasi payload_body invariant, hash, surat final, dan signature lengkap; POST replacement menjalankan ulang preflight untuk mencegah TOCTOU; UI membedakan state checking/blocked/ready; konfirmasi perbaikan Marison wajib jika tidak ada perubahan SIGAP; generasi baru memakai idempotency key deterministik, audit append-only, dan satu job aktif; fix 19 Agu 2026 (staging): vendor mewajibkan keterangan pengajuan (`description`) non-kosong pada Unit/Non Unit, builder memakai `judul_surat` sebagai keterangan akhir, kontrak lokal menolak payload tanpa `description` sebelum POST | MRN-05, MRN-06, MRN-07, MRN-16 | Migration `20260803120000_marison_outbound_replacement_jobs.sql` sudah diterapkan; migration forward-only `20260803170000_fix_marison_resolution_source_array.sql` menghilangkan kegagalan array `projectId` pada Unit/Non Unit; production belum disentuh; Dockerfile hotfix `83abeb0` wajib disertakan saat rilis production |
| MRN-17P | Pemulihan manual outbound pre-POST production | Staging schema applied; app deploy pending, Issue #380 | Preflight read-only untuk environment yang cocok; konfirmasi production eksplisit di UI dan API; guard SQL atomik menolak job dengan jejak POST, respons, atau referensi vendor | MRN-17, `20260924160000_allow_persistent_outbound_file_tokens.sql` | Migration `20260924170000_guard_pre_post_outbound_recovery.sql`; deploy manual-terkontrol hanya setelah operator memverifikasi dan mengakui versi migration yang persis berubah. Tidak menjalankan rekonsiliasi atau POST vendor otomatis saat rilis. |
| MRN-18 | Kontrak Aset OpenAPI aktif, Fund Submission Non Aset, dan recovery metadata | Fund Submission deployed to staging 11 Agustus 2026; external identity format fix candidate | Payload `/asset-purchase-requests` memakai top-level `request_number`; Non Aset memakai `/fund-submissions`; proyek dengan branch external unavailable ditolak sebelum dispatch | MRN-07, MRN-16, MRN-17, REC-01 | Fund mengirim optional fields secara eksplisit, mengambil `division` persis dari employee external pemohon efektif, dan memetakan jabatan signer ke role vendor `staff`, `manager`, atau `director`. Trial `production_cost` ketiga role berhasil HTTP 200; production tidak disentuh |
| MRN-18F | Role pemohon generik pada outbound Fund fixture | Staging candidate, Issue #387 | Label `Pemohon`/`Pemohon HRD & GA` memakai jabatan asli dari snapshot tanda tangan untuk role vendor; label approval spesifik tetap | MRN-18, fixture split-account | Fixture aktif Pusat/Cabang sudah mengarah ke masing-masing akun uji; job historis gagal PDF atau pre-POST tidak diulang otomatis. Production tidak disentuh |
| MRN-19 | Hentikan retry storm RPC outbound Marison | Staging candidate | Wrapper RPC idempoten untuk replacement yang sudah ada; konflik mapping dikembalikan sebagai hasil terstruktur; helper strict tidak dapat dipanggil role API; BFF tetap memetakan konflik ke HTTP 409 | MRN-16, MRN-17 | Staging-only; tidak merotasi service role, tidak memodifikasi antrean bisnis, dan tidak menyentuh production |
| MRN-20 | Outbound Fund Submission untuk Non Aset | Latest vendor contract candidate; staging target only | User memilih tipe biaya dan mengisi rincian item; `amount` dihitung dari nominal item; division dari employee external, approval per signer, lampiran final, durable kind `fund`, endpoint `/fund-submissions` | MRN-13, MRN-16, MRN-17 | OpenAPI vendor aktif 26 Agustus 2026: seluruh Fund wajib `branch_id`; Fund berproyek juga membawa `project_id` yang satu cabang, dana umum meng-omit `project_id`; field `description`, `amount`, `items`, `attachments`, dan approval notes diserialisasi eksplisit; production tidak disentuh |
| MRN-21 | Fund Submission tanpa proyek (dana umum) | **Verified staging 20 Agu 2026** — dana umum `044/UAI/MKT.1/VIII/2026` diterima vendor (`fund_submission_id 17`); latest-contract update pending review | Form Non Aset memilih "Tanpa Proyek (Dana Umum)"; snapshot tanpa `requested_project`; payload meng-omit `project_id` tetapi tetap menyertakan `branch_id` employee external. Kontrak terbaru juga mewajibkan `branch_id` pada Fund berproyek | MRN-18, MRN-20 | `projectId` resolution source tetap opsional, `branchId` kini wajib untuk semua Fund melalui migration forward-only `20260826110000_fund_required_branch_latest_contract.sql`; proyek diminta tetapi tidak tervalidasi tetap ditolak sebelum POST; production tidak disentuh |
| MRN-22 | Aset cabang tanpa proyek (lingkup virtual "000") | Staging rollout; schema compatibility follow-up pending | Migration `20260903120000_branch_asset_without_project.sql` dan koreksi forward-only `20260903170000_mrn22_staging_schema_compatibility.sql`; `branch_has_registered_projects`, `assert_branch_asset_fallback_eligible`, `resolve_form_usage_category`; kolom `letter_number_counter_configs.office_id` + `cabang_000`; immutable `surat_reservations.number_scope_type`; trigger reservation & registrasi memakai helper DB; RPC 7-param baru dengan `p_form_usage_id`; legacy 6-param RPC tidak dapat membuat fallback; predicate frontend `isBranchAssetFallback` sebagai satu sumber kebenaran; service memakai query master data nyata, bukan `false` hardcoded | MRN-04, MRN-21, SUR-13 | Fallback berlaku hanya jika kantor non-Pusat tidak mempunyai satu pun proyek terdaftar; schema `master_projects` tidak memiliki status aktif/nonaktif. Departemen pengaju ditentukan oleh `validate_form_usage_for_actor`; `entity_id` divalidasi terhadap `master_entities` karena schema canonical tidak memiliki relasi departemen-entitas. Counter cabang_000 default `start_from = 1` per (entity, office, year) tanpa konfigurasi admin wajib; advisory lock keyed by (entity, office, year, scope); test runner disposable PostgreSQL menerapkan kedua migration dan menguji fallback, authorization, RLS, backfill, immutability, serta isolasi counter; production tidak disentuh |
| TIM-01 | Canonical currency module dan input UX Tim Pemeriksa | Staging deployed 4 Agustus 2026 (PR #91 merged, SHA db80239) | Canonical rupiah.ts: parseCurrencyInput, formatCurrencyInput, formatRupiah, formatRupiahZero; Tipe Unit digit-only inputMode=numeric placeholder 30; Struktur Atas/Bawah currency input prefix Rp non-editable right-aligned; Nomor Kode Produksi normalized 3-digit on blur; Blok decimal-only single dot; PDF semua nominal Rp 1.000.000, empty→-, zero→Rp 0, total rows; Excel Tipe Unit dan Blok Text cell, Nomor string 001; validasi bisnis per-kavling; 47 regression tests | MRN-12, SUR-04 | No migration; no schema change; 300/300 tests pass; production belum disentuh |
| MRN-11 | Hybrid master branch dan karyawan external | Production + Staging | Mapping ID external ke UUID lokal, review kelengkapan admin, sync run/issue audit, sumber terkunci sesuai deployment environment | `/branches`, `/employees`, Auth admin, ADM-01, ADM-02, ADM-03, ADM-06 | Production memakai `external.marisonregency.id`; staging memakai `marison-external.digivasi.com`. NIK adalah identitas primer: NIK lama diperbarui, NIK baru membuat akun Auth dan profil dengan password bootstrap dari konfigurasi environment. Division membentuk departemen SIGAP kanonikal. Baris yang perlu ditinjau menampilkan keterangan dan badge jumlah review. |
| MRN-12 | Tipe unit pada alokasi dan seluruh output | Staging only | Input alokasi, spreadsheet impor data, ringkasan layar, PDF adendum, PDF kode produksi, PDF summary, email, payload `units[].type` | MRN-04, MRN-05, kontrak OpenAPI unit | Spreadsheet hanya alat input data massal, bukan dokumen surat; promosikan bersama MRN-05 setelah pengujian dokumen dan payload disetujui |
| MRN-13 | Hybrid master proyek external | Staging; pemakaian ulang ID lewat mapping payload dalam PR | Mapping `master_projects.marison_project_id`, sync run/issue audit, panel Integrasi Marison, Master Proyek, badge review admin | `/projects`, MRN-11 branch mapping, ADM-07 | Master proyek external tetap beridentitas unik untuk sync; proyek lokal kantor pemohon dapat memetakan payload ke proyek canonical kantor lain tanpa menduplikasi ID. Nomor surat mengikuti kantor lokal; `project_id` dan `branch_id` outbound mengikuti proyek Marison tujuan yang tersinkronisasi. Mapping karyawan dan kantor pemohon tidak diubah. Production tidak berubah. |
| MRN-14 | Form pengajuan Non Unit terstruktur | Staging; koreksi format judul/deskripsi outbound menunggu review | Editor jenis pekerjaan, nilai, catatan perencanaan, summary/detail, snapshot project external | MRN-03, MRN-06, MRN-11, MRN-13, DOC-02 | Proyek tujuan wajib mempunyai mapping proyek dan kantor Marison; ID cabang mengikuti kantor proyek, bukan kantor pemohon; judul dan deskripsi outbound memakai format `Permohonan Non Unit : <daftar pekerjaan> <kantor>` sementara catatan tetap dikirim melalui `notes`; pertahankan fallback PGD untuk cabang tanpa proyek dengan kode virtual `000` |

Catatan cronjob:

- Sinkronisasi branch/karyawan menggunakan master UUID SIGAP; ID external hanya menjadi mapping.
- Sinkronisasi proyek menggunakan pola yang sama: UUID lokal SIGAP tetap menjadi primary key, sedangkan `marison_project_id` menjadi mapping external.
- Branch selalu diproses sebelum employee agar `branch.id` dapat dipetakan ke `office_id` lokal.
- Branch juga diproses sebelum project agar `project.branch.id` dapat dipetakan ke `office_id` lokal. Jika branch external kosong, proyek tetap masuk ke kantor penampung sementara dan wajib ditinjau admin.
- Entitas proyek external dikosongkan saat sync agar tidak ada pemetaan asal-asalan. Baris Master Proyek diberi warna/kedip dan kolom Keterangan sampai entitas dipilih admin.
- Sinkron manual dan worker harian pukul 00:00 Asia/Jakarta memakai jalur orkestrasi, lock, dan audit run yang sama.
- Data external yang kosong tidak menghapus isian manual; hirarki kantor, role, atasan, dan tanggal kerja tetap dikelola SIGAP.
- Cronjob production tidak boleh diaktifkan sebelum data HRD, mapping kantor, dan dampak role/login diuji di staging.

Temuan keamanan outbound:

- staging telah terverifikasi memperoleh token dan mengakses protected GET dengan
  status `200` menggunakan format signature sesuai OpenAPI terbaru;
- secret tidak dikirim ke browser dan host dipilih dari environment deployment;
- NIK uji staging diterapkan hanya saat membangun payload outbound; NIK profil, snapshot audit, dan payload production tidak ditimpa;
- business POST tidak dijalankan saat audit agar tidak membuat data palsu;
- belum ada lock/idempotency key lokal saat dispatch. Request bersamaan atau
  timeout setelah upstream menerima payload masih dapat menyebabkan duplikasi;
- status `success` pada snapshot hanya mencegah pengiriman ulang setelah response
  sukses sudah tersimpan.
- payload kaya Aset dan Unit sudah dikunci pada `docs/contracts/marison/v1`, tetapi
  OpenAPI vendor staging masih menunjukkan kontrak lama. Perubahan ini belum boleh
  dipromosikan sampai vendor menyatakan endpoint siap.

### 4.6 Dokumen, Template, dan PDF

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| DOC-01 | Input schema dinamis | Staging candidate; UI master form lama dihapus | Form usage dan snapshot schema | Form usage | Schema input tetap menjadi kontrak form; konfigurasi aktif dikelola melalui Kegunaan Form |
| DOC-02 | Form usage per departemen dan step | Production + Staging; koreksi `Permohonan Teknik Cabang` menjadi `Non Unit` siap diuji di staging | Form usage management | Forms, workflow, departments | Jangan tarik bila form aktif menggunakannya; surat terdaftar tetap memakai snapshot kategorinya |
| DOC-03 | Excel template mapping dokumen | Removed pada kandidat staging | Migration cleanup kolom, tabel, dan object storage template | DOC-01, WF-02 | Tidak dipromosikan lagi; impor/ekspor data operasional tetap terpisah dari pipeline dokumen |
| DOC-04 | Template Designer JSON/version/publish | Removed pada kandidat staging | Route, service, tipe, tabel builder, dan konfigurasi UI dihapus | DOC-06 | Renderer PDF native bersifat code-owned dan diuji; tidak ada builder dorman yang menjadi sumber perilaku alternatif |
| DOC-05 | PDF job queue dan worker | Production + Staging; proactive enqueue candidate | PDF API, jobs, worker, registration/signature triggers | Storage, renderer native | PDF native diantrikan saat dokumen dibuat dan setiap tahap ditandatangani; pembukaan PDF tetap fallback dan tidak menjadi pemicu utama; rekomendasi tetap memakai pipeline canonical terpisah |
| DOC-06 | Renderer dokumen native dan buat ulang PDF | PDF-native candidate staging | PGD/rekomendasi renderer, rebuild action | DOC-05, snapshots | Mendukung 2-8 signer sesuai konfigurasi; rekomendasi memakai maksimal enam gambar per halaman; jangan rilis renderer tanpa worker seversi |
| DOC-07 | Private storage dan authorized download | Production + Staging; perbaikan token staging siap diuji | BFF storage/file token | Self-hosted Supabase storage | Kontrol keamanan; token harus memvalidasi bucket dan object path aktual, jangan tarik parsial |
| DOC-08 | Shared storage dengan namespace environment | Staging candidate; referensi legacy staging sudah dimigrasikan | Storage path policy, BFF upload, PDF worker, migrator namespace | DOC-05, DOC-07, env deployment | Production tetap tanpa prefix; staging wajib memakai `staging/`; migrator tidak menghapus object sumber |
| DOC-09 | Fast path preview PDF privat | Staging deployed; cache PDF rekomendasi current siap rollout | PDF job response, polling status, one-time file viewer token | DOC-05, DOC-07, SUR-05 | Buka biasa memakai ulang PDF canonical dengan source, fingerprint, dan storage coordinates yang masih current; refresh eksplisit tetap membuat render baru; otorisasi dan token sekali pakai wajib dipertahankan |
| DOC-10 | Pipeline dokumen database-native tanpa XLSX | Staging candidate; legacy cleanup pending rollout | Registrasi, approval, PDF worker, outbound attachment, route konfigurasi | SUR-01, SUR-06, DOC-02, DOC-05, REC-03 | Database menjadi sumber kebenaran; approval menginvalidasi cache PDF; outbound menunggu PDF final; kode, tabel, kolom, dan storage template lama dihapus; production belum disentuh |

### 4.7 Notification, Realtime, Email, dan Audit

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| NTF-01 | Notifikasi in-app dan unread state | Production + Staging | Notifications table/header | Workflow events | Pertahankan histori jika UI ditarik |
| NTF-02 | Sidebar attention Realtime via SSE | Production + Staging; batch/reconnect fix kandidat staging (Issue #395) | Attention provider, `/api/events` | Realtime publication, RLS | Fallback focus refetch tetap ada; jangan kembali polling. Status lama: event beruntun hilang refresh pertama; publication 4 tabel + RLS verifier revision_events belum terpublikasi |
| NTF-02B | Batched realtime flush + SSE reconnect revalidation | Staging candidate; migration 20260928030948 dan 20260928031002 sudah diterapkan ke staging DB | `src/lib/realtime-flush.ts`, `src/lib/supabase.ts`, `RealtimeSync`, `AttentionProvider`, `InboxPage`, `docs/REALTIME_MATRIX.md`, `docs/PRODUCTION_REALTIME_AUDIT.md` | NTF-02, AUTH-02 | Matriks + RLS di `docs/REALTIME_MATRIX.md`; publication staging 9 → 13 tabel; production UNVERIFIED, lihat rencana promosi |
| NTF-03 | Web Push | Production + Staging jika VAPID tersedia | Service worker, push subscriptions | HTTPS, browser permission | Matikan server send sebelum menghapus UI |
| NTF-04 | Email notifikasi dan secure file link | Production + Staging jika SMTP tersedia | SMTP, settings, file tokens | Storage, recipients | Matikan config sebelum menghapus route |
| NTF-05 | Indikator perhatian sidebar beranimasi | Staging only | Badge numerik, warna baris berdasarkan jenis perhatian, mode sidebar penuh/kecil | NTF-02, attention state, prefers-reduced-motion | UI-only; dapat ditarik tanpa mengubah data maupun penghitung attention |
| OPS-04 | Pemulihan kontrak runtime production | Production hotfix candidate | Migration `20260923130000_production_runtime_contract_recovery.sql`, RPC attention/monitoring, kolom konfigurasi Kegunaan, dan feature gate Kalender Kerja | NTF-02, DOC-02, SUR-01, CAL-03 | Migration hanya additive/`create or replace`; tidak boleh mengarsipkan workflow, fixture, atau data surat. Kalender Kerja dinonaktifkan pada image production melalui `VITE_WORK_CALENDAR_ENABLED=false` dan tetap aktif di staging. |
| OPS-06 | Quality gate berbasis perubahan | Development branch | `scripts/test-changed.mjs`, `scripts/quality-live-base.sh`, workflow CI/deploy | Git history dan runtime `/health/version` | Suite penuh tetap tersedia lewat `quality:ci`; deploy membandingkan seluruh perubahan sejak SHA runtime, bukan hanya commit terakhir. |
| AUD-01 | Activity/Audit Log admin | Production + Staging | Audit page/service | `activity_logs`, admin | UI dapat ditarik, log sebaiknya dipertahankan |

### 4.8 Master Data dan Konfigurasi Admin

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| ADM-01 | User Organization dan soft delete | Production + Staging | User management | Auth, profiles, departments/offices | Sangat tinggi; jangan hapus profile historis |
| ADM-02 | Hirarki organisasi | Production + Staging | Hierarchy page/services | Offices, profiles, agenda visibility | Memengaruhi visibilitas dan approval |
| ADM-03 | Master departemen | Production + Staging | Department admin | Users, forms, workflow, KPI | Cross-cutting |
| ADM-04 | Master entitas | Production + Staging | Entity admin | Numbering/surat | Pertahankan referensi historis |
| ADM-05 | Master jenis surat | Production + Staging | Letter type admin | Forms, numbering, surat | Pertahankan referensi historis |
| ADM-06 | Master kantor/cabang | Production + Staging; koreksi hierarki Pusat pending staging | Office admin | Users, agenda, surat, Marison branch | Kantor Pusat tidak memiliki kantor induk dan tidak memerlukan konfirmasi hasil deteksi hierarki; KCP/Kost tetap wajib memiliki induk |
| ADM-07 | Master proyek | Production + Staging | Project admin | Surat/Marison | Jangan campur dengan project external tanpa mapping |
| ADM-08 | SLA/KPI departemen | Production + Staging | KPI pages/RPC/config | Workflow/signature timestamps | UI dapat ditarik; data config dipertahankan |
| ADM-09 | Job title display overrides | Production + Staging | Configuration page | Signature rendering | Memengaruhi dokumen baru dan rebuild |
| ADM-10 | Email settings | Production + Staging | Configuration page | NTF-04 | Dapat dinonaktifkan tanpa menghapus config |

### 4.9 Dokumentasi dan Komponen Dormant

| ID | Fitur | Status | Bukti | Keputusan saat penarikan |
| --- | --- | --- | --- | --- |
| DOCS-01 | Dokumentasi publik dalam aplikasi | Production + Staging | `/docs` routes | Aman ditarik sebagai UI |
| DOCS-02 | Protokol koordinasi manusia dan AI | Staging only | Root `AGENTS.md`, `docs/AI_COLLABORATION.md`, GitHub Issue/draft PR | Dokumentasi operasional; pertahankan selama pekerjaan paralel diizinkan |
| EXT-01 | External API read-only surat milik SIGAP | Dormant | Source dan schema ada, container tidak berjalan | Audit consumer sebelum menghapus source/schema |
| EXT-02 | External API keputusan pengajuan SIGAP | Production aktif; staging memakai runtime terpisah | Fastify M2M API, client credentials, Zudoku/OpenAPI, container per environment | SUR-16, DNS/tunnel dan Supabase per environment | Staging wajib memakai `docker-compose.external.staging.yml`, `.env.staging`, dan port lokal 3021; hostname staging tidak boleh merutekan ke container production port 3020. Client secret disimpan sebagai hash dan plaintext hanya dibuat sekali pada file operator. |
| PIC-01 | Monitoring/PIC/chat/payment lama | Removed dari alur aktif | Riwayat commit lama; route/service aktif tidak ada | Jangan hidupkan kembali tanpa desain baru |
| ENV-01 | Switch environment Marison lewat UI/OTP | Removed, diganti environment lock | Provider/status locked | Jangan hidupkan; bertentangan dengan isolasi deployment |

### 4.10 Operasional dan Release

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| OPS-01 | Deploy staging app-only dan full stack yang eksplisit | Staging candidate; seluruh runtime env app diteruskan eksplisit oleh Compose | Panduan deploy, aturan restart PDF/sync worker, smoke test readiness | Docker context `ubuntu-server`, Compose staging, health routes | Deploy dari worktree bersih wajib fail-fast bila credential Supabase/session/storage staging tidak tersedia; SMTP dan Web Push tetap diteruskan tanpa mencetak nilai; pertahankan agar deploy app tidak merestart worker tanpa sengaja |
| OPS-02 | Identitas revision runtime | Staging candidate | OCI image revision label, build arg `GIT_SHA`, `/health/version` | Docker build dan Fastify health routes | Read-only metadata; pertahankan agar runtime dapat dicocokkan dengan commit tanpa membaca file container |
| OPS-03 | Aktivasi sinkronisasi master Marison production | Production deployed | Migration forward-only mapping kantor/karyawan/proyek dan audit sync; scheduler internal 00:00 Asia/Jakarta | MRN-11, MRN-13, service-role, kredensial production Marison | Cron hanya GET source external dan dapat membuat akun Auth+profil untuk NIK baru memakai password bootstrap environment; tidak mengirim outbound vendor. |
| OPS-05 | Deploy aplikasi staging/production otomatis dengan paritas runtime | Development branch | Workflow GitHub Actions, runner khusus di Ubuntu, `scripts/deploy-app.sh`, `scripts/check-staging-parity.sh`, `docs/AUTOMATIC_DEPLOYMENT.md` | OPS-01, OPS-02, quality gate, host-local `.env` | App-only; production hanya setelah live staging memuat `main`. Migration/worker berubah memerlukan rollout terkoordinasi, tanpa bypass otomatis. |
| DB-01 | Rekonsiliasi riwayat migration staging | Local filename collision resolved; remote staging verification pending | Migration filename tests dan runbook staging | Staging DB identity, migration history, catalog evidence, backup | Tidak boleh dipromosikan sebagai repair production; production memerlukan audit dan izin tersendiri |
| BKND-01 | Domain runtime characterization & refactor baseline | Staging candidate (test-only PR, tidak deploy) | 26 characterization test Fastify inject atas 9 route protected + fail-closed no-network; `docs/DOMAIN_RUNTIME_REFACTOR_BASELINE.md` memetakan 5,523 baris `domain-runtime.ts`, urutan PR-A..F, state/helper tak terpisah, kandidat ekstrak, risiko `@ts-nocheck` | OPS-02, route contract `domain.routes.ts` | Test-only; safety net sebelum memecah `domain-runtime.ts`. Tidak ada perubahan produksi, migration, atau deployment |

## 5. Dependensi Utama

Urutan dependensi dari fondasi ke fitur bisnis:

1. Supabase Auth, encrypted session BFF, RLS, dan profile.
2. Master organization: department, office, entity, user, project, letter type.
3. Form, template, form usage, workflow, numbering, dan storage.
4. Registrasi surat, signatures, attachments, dan PDF jobs.
5. Approval, verification, revision, recommendation, dan attention.
6. Notification, email, web push, monitoring, audit, dan KPI.
7. Integrasi Marison lookup dan outbound submission.

Implikasi:

- menarik lapisan bawah dapat memutus banyak fitur di atasnya;
- fitur UI boleh disembunyikan tanpa langsung menghapus schema;
- fitur workflow harus dinonaktifkan secara forward-only dan mempertahankan data
  historis;
- migration lama tidak boleh direvert atau diedit setelah diterapkan.

## 6. Kelas Penarikan Fitur dari Production

| Kelas | Kondisi | Prosedur |
| --- | --- | --- |
| A - UI saja | Route/menu tanpa write atau schema khusus | Hapus akses UI, test route, pertahankan data |
| B - Service terisolasi | UI + endpoint/service khusus | Matikan entry point, pastikan tidak ada caller, lalu hapus endpoint |
| C - Workflow/data | Memiliki status aktif atau histori | Tambah feature flag, hentikan pembuatan baru, selesaikan data aktif, pertahankan read path |
| D - Cross-cutting | Auth, RLS, storage, workflow dasar | Jangan tarik langsung; desain pengganti dan migration transisi |
| E - Integrasi eksternal | Mengirim data ke sistem lain | Matikan dispatch, audit retry/in-flight, simpan response/audit, lalu sembunyikan UI |

Setiap permintaan penarikan production harus menghasilkan PR `remove/*` atau
`hotfix/*` tersendiri dari `main`, daftar object terdampak, migration forward-only
bila diperlukan, rencana rollback, dan smoke test production.

## 7. Gap dan Risiko yang Harus Diselesaikan

| Prioritas | Temuan | Dampak | Tindakan |
| --- | --- | --- | --- |
| P0 | Quality workflow masih berada pada PR #42; deploy workflow belum ada | Deployment belum terikat branch | Merge quality workflow setelah hijau; desain deploy staging dan production terpisah |
| P1 | Branch protection tidak tersedia untuk repository private pada paket GitHub saat ini | Required checks tidak dapat dipaksakan platform | Gunakan review/check PR secara manual atau upgrade paket GitHub |
| P0 | Outbound Marison belum memiliki lock/idempotency lokal | Potensi POST ganda | Tambah claim/lock atomik dan idempotency key bila upstream mendukung |
| P1 | Production PDF worker berada pada source `8918d34` | App dan worker dapat menghasilkan perilaku berbeda | Promosikan worker hanya lewat rilis production terverifikasi |
| P1 | Duplicate version `20260707113000` sudah dihapus dari lineage staging, tetapi history/schema remote staging belum diverifikasi | Source bersih belum membuktikan remote konsisten | Ikuti `STAGING_MIGRATION_RECONCILIATION.md`; jangan gunakan `--include-all` atau blind repair |
| P1 | Full test memiliki satu assertion gagal di `bff-session-security.test.ts` | Required check belum dapat dibuat hijau | Perbaiki test/kontrak session pada branch terpisah |
| P1 | Publication Realtime production belum diaudit penuh | Badge production belum memiliki bukti setara staging | Audit kelima tabel tanpa mengubah data bisnis |
| P1 | `backend/src/domain-runtime.ts` masih memakai pengecualian typecheck selama port verbatim | Kesalahan bentuk data domain belum seluruhnya dilindungi compiler | Pecah per service dan hapus `@ts-nocheck` sebelum kandidat production |
| P2 | `docs/README.md` masih menyebut arsitektur lama | Dokumentasi dapat menyesatkan | Selaraskan dengan BFF Node + SSE + worker |
| P2 | External read-only API masih memiliki source/schema dormant | Surface dan biaya pemeliharaan | Audit consumer sebelum keputusan hapus |

## 8. Baseline Selective Release

Sebelum fitur baru pertama dimulai, siapkan:

1. verifikasi branch protection pada branch remote `staging` yang sudah tersedia;
2. CI pada `feature/*`, `fix/*`, `staging`, dan `main`;
3. auto-deploy `staging` hanya ke `sigap.marison-testing.biz.id`;
4. production deploy dari `main` dengan approval manual;
5. GitHub Environment dan secrets terpisah;
6. PR template yang mewajibkan Feature ID dari dokumen ini;
7. label `staging-tested`, `release-candidate`, `production-approved`, dan
   `requires-migration`;
8. manifest rilis yang mencatat commit, migration, app image, dan worker image.

Setelah baseline tersedia, update kolom status pada dokumen ini melalui PR fitur.
Jangan menandai fitur sebagai production hanya karena source sudah ada di `main`;
verifikasi juga runtime, database, worker, dan smoke test.
