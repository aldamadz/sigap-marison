# SIGAP Feature and Release Map

Snapshot audit: 2026-07-27 (Asia/Jakarta)

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
| App container | `agenda-flow-prod` | Fastify web, PDF worker, dan cron sync staging | Ketiga service staging sehat; production tidak diubah |
| Git source | `main` | `staging`, enam commit di depan `main` saat snapshot | Source environment sudah terpisah; runtime tetap harus diverifikasi setelah deploy |
| Supabase project | `xuhyodtmgwteyslhrkfx` | `wrufczusfopgvwvxsmjk` | Database sudah terpisah |
| PostgREST objects | 48 table/view | 48 table/view | Tidak ada perbedaan object |
| RPC | 51 RPC | 51 RPC | Tidak ada perbedaan RPC |
| PDF worker | Source commit `8918d34` | Source terbaru saat deploy | Production worker mengalami drift |
| Marison environment | Dikunci `production` | Dikunci `staging` | Tidak dapat ditukar dari browser |
| Marison outbound default | Nonaktif jika flag tidak diisi | Aktif jika flag tidak diisi | Sesuai pemisahan environment |
| Marison outbound host | `external.marisonregency.id` | `marison-external.digivasi.com` | Sudah terisolasi |
| Realtime Sidebar | Konfigurasi publication belum diaudit penuh | Lima tabel sudah dipublikasikan | Staging telah lulus tes SSE end-to-end |
| Deployment | Docker Compose manual | Docker Compose manual | Belum ada GitHub Actions berbasis branch |

Catatan: commit dokumentasi dan migration yang lebih baru dari image tidak selalu
berarti app container tertinggal. Audit source dilakukan dengan hash isi file,
bukan hanya waktu pembuatan image.

## 3. Kondisi GitHub

| Komponen | Status saat audit | Tindakan yang diperlukan |
| --- | --- | --- |
| `main` | Ada; saat ini menjadi source seluruh runtime | Pertahankan sebagai production |
| `staging` | Sudah ada; enam commit di depan `main` saat snapshot | Gunakan hanya sebagai target PR pengujian staging |
| `feature/*` | Belum menjadi alur baku historis | Wajib untuk fitur baru |
| `fix/*` | Belum menjadi alur baku historis | Wajib untuk perbaikan rutin |
| GitHub Actions | Tidak ada workflow di `.github/workflows` | Buat CI dan deploy terpisah |
| Branch protection | Belum diverifikasi | Wajibkan PR dan status checks |
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
| SEC-01 | Dependency hardening: React 19, React Router v8, and ExcelJS streaming fail-closed | Staging deployed | React Router integration tests, ExcelJS workbook round-trip, clean install, audit, Docker, and staging smoke tests | Target staging only; do not change production or database |
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

### 4.3 Persuratan Inti

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| SUR-01 | Registrasi surat dinamis | Production + Staging | Surat form/service, registration RPC | Form usage, numbering, workflow, storage | Sangat tinggi; gunakan feature flag, jangan revert migration |
| SUR-02 | Draft registrasi, reservasi nomor, dan sinkronisasi matrix aktif | Production + Staging; rekonsiliasi matrix kandidat diperkuat di staging | Draft/reservation RPC, tables, signer reconciliation | SUR-01, numbering, DOC-02 | Draft aktif selalu mengikuti kandidat dan tahap terbaru saat dibuka maupun sebelum submit; surat yang sudah terdaftar tetap memakai snapshot lama untuk audit |
| SUR-03 | Nomor surat atomik dan konfigurasi counter | Production + Staging | Numbering admin, RPC | Letter type, office/entity | Tidak boleh ditarik tanpa mekanisme nomor pengganti |
| SUR-04 | Lampiran awal dan lampiran approval | Production + Staging | Storage upload, attachment tables | Private storage, file authorization | Pertahankan file dan metadata saat UI ditarik |
| SUR-05 | Preview detail dan file viewer bertoken | Production + Staging | Preview modal, file token BFF | Storage, surat authorization | Jangan membuka public URL sebagai pengganti |
| SUR-06 | Inbox persetujuan | Production + Staging | Inbox page, signatures | Workflow approval, attention | Nonaktifkan write/signing lebih dahulu |
| SUR-07 | Status pengajuan/monitoring pengguna | Production + Staging | Monitoring page/service | Surat, signatures, revision | Aman sebagai read-only; jangan hapus data |
| SUR-08 | Riwayat keterlibatan | Production + Staging | History page | Surat/signatures | UI dapat ditarik terpisah |
| SUR-09 | Monitoring admin dan pagination server-side | Production + Staging | Admin monitoring, monitoring RPC | Surat, admin role | UI/endpoint dapat ditarik bersama-sama |
| SUR-10 | Batas waktu proses approval | Production + Staging | SLA fields and calculations | Signatures, department KPI | Perubahan memengaruhi KPI dan status |

### 4.4 Workflow, Verification, Revision, dan Recommendation

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| WF-01 | Template workflow serial/parallel | Production + Staging | Workflow configuration | Forms, departments, users | Jangan tarik bila SUR-01 tetap aktif |
| WF-02 | Matriks tanda tangan dan label jabatan | Production + Staging | Form usage steps, display overrides | Profiles, job title config | Data snapshot lama harus tetap dapat dirender |
| WF-03 | Approval/reject atomik | Production + Staging | Approval RPC v2 | Signatures, notifications | Sangat tinggi; jangan revert ke client-side writes |
| WF-04 | Verifikasi input oleh pemeriksa | Production + Staging | Verification UI/RPC | Form step verifiers | Hanya tarik untuk form yang tidak menggunakannya |
| WF-05 | Autosave draft verifikasi | Production + Staging | Verification draft RPC | WF-04 | Dapat ditarik setelah memastikan tidak ada draft aktif |
| REV-01 | Revisi proses bertipe dan histori | Production + Staging | Revision events/RPC | Surat, signatures, attention | Forward migration; pertahankan histori |
| REV-02 | Tindak lanjut pemohon/tujuan revisi | Production + Staging | Follow-up page and badges | REV-01 | Jangan tarik bila revisi aktif masih terbuka |
| REC-01 | Rekomendasi PBO dan child document | Production + Staging | Recommendation tasks/RPC | Draft, linked documents, department PBO | Tinggi; cek task aktif sebelum nonaktif |
| REC-02 | Reopen/finalize recommendation saat revisi | Production + Staging | Recommendation revision RPC | REC-01, REV-01 | Tidak dapat ditarik terpisah dengan aman |

### 4.5 Permohonan Unit, Non-Unit, Aset, dan Marison

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| MRN-01 | Lookup project Marison | Production + Staging | External data source `/projects` | Token + HMAC | Dapat dinonaktifkan per data source |
| MRN-02 | Lookup unit berdasarkan project | Production + Staging | `/unit?project_id=...` | MRN-01 | Dapat dinonaktifkan per form/data source |
| MRN-03 | Lookup non-unit berdasarkan project | Production + Staging | `/non-unit?project_id=...` | MRN-01 | Dapat dinonaktifkan per form/data source |
| MRN-04 | Alokasi unit, kode produksi, dan rekap | Production + Staging | Surat form/service, production-code | Unit source, PDF attachments | Tinggi; snapshot lama harus tetap terbaca |
| MRN-05 | Outbound submission unit | Staging enabled; production disabled by default | `/unit-submissions` POST | Surat selesai, project/unit/branch, approvals | Staging dapat memakai NIK uji tunggal tanpa mengubah profil; matikan dispatch flag untuk menonaktifkan |
| MRN-06 | Outbound submission non-unit | Staging enabled; production disabled by default | `/non-unit-submissions` POST | Surat selesai, non-unit items, approvals | Mengikuti kebijakan NIK staging MRN-05 |
| MRN-07 | Outbound asset purchase request | Staging enabled; production disabled by default | `/asset-purchase-requests` POST | Surat selesai, branch, approvals | Mengikuti kebijakan NIK staging MRN-05 |
| MRN-08 | Status, test koneksi, dan sinkron Integrasi Marison | Production + Staging | `Konfigurasi > Kegunaan Form`/BFF | Environment deployment, admin role | Environment switch via UI sudah removed; route lama hanya redirect |
| MRN-09 | Pemisahan host staging/production | Production + Staging | Compose + server config | `.env.staging`, `.env.production` | Kontrol keamanan; jangan ditarik |
| MRN-10 | Kontrak outbound kaya Aset dan Unit v1 | Development branch | Schema strict, fixture JSON, builder outbound | MRN-05, MRN-07, kesiapan endpoint vendor | Jangan deploy sebelum OpenAPI vendor sesuai dan contract test bersama lulus |
| MRN-11 | Hybrid master branch dan karyawan external | Staging available | Mapping ID external ke UUID lokal, review kelengkapan admin, sync run/issue audit, cron harian staging | `/branches`, `/employees`, Auth admin, ADM-01, ADM-02, ADM-03, ADM-06 | Baris yang perlu ditinjau memakai warna dan kolom Keterangan yang menjelaskan data kurang; badge sidebar menampilkan jumlah review. Production tetap nonaktif sampai endpoint production tersedia dan hasil review staging disetujui |
| MRN-12 | Tipe unit pada alokasi dan seluruh output | Staging only | Input alokasi, template Excel, ringkasan layar, PDF adendum, PDF kode produksi, PDF summary, email, payload `units[].type` | MRN-04, MRN-05, kontrak OpenAPI unit | Bergantung pada kontrak POST Marison yang masih staging-only; promosikan bersama MRN-05 setelah pengujian dokumen dan payload disetujui |
| MRN-13 | Hybrid master proyek external | Staging deployed and smoke-tested 28 Juli 2026 | Mapping `master_projects.marison_project_id`, sync run/issue audit, panel Integrasi Marison, Master Proyek, badge review admin | `/projects`, MRN-11 branch mapping, ADM-07 | Master proyek ditarik dari external dan tetap memakai UUID lokal SIGAP; proyek external tidak diberi entitas otomatis, masuk antrean review, dan jumlahnya diteruskan ke badge Master Proyek melalui attention state |

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
| DOC-01 | Master form dan input schema dinamis | Production + Staging | Form management | Form usage, template | Sangat tinggi untuk SUR-01 |
| DOC-02 | Form usage per departemen dan step | Production + Staging | Form usage management | Forms, workflow, departments | Jangan tarik bila form aktif menggunakannya |
| DOC-03 | Excel template mapping dan dynamic signature | Production + Staging | Excel/signature services | DOC-01, WF-02 | Snapshot/template lama harus kompatibel |
| DOC-04 | Template Designer JSON/version/publish | Production + Staging | Template builder | Builder tables, preview | Dapat disembunyikan tanpa menghapus versi |
| DOC-05 | PDF job queue dan worker | Production + Staging, production drift | PDF API, jobs, worker | Storage, LibreOffice/pdf renderer | Sinkronkan worker sebelum perubahan renderer |
| DOC-06 | Renderer PGD dan buat ulang PDF | Production + Staging, production drift risk | PGD renderer, rebuild action | DOC-05, snapshots | Jangan rilis renderer tanpa worker seversi |
| DOC-07 | Private storage dan authorized download | Production + Staging; perbaikan token staging siap diuji | BFF storage/file token | Self-hosted Supabase storage | Kontrol keamanan; token harus memvalidasi bucket dan object path aktual, jangan tarik parsial |
| DOC-08 | Shared storage dengan namespace environment | Staging candidate; referensi legacy staging sudah dimigrasikan | Storage path policy, BFF upload, PDF worker, migrator namespace | DOC-05, DOC-07, env deployment | Production tetap tanpa prefix; staging wajib memakai `staging/`; migrator tidak menghapus object sumber |

### 4.7 Notification, Realtime, Email, dan Audit

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| NTF-01 | Notifikasi in-app dan unread state | Production + Staging | Notifications table/header | Workflow events | Pertahankan histori jika UI ditarik |
| NTF-02 | Sidebar attention Realtime via SSE | Production + Staging | Attention provider, `/api/events` | Realtime publication, RLS | Fallback focus refetch tetap ada; jangan kembali polling |
| NTF-03 | Web Push | Production + Staging jika VAPID tersedia | Service worker, push subscriptions | HTTPS, browser permission | Matikan server send sebelum menghapus UI |
| NTF-04 | Email notifikasi dan secure file link | Production + Staging jika SMTP tersedia | SMTP, settings, file tokens | Storage, recipients | Matikan config sebelum menghapus route |
| NTF-05 | Indikator perhatian sidebar beranimasi | Staging only | Badge numerik, warna baris berdasarkan jenis perhatian, mode sidebar penuh/kecil | NTF-02, attention state, prefers-reduced-motion | UI-only; dapat ditarik tanpa mengubah data maupun penghitung attention |
| AUD-01 | Activity/Audit Log admin | Production + Staging | Audit page/service | `activity_logs`, admin | UI dapat ditarik, log sebaiknya dipertahankan |

### 4.8 Master Data dan Konfigurasi Admin

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| ADM-01 | User Organization dan soft delete | Production + Staging | User management | Auth, profiles, departments/offices | Sangat tinggi; jangan hapus profile historis |
| ADM-02 | Hirarki organisasi | Production + Staging | Hierarchy page/services | Offices, profiles, agenda visibility | Memengaruhi visibilitas dan approval |
| ADM-03 | Master departemen | Production + Staging | Department admin | Users, forms, workflow, KPI | Cross-cutting |
| ADM-04 | Master entitas | Production + Staging | Entity admin | Numbering/surat | Pertahankan referensi historis |
| ADM-05 | Master jenis surat | Production + Staging | Letter type admin | Forms, numbering, surat | Pertahankan referensi historis |
| ADM-06 | Master kantor/cabang | Production + Staging | Office admin | Users, agenda, surat, Marison branch | Cross-cutting |
| ADM-07 | Master proyek | Production + Staging | Project admin | Surat/Marison | Jangan campur dengan project external tanpa mapping |
| ADM-08 | SLA/KPI departemen | Production + Staging | KPI pages/RPC/config | Workflow/signature timestamps | UI dapat ditarik; data config dipertahankan |
| ADM-09 | Job title display overrides | Production + Staging | Configuration page | Signature rendering | Memengaruhi dokumen baru dan rebuild |
| ADM-10 | Email settings | Production + Staging | Configuration page | NTF-04 | Dapat dinonaktifkan tanpa menghapus config |

### 4.9 Dokumentasi dan Komponen Dormant

| ID | Fitur | Status | Bukti | Keputusan saat penarikan |
| --- | --- | --- | --- | --- |
| DOCS-01 | Dokumentasi publik dalam aplikasi | Production + Staging | `/docs` routes | Aman ditarik sebagai UI |
| DOCS-02 | Protokol koordinasi manusia dan AI | Development branch | Root `AGENTS.md`, `docs/AI_COLLABORATION.md`, GitHub Issue/draft PR | Dokumentasi operasional; pertahankan selama pekerjaan paralel diizinkan |
| EXT-01 | External API read-only surat milik SIGAP | Dormant | Source dan schema ada, container tidak berjalan | Audit consumer sebelum menghapus source/schema |
| PIC-01 | Monitoring/PIC/chat/payment lama | Removed dari alur aktif | Riwayat commit lama; route/service aktif tidak ada | Jangan hidupkan kembali tanpa desain baru |
| ENV-01 | Switch environment Marison lewat UI/OTP | Removed, diganti environment lock | Provider/status locked | Jangan hidupkan; bertentangan dengan isolasi deployment |

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
| P0 | Tidak ada workflow CI/deploy GitHub | Deployment tidak terikat branch | Buat workflow staging dan production |
| P1 | Branch protection dan required checks belum diverifikasi | PR dapat masuk tanpa quality gate yang konsisten | Aktifkan protection setelah CI tersedia |
| P0 | Outbound Marison belum memiliki lock/idempotency lokal | Potensi POST ganda | Tambah claim/lock atomik dan idempotency key bila upstream mendukung |
| P1 | Production PDF worker berada pada source `8918d34` | App dan worker dapat menghasilkan perilaku berbeda | Promosikan worker hanya lewat rilis production terverifikasi |
| P1 | Dua migration lokal memakai versi `20260707113000` | `db push` meminta `--include-all` dan berisiko salah apply | Audit lalu beri versi unik dengan prosedur repair terkontrol |
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
