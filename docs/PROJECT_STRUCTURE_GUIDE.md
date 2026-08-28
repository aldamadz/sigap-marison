# SIGAP Project Structure Guide

Dokumen ini menjadi standar struktur kode SIGAP agar pengembangan berikutnya
lebih mudah dirawat, diuji, dan dipecah tanpa mengubah perilaku bisnis secara
tidak sengaja.

## Tujuan

1. File besar tidak menjadi pusat semua tanggung jawab.
2. Fitur baru punya lokasi yang jelas sejak awal.
3. Frontend, backend, worker, dokumentasi, dan kontrak external API memakai pola
   yang konsisten.
4. Refactor dilakukan bertahap dengan test characterization, bukan sekali besar.
5. Kode lama yang sudah tidak dipakai harus dihapus setelah jalur penggantinya
   terbukti aktif di staging dan production.

## Prinsip Struktur

- Satu folder fitur mewakili satu bounded context, bukan satu halaman besar.
- Page hanya mengatur layout dan orchestration ringan.
- Component hanya menerima props dan menampilkan UI.
- Hook mengatur state, query, side effect browser, dan workflow UI.
- Service frontend hanya membungkus API/RPC, tanpa aturan UI.
- Backend route hanya boundary HTTP: auth, parsing, validasi request, dan response.
- Backend service/use-case berisi aturan bisnis.
- Adapter berisi integrasi pihak luar: Supabase, storage, email, Marison, dan
  external system lain.
- Shared contract ditempatkan di `shared/src` bila dipakai lintas frontend,
  backend, worker, atau external API.

## Struktur Frontend Target

```text
src/
  app/
    routes/
    providers/
    query-client.ts
  features/
    surat/
      registration/
        components/
        hooks/
        services/
        state/
        schema/
        types.ts
        index.ts
      inbox/
        components/
        hooks/
        services/
        types.ts
        index.ts
      monitoring/
      revision/
      recommendation/
      pdf/
      shared/
    admin/
      users/
      forms/
      offices/
      projects/
      integration/
    docs/
      components/
      content/
      registry.ts
      types.ts
  components/
    ui/
    layout/
  lib/
  services/
```

`src/pages/*` boleh tetap ada sebagai route wrapper sementara. Untuk fitur baru,
isi kompleksnya masuk ke `src/features/*`.

## Aturan Frontend

### Page

Page boleh berisi:

- pemilihan layout;
- pembacaan URL parameter;
- pemanggilan hook utama;
- komposisi section.

Page tidak boleh berisi:

- mapping payload external;
- validasi bisnis panjang;
- manipulasi file;
- renderer tabel/form besar;
- query Supabase langsung kecuali halaman legacy yang belum dipecah.

### Component

Component idealnya:

- kurang dari 250 baris;
- props eksplisit;
- tidak memanggil API langsung;
- tidak membaca URL/global state kecuali component route-level;
- punya nama sesuai fungsi, misalnya `RecommendationDetailList`,
  `InboxApprovalPanel`, atau `SuratAttachmentUploader`.

Jika component melewati 350 baris, pecah menjadi subcomponent atau hook.

### Hook

Hook boleh memegang state dan side effect:

```text
useSuratRegistrationDraft()
useSuratNumberReservation()
useSuratAttachments()
useRecommendationMultiDetail()
useInboxList()
useInboxDetail()
useApprovalAction()
```

Hook tidak boleh menghasilkan JSX besar. Bila return hook terlalu banyak field,
kelompokkan dengan object bernama:

```ts
return {
  state,
  actions,
  queries,
  validation,
};
```

### Service Frontend

Service frontend harus menjadi wrapper API yang tipis:

```text
src/features/surat/registration/services/registration-api.ts
src/features/surat/inbox/services/inbox-api.ts
src/features/surat/revision/services/revision-api.ts
src/features/surat/pdf/services/pdf-api.ts
```

`src/services/surat.service.ts` saat ini masih legacy god-service. Pemecahan
dilakukan bertahap; jangan menambah method baru ke file ini bila fitur baru bisa
ditempatkan di service fitur.

## Struktur Backend Target

```text
backend/src/
  app.ts
  config/
  plugins/
  lib/
    http.ts
    session.ts
    supabase.ts
    crypto.ts
    storage.ts
  modules/
    auth/
      auth.routes.ts
      auth.controller.ts
      auth.service.ts
    bff/
    surat/
      registration/
      inbox/
      monitoring/
      revision/
      pdf/
      storage/
      notifications/
    marison/
      sync/
      outbound/
      mappings/
    external-api/
      auth/
      decisions/
      docs/
  workers/
```

`backend/src/domain-runtime.ts` adalah target refactor utama. Selama refactor,
route lama boleh tetap memanggil wrapper kompatibilitas, tetapi semua module baru
harus langsung memakai route/controller/service yang terpisah.

## Aturan Backend

### Route

Route hanya boleh:

- mendefinisikan method/path;
- menjalankan auth middleware;
- membaca params/query/body;
- memanggil controller;
- mengembalikan response.

Route tidak boleh berisi query database panjang, mapping payload, atau workflow.

### Controller

Controller boleh:

- validasi request dengan schema;
- mapping request ke command/query object;
- mapping hasil service ke HTTP response.

Controller tidak boleh menyimpan state bisnis.

### Service / Use Case

Service/use-case berisi aturan bisnis:

```text
submitSuratRegistration
approveSuratSignature
requestExternalRevision
buildMarisonAssetPayload
syncMarisonEmployees
```

Service tidak boleh mengetahui detail HTTP seperti header, cookie, atau status
code.

### Adapter

Adapter berisi akses teknis:

- Supabase RPC/table/storage;
- email provider;
- Marison external API;
- file/token storage;
- PDF renderer.

Adapter harus mudah dimock di test.

## Struktur Shared Contract

Gunakan `shared/src` untuk tipe/schema yang dipakai lebih dari satu runtime:

```text
shared/src/
  surat/
    registration.ts
    approval.ts
    revision.ts
  recommendation/
    multi-detail.ts
  marison/
    asset.ts
    unit.ts
    non-unit.ts
    fund.ts
  external-api/
    submission-decisions.ts
```

Aturan:

- Schema request/response external API harus menjadi sumber kebenaran.
- Frontend boleh memakai type dari shared, tetapi tidak boleh mengimpor module
  backend.
- Backend, worker, dan external API boleh memakai shared contract yang sama.

## Struktur Dokumentasi Internal `/docs`

Masalah saat ini: konten halaman dokumentasi aplikasi masih terkumpul besar di
`src/pages/docs/docsContent.ts`. Targetnya adalah registry kecil yang mengimpor
konten per topik.

Struktur target:

```text
src/features/docs/
  types.ts
  registry.ts
  components/
    DocsLayout.tsx
    DocsSidebar.tsx
    DocsArticle.tsx
    DocsSearch.tsx
  content/
    user/
      dashboard.ts
      surat-registration.ts
      inbox.ts
      monitoring.ts
    admin/
      users.ts
      master-data.ts
      form-usages.ts
      integration.ts
    troubleshooting/
      common-errors.ts
      marison.ts
      pdf.ts
    version/
      changelog.ts
```

Contoh `/docs/dashboard/overview`:

```ts
// src/features/docs/content/user/dashboard.ts
import type { DocsEntry } from "../../types";

export const dashboardDocs: DocsEntry = {
  id: "dashboard",
  title: "Dashboard",
  audience: "user",
  sections: [
    {
      title: "Overview",
      content: [
        "Dashboard menampilkan ringkasan pekerjaan aktif dan akses cepat.",
      ],
    },
  ],
};
```

Registry:

```ts
// src/features/docs/registry.ts
import { dashboardDocs } from "./content/user/dashboard";
import { inboxDocs } from "./content/user/inbox";

export const docsEntries = [
  dashboardDocs,
  inboxDocs,
];
```

Aturan dokumentasi internal:

- Satu file konten maksimal satu topik.
- Changelog dipisah dari panduan pengguna.
- Teks troubleshooting dipisah dari flow normal.
- Slug dibuat dari registry, bukan hardcoded panjang di page.
- Page docs tidak boleh menyimpan konten panjang.
- Komponen docs tidak boleh mengandung data dokumen hardcoded.

## Struktur External API

External API harus mudah ditambah ketika ada sistem luar yang mengonsumsi data
SIGAP. Jangan campur auth, OpenAPI, route, dan business handler dalam satu file.

Struktur target:

```text
external-api/
  src/
    app.mjs
    config.mjs
    auth/
      client-credentials.mjs
      signature.mjs
      audit.mjs
    modules/
      submission-decisions/
        routes.mjs
        handler.mjs
        schema.mjs
        openapi.mjs
      master-data/
        routes.mjs
        handler.mjs
        schema.mjs
        openapi.mjs
      surat-readonly/
        routes.mjs
        handler.mjs
        schema.mjs
        openapi.mjs
    openapi/
      build-openapi.mjs
      security.mjs
      errors.mjs
    docs/
      zudoku.config.ts
  server.mjs
```

`external-api/server.mjs` cukup menjadi bootstrap:

```js
import { buildExternalApiApp } from "./src/app.mjs";
import { readExternalApiConfig } from "./src/config.mjs";

const app = await buildExternalApiApp(readExternalApiConfig(process.env));
await app.listen({ host: "0.0.0.0", port: app.config.port });
```

## Aturan Menambah API External

Setiap API baru wajib punya:

1. Feature ID di `docs/FEATURE_RELEASE_MAP.md`.
2. Schema request/response di `shared/src/external-api` atau module external-api.
3. Handler terpisah dari auth/signature.
4. OpenAPI fragment sendiri.
5. Test auth:
   - tanpa token ditolak;
   - token salah ditolak;
   - signature salah ditolak;
   - timestamp kedaluwarsa ditolak;
   - replay idempotent sesuai kontrak.
6. Test payload valid dan invalid.
7. Dokumentasi Zudoku otomatis memakai OpenAPI yang sama dengan runtime.
8. Smoke test staging sebelum production.

## Pola OpenAPI External

Setiap module menyediakan fragment:

```js
export const submissionDecisionOpenApi = {
  paths: {
    "/api/v1/submission-decisions": {
      post: {
        tags: ["Submission Decisions"],
        summary: "Kirim keputusan pengajuan",
      },
    },
  },
  schemas: {
    SubmissionDecisionRequest: {},
  },
};
```

Builder menggabungkan semua fragment:

```js
export const buildOpenApiDocument = (config) => mergeOpenApiFragments([
  securityOpenApi(config),
  submissionDecisionOpenApi,
  masterDataOpenApi,
]);
```

Dengan pola ini, menambah endpoint baru tidak perlu mengedit satu file OpenAPI
besar.

## Target File Size

| Jenis file | Target | Batas perlu evaluasi |
| --- | ---: | ---: |
| Presentational component | 80-250 baris | 350 baris |
| Page route | 80-250 baris | 350 baris |
| Hook | 80-220 baris | 300 baris |
| Frontend service | 80-250 baris | 350 baris |
| Backend route | 30-150 baris | 220 baris |
| Backend controller | 50-200 baris | 300 baris |
| Backend service/use-case | 100-300 baris | 450 baris |
| Shared schema/helper | 50-250 baris | 350 baris |
| Docs content file | 50-300 baris | 400 baris |

Batas ini bukan aturan kaku. File boleh lebih besar jika memang satu algoritma
utuh, tetapi harus ada alasan jelas.

## Urutan Refactor Yang Disarankan

### Tahap 1: Safety Net

- Tambah characterization test untuk route/domain yang belum terkunci.
- Kunci behavior `SuratForm`, `InboxPage`, `MonitoringPage`, External API docs,
  dan outbound Marison.
- Jangan ubah behavior pada tahap ini.

### Tahap 2: Backend Runtime

1. Pecah primitive HTTP/session/auth yang masih tersisa.
2. Pecah BFF dan realtime.
3. Pecah inbox/attention.
4. Pecah PDF/file token/storage.
5. Pecah notification.
6. Pecah Marison sync/outbound.
7. Ganti dispatcher if-chain menjadi route/controller native Fastify.
8. Hapus `@ts-nocheck` setelah module typed.

### Tahap 3: SuratForm

1. Pindahkan helper pure ke `src/features/surat/registration/schema`.
2. Pindahkan draft/number/attachment/recommendation ke hook masing-masing.
3. Pecah section UI.
4. Jadikan `SuratForm.tsx` shell kecil.
5. Hapus helper legacy yang sudah tidak dipakai.

### Tahap 4: Inbox dan Monitoring

1. Pecah list/detail/action panel.
2. Pindahkan approval/revision/unit allocation ke hook.
3. Buat service per fitur.
4. Pastikan loading state detail tidak bisa blank tanpa tombol retry.

### Tahap 5: Docs dan External API

1. Pecah `docsContent.ts` menjadi file per topik.
2. Pindahkan docs UI ke `src/features/docs`.
3. Pecah `external-api/server.mjs` menjadi app/auth/modules/openapi.
4. Pastikan Zudoku membaca OpenAPI hasil build runtime.

## Checklist PR Refactor

Sebelum PR:

- Scope satu domain kecil.
- Ada test characterization atau regression.
- Tidak mengubah schema/API tanpa diminta.
- Tidak menghapus kode lama sebelum jalur baru aktif.

Saat PR:

- Diff mudah dibaca.
- Nama file mencerminkan domain.
- Tidak menambah import circular.
- Tidak memperbesar god-service lama.

Sebelum merge:

- Targeted test pass.
- Typecheck pass.
- Lint pass.
- Build pass bila menyentuh runtime.
- `git diff --check` pass.

Setelah deploy staging:

- Smoke test sesuai fitur.
- Catat Feature ID dan status di `FEATURE_RELEASE_MAP.md`.
- Jika siap production, rilis hanya branch/fitur yang dipilih, bukan seluruh
  staging.

## Area Prioritas SIGAP Saat Ini

1. `backend/src/domain-runtime.ts`: pecah karena terlalu banyak domain backend
   berada dalam satu file.
2. `src/components/surat/SuratForm.tsx`: pecah karena menjadi pusat state dan UI
   registrasi.
3. `src/pages/surat/InboxPage.tsx`: pecah karena approval, revision, allocation,
   dan PDF bercampur.
4. `src/services/surat.service.ts`: pecah setelah page/hook mulai stabil.
5. `src/pages/docs/docsContent.ts`: pecah agar `/docs/dashboard/overview` dan
   topik lain mudah dimaintain.
6. `external-api/server.mjs` dan `external-api/openapi.mjs`: pecah agar API
   external baru mudah ditambah tanpa mengubah semua kontrak sekaligus.
