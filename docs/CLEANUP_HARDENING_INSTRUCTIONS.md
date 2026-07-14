# Instruksi Audit, Cleanup, dan Hardening SIGAP

## Tujuan

SIGAP sedang menuju production. Cleanup ini bukan kosmetik. Tujuannya:

1. Menghapus dead code dan artefak lama.
2. Mengurangi dependency tidak terpakai.
3. Menutup jalur akses yang membingungkan.
4. Menstandarkan role hanya menjadi `admin` dan `user`.
5. Menghapus atau menandai jelas fitur yang tidak lagi menjadi arah produk, terutama External API read-only.
6. Menjaga semua fitur production tetap berjalan.

Cleanup tidak boleh hanya membuat repository terlihat rapi, tetapi diam-diam:

- merusak surat lama,
- merusak PDF,
- merusak approval,
- merusak RLS,
- meninggalkan container/API yatim,
- atau membuat role/akses makin kabur.

## Aturan Wajib

### Branch

Buat branch khusus:

```bash
git checkout -b cleanup/deadcode-role-admin
```

Jangan kerja langsung di `main`.

### Commit

Pisahkan commit per batch:

```text
commit 1: remove high-confidence dead source
commit 2: remove orphan notification subtree
commit 3: remove orphan ui wrappers
commit 4: uninstall unused dependencies
commit 5: consolidate toast
commit 6: standardize admin role only
commit 7: disable production source maps
commit 8: external api cleanup, only if approved
commit 9: docs and changelog update
```

Jika semua digabung menjadi satu commit besar, perubahan tidak layak review.

### Quality Gate

Setelah setiap batch besar:

```bash
npm run typecheck
npm run lint
npm test
npm run test:document-layout
npm run test:pgd-pdf
npm audit --audit-level=moderate
npm run build
```

Jika salah satu gagal, batch dianggap `FAIL`.

## Keputusan Role

### Role Resmi

Mulai sekarang role yang valid hanya:

```text
admin
user
```

`super_admin` tidak dipakai untuk saat ini.

### Target Cleanup Role

Tim harus menghapus penggunaan aktif `super_admin` dari:

```text
server.mjs
src/App.tsx
src/types/user.ts
src/types/agenda.ts
src/services/surat.service.ts
src/components/surat/SuratForm.tsx
src/pages/surat/MonitoringPage.tsx
src/pages/docs/docsContent.ts
docs/FITUR.md
```

Cari semua:

```bash
rg -n "super_admin|super admin|superadmin" .
```

Target akhir:

```bash
rg -n "super_admin|super admin|superadmin" src server.mjs docs
```

harus kosong.

### Database / Supabase

Jangan edit migration lama yang sudah pernah diterapkan.

Buat migration baru untuk normalisasi:

```sql
update public.profiles
set role = 'admin'
where role::text = 'super_admin';
```

Update helper/RPC baru agar hanya cek:

```sql
role::text = 'admin'
```

Jika ada enum/check constraint role, pastikan hanya mengizinkan:

```text
admin
user
```

Jangan mengatakan "`super_admin` tidak masalah karena sama dengan `admin`". Jika dua role punya hak sama, salah satunya adalah noise. Noise di authorization adalah sumber bug dan celah audit.

## 1. Product Analyst

### Tugas

Pastikan cleanup tidak menghapus fitur yang masih punya nilai bisnis.

### Pertanyaan Wajib

1. Apakah SIGAP butuh role selain `admin` dan `user` dalam 3 bulan ke depan?
2. Apakah ada kebutuhan membedakan owner sistem dengan admin operasional?
3. Apakah External API read-only masih dipakai pihak mana pun?
4. Apakah endpoint `external.marison-testing.biz.id` masih dikomunikasikan ke pihak luar?
5. Apakah sistem lain nanti hanya menerima data dari SIGAP melalui outbound POST?

### Acceptance Criteria Role

- User biasa tidak bisa akses halaman admin.
- Admin bisa akses semua halaman admin.
- Tidak ada role `super_admin` di UI, docs, service, route guard, atau helper server.
- Jika ada akun lama `super_admin`, setelah migration harus menjadi `admin`.

### Acceptance Criteria Cleanup

Fitur berikut tidak boleh rusak:

```text
Login
Reset password
Dashboard
Agenda
Kalender
Registrasi surat
Inbox approval
Tim pemeriksa
Rekomendasi aset
Monitoring surat
Riwayat keterlibatan
PDF preview
Regenerate PDF
Upload lampiran
Upload avatar
Admin configuration
User organization
SLA departemen
Audit log
Docs
```

### Output

- Dokumen acceptance criteria.
- Keputusan final External API: `REMOVE` atau `KEEP TEMPORARY`.
- Konfirmasi tertulis bahwa role resmi hanya `admin` dan `user`.

## 2. Tech Lead / Solution Architect

### Tugas

Memecah pekerjaan agar cleanup tidak acak.

### Batch A - Dead Source High Confidence

Hapus:

```text
src/App.css
src/test/example.test.ts
src/hooks/useNotifSound.ts
src/components/NavLink.tsx
src/components/layout/ResponsiveContainer.tsx
src/components/surat/MonitoringFilter.tsx
src/components/surat/MonitoringSidebar.tsx
```

Catatan kritis:

- Jangan hapus berdasarkan nama simbol.
- `ResponsiveContainer` dari file layout tidak dipakai.
- `ResponsiveContainer` dari `recharts` tetap dipakai. Jangan salah hapus.

### Batch B - Notifikasi Lama

Hapus:

```text
src/components/NotificationBell.tsx
src/hooks/useNotifications.ts
```

Jangan hapus:

```text
src/services/notification.service.ts
```

Service notifikasi masih mungkin dipakai jalur aktif.

### Batch C - Admin Orphan

Hapus:

```text
src/pages/admin/UnitDepartmentConfigurationPage.tsx
```

Syarat:

- Tidak ada route.
- Tidak ada dynamic import.
- Konfigurasi Unit aktif sudah pindah ke Configuration/Form Usage.

### Batch D - Wrapper UI Orphan

Kandidat hapus:

```text
src/components/ui/aspect-ratio.tsx
src/components/ui/carousel.tsx
src/components/ui/chart.tsx
src/components/ui/collapsible.tsx
src/components/ui/context-menu.tsx
src/components/ui/drawer.tsx
src/components/ui/form.tsx
src/components/ui/hover-card.tsx
src/components/ui/input-otp.tsx
src/components/ui/menubar.tsx
src/components/ui/navigation-menu.tsx
src/components/ui/pagination.tsx
src/components/ui/radio-group.tsx
src/components/ui/resizable.tsx
src/components/ui/sidebar.tsx
src/components/ui/slider.tsx
src/components/ui/toggle.tsx
src/components/ui/toggle-group.tsx
```

Jangan hapus:

```text
src/components/ui/command.tsx
src/components/ui/toast.tsx
src/components/ui/toaster.tsx
src/components/ui/use-toast.ts
```

Catatan:

- `command.tsx` masih dipakai Docs search dan SuratForm.
- Toast lama hanya boleh dihapus setelah semua caller pindah ke Sonner.
- `toggle.tsx` hanya boleh dihapus jika `toggle-group.tsx` juga dihapus.

### Batch E - Dependency Cleanup

Uninstall setelah file konsumennya hilang:

```text
@hookform/resolvers
@radix-ui/react-aspect-ratio
@radix-ui/react-collapsible
@radix-ui/react-context-menu
@radix-ui/react-hover-card
@radix-ui/react-menubar
@radix-ui/react-navigation-menu
@radix-ui/react-radio-group
@radix-ui/react-slider
@radix-ui/react-toggle
@radix-ui/react-toggle-group
embla-carousel-react
input-otp
react-hook-form
react-resizable-panels
vaul
```

Jangan uninstall sebelum:

```bash
rg -n "nama-package|nama-wrapper" src
```

bersih.

### Batch F - Toast Consolidation

Target akhir:

```text
Sonner saja
```

Migrasikan dulu caller `react-hot-toast`, terutama:

```text
src/pages/surat/RiwayatKeterlibatanPage.tsx
```

Baru uninstall:

```text
react-hot-toast
```

Jangan hapus shadcn toast sebelum caller berikut dimigrasikan:

```text
src/components/settings/SettingsView.tsx
src/App.tsx
```

### Batch G - Role Admin Only

Standarkan seluruh code ke:

```ts
role === "admin"
```

Bukan:

```ts
["admin", "super_admin"].includes(role)
```

### Batch H - Production Source Maps

Matikan production source maps.

Target:

- Dev tetap bisa debugging.
- Production tidak deploy `.map`.

### Batch I - External API Cleanup

Batch ini hanya boleh dimulai jika Product Analyst sudah menyatakan `REMOVE`.

### Output

- Architecture cleanup plan.
- Daftar file per batch.
- Risiko per batch.
- Rollback plan per batch.

## 3. Senior Frontend Engineer

### Tugas

Membersihkan frontend tanpa merusak UX dan route aktif.

### Cek Wajib

Sebelum hapus file:

```bash
rg -n "@/path/file|from .*file|lazy\\(.*file" src
```

Jangan pakai pencarian nama komponen saja.

### Role Cleanup Frontend

Cari:

```bash
rg -n "super_admin|super admin|superadmin" src
```

Ganti semua logic menjadi hanya:

```ts
role === "admin"
```

atau helper:

```ts
const isAdmin = role === "admin";
```

Jangan menyisakan helper seperti:

```ts
isAdminOrSuperAdmin
```

Jika ada, rename menjadi:

```ts
isAdmin
```

### Toast

Migrasikan `react-hot-toast` ke Sonner.

Contoh:

```ts
import { toast } from "sonner";
```

Hapus import:

```ts
import { toast } from "react-hot-toast";
```

### Source Maps

Update `vite.config.ts`.

Pastikan setelah build tidak ada `.map` di `dist/assets`.

Cek:

```powershell
Get-ChildItem dist -Recurse -Filter *.map
```

Harus kosong untuk production build.

### Jangan Sentuh

Jangan refactor besar berikut dalam batch cleanup kecil kecuali ada task khusus:

```text
SuratForm.tsx
InboxPage.tsx
docsContent.ts
```

### Output

- Daftar file frontend dihapus.
- Daftar dependency frontend dihapus.
- Screenshot smoke test halaman utama.
- Bukti `rg super_admin src` kosong.

## 4. Senior Backend Engineer

### Tugas

Membersihkan backend, endpoint lama, dan memastikan server tetap aman.

### Role Cleanup Backend

Cari:

```bash
rg -n "super_admin|super admin|superadmin" server.mjs
```

Target akhir kosong.

Ganti logic:

```js
["admin", "super_admin"].includes(role)
```

menjadi:

```js
role === "admin"
```

### Endpoint Review

Review endpoint di `server.mjs`:

- Auth wajib via Supabase Auth.
- Tidak boleh decode JWT manual.
- Tidak boleh service role tanpa auth.
- Upload harus validasi:
  - size
  - path
  - MIME
  - magic bytes
  - ownership/authorization

### Jangan Hapus

```text
pdf-worker.mjs
pgd-pdf-renderer.mjs
document-layout-rules.mjs
document-workbook-normalizer.mjs
server PDF/token route
fallback file path lama
```

### External API

Jika status `REMOVE`, bersihkan:

```text
external-api/
docker-compose.external.yml
EXTERNAL_API_* env usage
script create external client
docs external API
Swagger external API
container agenda-flow-external-api
image agenda-flow-external-api:production
```

Jangan drop database sebelum Database Engineer menyetujui.

### Output

- Endpoint aktif final.
- Endpoint dihapus.
- Bukti `rg super_admin server.mjs` kosong.
- Smoke test upload/email/PDF/file token.

## 5. Senior Database / Supabase Engineer

### Tugas

Menstandarkan role dan memastikan RLS aman.

### Migration Baru

Buat migration baru, jangan ubah migration lama.

Isi minimal:

```sql
update public.profiles
set role = 'admin'
where role::text = 'super_admin';
```

Lalu update function/helper yang saat ini cek:

```sql
role::text in ('admin', 'super_admin')
```

menjadi:

```sql
role::text = 'admin'
```

Terutama:

- `is_current_user_admin()`
- function draft/void jika ada versi terbaru
- function revision jika ada versi terbaru
- function linked recommendation jika ada versi terbaru

### Constraint Role

Cek apakah role berupa:

- enum
- text
- check constraint

Jika ada constraint yang masih mengizinkan `super_admin`, buat migration baru untuk memperketat.

Target valid role:

```text
admin
user
```

### Query Audit

Jalankan:

```sql
select role, count(*)
from public.profiles
group by role
order by role;
```

Setelah migration, tidak boleh ada `super_admin`.

### Jangan Hapus

- Migration lama.
- Tabel lama yang masih dipakai surat historis.
- RPC historis yang masih dipanggil dari frontend/server.
- Storage policies tanpa audit penuh.

### Output

- Migration role admin only.
- Hasil query role setelah migration.
- Daftar function/RLS yang diubah.
- Bukti tidak ada `super_admin` di function terbaru.

## 6. Senior QA Automation Engineer

### Tugas

Membuktikan cleanup tidak merusak production flow.

### Quality Gate

Wajib:

```bash
npm run typecheck
npm run lint
npm test
npm run test:document-layout
npm run test:pgd-pdf
npm audit --audit-level=moderate
npm run build
```

### Role Regression

Test:

1. User biasa membuka `/admin/configuration` harus ditolak.
2. Admin membuka `/admin/configuration` harus bisa.
3. Admin membuka `/audit-logs` harus bisa.
4. User biasa membuka `/audit-logs` harus ditolak.
5. Tidak ada UI atau docs menyebut `super_admin`.

### Smoke Route

Cek:

```text
/dashboard
/calendar
/agenda
/surat/registrasi
/surat/inbox
/surat/monitoring
/surat/riwayat
/surat/rekomendasi
/admin/configuration
/admin/users
/admin/monitoring
/admin/kpi-departments
/audit-logs
/docs
/settings
```

### Flow Regression

Minimal:

- login
- reset password
- upload avatar
- buat agenda
- buat surat aset
- buat surat unit
- tim pemeriksa input unit
- signer approve
- signer reject
- revisi ke pemohon
- buka PDF
- regenerate PDF
- buka lampiran
- admin edit config

### Output

- PASS/FAIL route.
- PASS/FAIL flow.
- Screenshot/video jika ada bug.
- Keputusan release: `PASS`, `FAIL`, atau `BLOCKED`.

## 7. Senior Security Engineer

### Tugas

Menilai apakah cleanup memperbaiki keamanan atau justru membuka celah.

### Role Review

Pastikan tidak ada:

```text
super_admin
```

di:

```text
src
server.mjs
docs
active SQL function terbaru
```

Jika masih ada, cleanup role dianggap `FAIL`.

### Auth Review

Pastikan:

- Tidak ada service role di frontend.
- Tidak ada route service role tanpa auth.
- Tidak ada JWT decode manual untuk auth.
- Admin guard bukan hanya UI.
- RLS tetap membatasi user biasa.
- Self-update profile tidak bisa mengubah role/status/departemen/kantor.

### Storage Review

Pastikan:

- Avatar tidak pakai public Supabase URL langsung.
- Lampiran/dokumen tidak pakai public storage URL langsung.
- File token masih short-lived/one-time.
- Upload cek magic bytes.

### Source Map

Pastikan production build tidak menghasilkan `.map`.

### External API

Jika external API dihapus:

- Token/client secret external tidak tersisa di docs/env example.
- Container dan route tidak reachable.
- Domain external ditutup atau diarahkan jelas.

### Output

- Security `PASS`/`FAIL`.
- Blocking issue.
- Rekomendasi hardening lanjutan.

## 8. DevOps / Release Engineer

### Tugas

Menjaga release dan rollback.

### Sebelum Merge

Cek:

```bash
git status
git diff --name-only
npm run quality
```

Cek tidak ada secret:

```bash
git diff --cached --name-only
```

Tidak boleh commit:

```text
.env
.env.local
.env.production
.env.server
dist/
node_modules/
.tmp-pdf-check/
*.tsbuildinfo
tmp_*
```

### Deploy

App utama:

```bash
docker --context ubuntu-server compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Jika external API belum dihapus dan ingin menghindari orphan warning:

```bash
docker --context ubuntu-server compose -f docker-compose.prod.yml -f docker-compose.external.yml --env-file .env.production up -d --build --no-deps agenda-flow
```

Jangan pakai:

```bash
--remove-orphans
```

selama external API belum resmi dihapus.

### Setelah Deploy

Cek:

```bash
docker --context ubuntu-server ps --filter name=agenda-flow-prod
docker --context ubuntu-server logs --tail 100 agenda-flow-prod
curl -I https://sigap.marison-testing.biz.id/dashboard
```

### PASS

Release `PASS` jika:

- container healthy
- domain 200
- tidak ada error 500 baru
- smoke test route utama lolos
- tidak ada source map production
- `super_admin` tidak ada di source aktif

### BLOCKED

Release `BLOCKED` jika:

- role cleanup belum selesai
- external API dihapus parsial
- build/lint/test gagal
- PDF tidak bisa dibuka
- login/admin route rusak
- ada route service role tanpa auth

## Perintah Review Final

Sebelum dinyatakan selesai, jalankan:

```bash
rg -n "super_admin|super admin|superadmin" src server.mjs docs
rg -n "react-hot-toast" src package.json
rg -n "@/components/ui/(aspect-ratio|carousel|chart|collapsible|context-menu|drawer|form|hover-card|input-otp|menubar|navigation-menu|pagination|radio-group|resizable|sidebar|slider|toggle|toggle-group)" src
Get-ChildItem dist -Recurse -Filter *.map
npm run quality
npm audit --audit-level=moderate
```

Target:

- `super_admin` kosong.
- `react-hot-toast` kosong setelah migrasi.
- wrapper orphan kosong.
- production `.map` kosong.
- quality gate `PASS`.
- audit `PASS`.

## Definisi Selesai

Cleanup dianggap selesai jika:

1. Akses role lebih sederhana.
2. Dead code tidak ada.
3. Dependency turun.
4. Security tidak mundur.
5. Build dan test hijau.
6. Production flow tetap jalan.
7. Dokumentasi sesuai kenyataan.
8. Tidak ada artefak yatim seperti container, route, env, atau docs lama.

Jika salah satu belum terpenuhi, statusnya bukan selesai. Statusnya setengah bersih, dan itu lebih berbahaya daripada belum dibersihkan.
