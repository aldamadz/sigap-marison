# REL-02 — Selective production readiness, 23 September 2026

## Keputusan

**Seluruh tujuh PR target sudah terwakili dalam source `main`. Tidak ada commit
fitur atau dependency yang perlu dipromosikan lagi.** Kandidat ini hanya memuat
laporan audit dan tautan peta rilis; tetap Draft untuk review. Tidak ada merge,
deployment, akses database production, atau panggilan vendor dalam audit ini.

PR [#333](https://github.com/aldamadz/frontend/pull/333) sudah merged pada
2026-09-23 01:23:41 UTC, merge SHA
`0acbdf1c738d8aa0948f86697d6c3618a23fd551`.
Issue [#332](https://github.com/aldamadz/frontend/issues/332) dan changelog
melaporkan rollout sebelumnya beserta 15 migration. Itu bukti historis, bukan
verifikasi runtime/database baru oleh audit ini. Tidak ada klaim bahwa HEAD
`main` terbaru identik dengan seluruh runtime production saat ini.

## Identitas dan koordinasi

- Issue klaim: [#341](https://github.com/aldamadz/frontend/issues/341).
- Branch: `release/sigap-selected-staging-features-20260923`.
- Target: Draft PR ke `main`.
- Base setelah `git fetch origin --prune`:
  `30039ab09c146f5a4bb07d8dcb960bfef38f342c`.
- Snapshot staging: `b12bd395abf89aa9037163f482cc1c39bb24e8b2`.
- Worktree terpisah: `C:/Users/Aldama/AppData/Local/Temp/opencode/sigap-selected-release-20260923`.
- Head final dicatat pada Draft PR dan komentar handoff Issue #341 agar tidak
  membuat referensi SHA sirkular dalam commit laporan sendiri.
- `AGENTS.md`, `docs/AI_COLLABORATION.md`, dan peta rilis dibaca. Dua dokumen
  kebijakan identik antara snapshot main/staging; peta rilis production diperiksa.
- PR aktif #317 adalah follow-up autosave, bukan bagian #307 yang sudah merged.
  PR aktif #340 mengurus sinkronisasi hotfix dokumentasi External API. Keduanya
  tetap milik pekerja asal. Issue #332 sudah closed; tidak ada klaim release aktif
  lain yang ditemukan. Branch/worktree fitur asal tidak dipakai ulang.
- Empat laporan QA untracked pada worktree awal tetap utuh.
- Workflow diperiksa: Draft PR menjalankan quality workflow; deployment staging
  hanya dipicu push ke `staging`, bukan push branch release atau Draft PR ini.

## Bukti ancestry dan kesetaraan patch

Semua commit sumber target berada dalam ancestry snapshot staging, tetapi bukan
ancestor main dengan SHA aslinya. Promosi #333 menggunakan commit ber-SHA baru.
Commit bertajuk "Merge pull request" pada tabel berikut memiliki **satu parent**;
judul commit bukan bukti merge seluruh branch. Setiap commit representasi di bawah
terverifikasi sebagai ancestor base main.

| PR | Commit sumber yang diaudit | Representasi yang sudah di main | Bukti |
| --- | --- | --- | --- |
| #307 | `87dcc043`, `56e82d4a`, `82af7f14`, `73c208d6`, `be8eb01e`, `d075b518`, `bcca87a0`, `e87eff74`, `8185c996`, `8f77de8f`, `d1125c1c`, `217ace9b`, `f8b26a7d`, `ddfccd7d`, `81d8c5dc` | `d1cf9f27` | Aggregate patch identik: `07513f33c5007a3ee3dc902a8d2f28e52099660d` |
| #322 | `cd82953b`, `699c6b4f` | `e9f4e3b1` | Aggregate patch identik: `3ea002bcaf5b655fb071f250c86e124bc212b82e` |
| #323 | `0ec6fa85` | `48aa7750` | Patch identik: `6ced8eaf43241118b19be46d5f40596b49a1e98c` |
| #325 | `3bd9c5ed` | `2916bf36` | Patch identik: `82a4abe75141d33b4b988954837ffade349cce7c` |
| #330 | `1d4213a2` | `21274592` | Patch source/test identik tanpa peta rilis: `b219e77875b51c3098c21c5eb5a1c1c8f74291a6` |
| #331 | `f5b21474` | `23671327` | Patch identik: `0809552fb54b789dddb3087fbf6f0d424a345a27` |
| #329 | `286c52f9`, `1bde1c70`, `8ce22cd0`, `a03c4b4e` | `b97cb94f`, `4d1dc17f`, `a86209ee`, `99ddb977` | Keempat pasangan patch identik; merge staging `e14cbba7` tidak diperlukan |

Perbandingan memakai `git diff <parent> <head> | git patch-id --stable`, bukan
asumsi dari judul PR. Untuk #307 digunakan diff aggregate
`c878812^1..81d8c5d`; #322 memakai `cd82953^..699c6b4`.

Pemeriksaan content HEAD memperkuat bukti patch:

- Seluruh runtime Kalender Kerja, SuratForm, modul usage, service Surat, domain
  runtime/routes, admin-user runtime/service/UI identik dengan snapshot staging.
- Sepuluh file #323 identik byte-for-byte dengan head sumber.
- Seluruh source/test #331 identik; hanya peta rilis berbeda.
- Seluruh runtime #329 identik; satu test hanya berbeda whitespace.
- Perbedaan tersisa terhadap head PR lama adalah fitur target lanjutan (#325,
  #330, #331, #329), whitespace `surat-wizard-steps.ts`, serta assertion changelog
  kalender yang sudah disesuaikan oleh commit dokumentasi release `15447b4`.

**Commit fitur baru yang masuk kandidat: 0. Dependency baru: 0. Konflik: 0.**
Cherry-pick ulang akan menduplikasi perubahan yang sudah ada atau mengembalikan
penyesuaian production sebelumnya.

## Dependency dan urutan yang sudah dipenuhi baseline

1. CAL-03 F1/F2 menyediakan komponen, repository, schema dan RLS; F3 menyediakan
   route dan anggota Tim; F4A/F4B menyediakan overview, panel detail dan quick add;
   F5/F6/F7 menyediakan lifecycle, hari kerja dan ringkasan. #322/#323 memakai
   fondasi ini. Kedua PR UX tidak bergantung satu sama lain secara wajib; urutan
   historis main adalah #322 lalu #323.
2. Refactor registrasi dan workflow kanonikal menyediakan kontrak usage. #307
   menyediakan modul form-first yang dipakai #325. Lookup pagination #314
   (`04dc1a5`) menyediakan koleksi Unit penuh. Inbox #315/#316 sudah ada di base
   sebelum #325 dan menjaga konteks tugas pemeriksa.
3. #325 menyediakan availability fail-closed dan recovery; #330 membuka field
   proyek/jumlah untuk revisi; #331 memulihkan exact historical usage melalui
   client pengguna/RLS. Urutan: #307, fondasi lookup/inbox, #325, #330, #331.
4. #329 memakai BFF session/admin guard, profiles, organization dan Auth yang sudah
   tersedia. Empat commit implementasinya berurutan; merge staging dalam branch
   sumber bukan dependency yang perlu dibawa. Production memakai invite/recovery
   email serta validasi URL aplikasi yang sudah terdapat di main.

Daftar ini menjelaskan baseline yang telah dirilis, bukan izin memasukkan ulang
seluruh paket dependency #333 ke kandidat baru.

## Migration: tidak ada delta

Tidak ada migration ditambah, diedit, dihapus, atau diterapkan kandidat ini.
Tidak ditemukan kebutuhan migration baru dibanding source base. Status remote
tidak diperiksa karena database production berada di luar batas pekerjaan.

Inventaris berikut adalah **15 migration historis yang sudah berada di main
melalui #333**, menurut diff Git. Issue #332 melaporkan seluruhnya telah diterapkan.
Urutan tabel adalah urutan timestamp untuk rekonsiliasi bila bukti rollout nanti
ditinjau operator; **bukan perintah apply ulang**.

| Urutan | Nama migration | Dependency dan dampak |
| --- | --- | --- |
| 1 | `20260903120000_branch_asset_without_project.sql` | Registrasi, reservation, kantor/proyek dan usage; fallback Aset cabang tanpa proyek, scope nomor immutable |
| 2 | `20260915072607_work_calendar_entries.sql` | Profiles/Auth; tabel kalender, constraint, RLS dan write contract |
| 3 | `20260915093000_work_calendar_team_members.sql` | 2 + hierarchy profile aktif; RPC anggota Tim dan otorisasi hierarchy |
| 4 | `20260916170000_work_calendar_team_overview.sql` | 2–3 + master kantor/departemen; overview Tim server-side |
| 5 | `20260916171000_work_calendar_team_overview_scale.sql` | 4; pagination, availability dan pencarian anggota untuk skala besar |
| 6 | `20260917120000_work_calendar_lifecycle.sql` | 2; due date, warna, event history dan trigger audit lifecycle |
| 7 | `20260917130000_canonical_submission_workflow_contract.sql` | Form usage, signatures, profiles; kontrak signer/checker, snapshot dan template internal |
| 8 | `20260917131000_atomic_configured_checker_input.sql` | 7 + verification RPC; validasi dan penyimpanan input pemeriksa atomik |
| 9 | `20260917132000_optional_branch_signer_fallback.sql` | 7–8; signer opsional cabang dan fallback kandidat kantor |
| 10 | `20260917133000_seed_canonical_submission_workflows.sql` | 7–9 + master form/departemen; konfigurasi workflow bisnis dan pengarsipan kegunaan lama |
| 11 | `20260918090000_work_calendar_holidays.sql` | Fondasi kalender; holidays dan pembacaan pengaturan KPI dengan fallback |
| 12 | `20260918100000_restore_asset_recommendation_config.sql` | 10 + master rekomendasi; pemulihan tautan template rekomendasi Aset |
| 13 | `20260918120000_work_calendar_notifications.sql` | 2, 6, 11 + notifications; dedupe, generator, dashboard dan recent events |
| 14 | `20260918130000_fix_recommendation_creator_auto_approval.sql` | 10, 12 + recommendation workflow; mencegah requirement lampiran ulang pada approval pembuat |
| 15 | `20260919000050_separate_inbox_verification_tasks.sql` | Compact inbox, signatures, revision events; memisahkan tugas approval dan pemeriksa, termasuk count |

Migration nomor 15 sudah ada di base, meskipun prefix tanggalnya masuk batas
larangan migration baru pengguna. File itu tidak masuk diff kandidat dan tidak
diubah/dihapus. Dependency revisi yang lebih lama juga sudah ada:
`20260811170000_unit_revision_reallocation_guard.sql` dan
`20260818170000_external_submission_decisions.sql`.

## Bukti eksklusi dan audit diff

File perubahan kandidat hanya:

1. `docs/releases/2026-09-23-selected-production-readiness.md` — laporan ini.
2. `docs/FEATURE_RELEASE_MAP.md` — satu baris indeks REL-02.

Tidak ada endpoint, route, package, lockfile, migration, workflow, konfigurasi
environment, atau runtime yang berubah. Route baseline yang diverifikasi:
`/calendar`, `/surat/registrasi`, `/surat/inbox`, `/admin/users`.
Endpoint baseline target:

- `POST /api/surat/unit-availability/validate`;
- `POST /api/admin/users`;
- `PATCH /api/admin/users/:userId`;
- `POST /api/admin/users/:userId/reset-password`;
- `PATCH /api/admin/users/:userId/status`;
- `POST /api/admin/users/sync-active-import`.

Pemeriksaan tracked tree tidak menemukan file fixture single-account/split-account,
runbook keduanya, migration `20260919000000_*`, `20260919000100_*`, atau migration
cross-office mapping staging. Tidak ada commit staging baru di ancestry kandidat.
Tidak ada payload/data `[UJI STAGING]`, akun, kegunaan, atau surat uji ditambahkan.
Referensi nama larangan dalam laporan ini hanyalah inventaris audit.

Baseline main masih mempunyai utilitas lama berscope staging; audit ini tidak
mengklaim seluruh repository bebas kata staging. Bukti eksklusi adalah diff
terhadap base dan tidak adanya artefak fixture terlarang yang disebut di atas.
Tidak ada type escape/suppression baru atau credential dalam delta dokumentasi.

## Quality gates lokal

Environment: Windows, Node `v24.11.1`, npm `11.12.1`; worktree fresh dengan LF,
tanpa menyalin file environment atau credential. Test memakai mock/harness lokal.

| Gate | Hasil |
| --- | --- |
| `npm ci --workspaces --include-workspace-root` | PASS; 696 package ditambah, 702 diaudit, 0 vulnerability |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS; frontend, shared, backend |
| `npm test` | PASS; 176 file, 1.734 test, 78,67 detik |
| `npm run build` | PASS; 5.125 modul, Vite build 19,11 detik |
| `npm audit --audit-level=high` | PASS; 0 vulnerability |
| `git diff --check origin/main...HEAD` | PASS; diperiksa kembali setelah commit final sebelum push |
| Targeted kalender/Surat/revisi/form-first/admin | PASS; seluruh suite terkait dieksekusi dalam full run, rincian di bawah |

Bukti suite target dari full run (tidak mengulang test yang sudah lulus):

- Kalender: command surface 15, view density 11, library 76, workspace 71,
  interaction UX 49, team overview 36, overview view 14, overview hook 5,
  lifecycle 7, workdays 9, page 15, boundary 52, notifications 20,
  settings repository 16, profile repository 8 test lulus.
- SPK Unit: backend availability 6, availability hook 2, form unit flow 6,
  unit revision 4, historical usage 2, inbox task type 21 test lulus.
- Form-first: acceptance 11, usage modules 25, usage registry 5 test lulus;
  seluruh flow Aset/Dana/Non Unit, draft, attachment, signer dan rekomendasi
  juga lulus dalam full run.
- Admin: runtime 32 dan AddUserModal 4 test lulus.
- Compact inbox 44 test lulus; kegagalan CRLF historis PR sumber tidak muncul
  pada baseline production ini. Tidak ada failure baseline atau regresi.
- Peringatan test nonfatal: multiple Auth client instances dan React `act`;
  tidak ada perubahan test/runtime untuk menyembunyikannya. SQL disposable dan
  browser/live smoke tidak dijalankan ulang; kandidat tidak mengubah SQL/runtime.

## Risiko dan tindak lanjut setelah review

1. Reviewer perlu menyetujui bahwa permintaan promosi sudah terpenuhi oleh #333.
   Draft ini tidak membawa payload runtime untuk rollout kedua.
2. Bukti deployment dan 15 migration berasal dari catatan release sebelumnya.
   Bila diperlukan audit live, lakukan sebagai pekerjaan baru berizin eksplisit:
   cocokkan SHA app/worker dan migration history terhadap manifest, tanpa
   menampilkan credential. Hentikan bila ada drift; jangan blind repair/apply.
3. Jika benar ada delta runtime yang belum dirilis, buat kandidat baru dari main
   terbaru dengan commit minimum, lalu jalankan ulang quality gates dan review.
   Jangan merge staging secara keseluruhan.
4. Setelah persetujuan rollout terpisah, operator memverifikasi backup, kontrak
   schema, undangan/pemulihan email dan URL aplikasi; jalankan smoke kalender,
   form-first, kapasitas Unit, pengembalian/revisi, historical usage dan admin
   authorization. Uji business write memerlukan izin tersendiri. Pertahankan
   nomor/snapshot dokumen dan histori; rollback schema melalui forward fix.
5. PR #317 masih terbuka untuk follow-up autosave. Jangan menganggap isi branch
   sumber saat ini identik dengan batas commit #307 yang sudah direview.

## Hal yang tidak disentuh

- Merge main/staging, deployment production maupun staging, force-push.
- Database/schema/data/migration history remote, termasuk Supabase Auth nyata.
- Secrets, password, token, connection string dan client credential.
- Cloudflare, DNS/tunnel, container/image remote, PDF/outbound/sync worker.
- Vendor API, panggilan GET maupun POST, dokumen dan akun bisnis/uji nyata.
- Fixture/runbook staging, override/remapping staging, migration yang diterapkan.
- Changelog/version, runtime, workflow CI/deployment, branch/PR milik pekerja lain.
