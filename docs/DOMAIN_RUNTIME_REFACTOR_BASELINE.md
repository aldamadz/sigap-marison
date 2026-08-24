# Domain Runtime Refactor Baseline — Audit & Plan

Feature ID: **BKND-01** (Domain Runtime Characterization & Refactor Baseline)

Snapshot: `backend/src/domain-runtime.ts` @ origin/staging `a0f11b48a899d7bf7c84d4bfd3910903ec1b8b86`

## 1. Ukuran & Tanggung Jawab

- **5,523 baris** (satu file, module-level eager config + raw Node dispatcher).
- `@ts-nocheck` di **baris 2** — satu-satunya di seluruh `backend/`.
- Dua lapis HTTP:
  1. Fastify `buildApp()` (`app.ts`) → route table (`domain.routes.ts`, 42 route) → hijack `request.raw`/`reply.raw`.
  2. `handleRequest(req, res)` (`domain-runtime.ts:5106`) — dispatcher monolithic `if`-chain ke handler domain.

## 2. Kelompok Domain (line ranges)

| Kelompok | Range | Tanggung jawab |
|---|---|---|
| Config & env | 64–159 | Env, boot-time throw, supabase/storage/SMTP client |
| Crypto/headers/response | 160–263 | `sendJson`, `withSecurityHeaders`, HMAC/SHA |
| Mail transport & settings | 264–383 | SMTP transporter, email settings |
| Storage helpers | 385–397 | Storage client, public URL |
| Body parsing | 399–426 | `readRequestBody`, `readJsonBody` |
| Session cookie layer | 428–518 | Cookie session, `requireCookieSession`, `assertSameOrigin`, create clients |
| Auth handlers | 520–580 | login/verify/update/logout |
| BFF query/function/storage/realtime | 582–764 | `/api/bff/*`, SSE `/api/events` |
| Password reset | 766–905 | Reset email + request |
| Auth primitives | 907–984 | `getBearerToken`, `requireSupabaseUser`, `requireAdminUser` |
| Template preview (Excel/PDF) | 986–1369 | Preview generation |
| **Surat / Inbox** | 1371–1554 | `getInboxCompact`, `getInboxDetail` |
| Attention state | 1556–1598 | `/api/attention/state` |
| Web Push | 1600–1703 | Push subscribe/send |
| Email notifications | 1705–2240 | Rendering + tokens |
| Internal notification | 2241–2560 | Email+push+rows |
| Storage uploads | 2561–2748 | Multipart upload |
| Activity/dashboard | 2749–2806 | Department activity |
| Attachment replacement | 2807–2930 | Replace signature attachments |
| Marison inbound/sync | 2931–3370 | Tokens, preview, sync |
| Marison status/test | 3371–3475 | `/api/integrations/marison/status`, probe, test |
| Surat auth/storage refs | 3476–3616 | `canReadSurat`, storage ref allowlist |
| External normalization | 3537–3616+ | Value normalization |
| **Marison outbound (admin)** | ~4479–4700 | dispatches, preflight, reconcile, replacement |
| **Dispatcher** | 5106–5522 | `handleRequest` route matching |

## 3. Urutan PR Refactor Terkecil & Aman

Tujuan: memecah file tanpa mengubah behavior; tiap PR didahului characterization test.

1. **PR-A: Extract response/auth primitives** (baris 160–263, 428–518, 907–984) → `backend/src/lib/http.ts`, `lib/session.ts`. Imut, tidak ada circular dep (hanya dipakai handler).
2. **PR-B: Extract BFF layer** (582–764) → `backend/src/bff/*`. `handleRequest` memanggil helper; tidak ada state antar BFF.
3. **PR-C: Extract Inbox + Attention** (1371–1598) → `backend/src/domain/inbox.ts`, `attention.ts`. Handler murni (token in, JSON out).
4. **PR-D: Extract Marison inbound/sync/status** (2931–3475) → `backend/src/domain/marison.ts`.
5. **PR-E: Extract Marison outbound admin** (~4479–4700) → `backend/src/domain/marison-outbound.ts`.
6. **PR-F: Replace dispatcher `if`-chain** dengan route map terdata → matikan `@ts-nocheck` bertahap.

## 4. State/Helper yang TIDAK Boleh Dipisahkan Sembarangan

- **Module-level client** (`supabase`, `storageSupabase`, `smtpConfig`) — eager init; pemisahan harus lewat factory/DI.
- **Rate-limit & cooldown Maps** (110–119) — stateful, dipakai banyak handler.
- **`marisonRealtimeClients` Set** (SSE) — shared mutable state.
- **`SESSION_COOKIE_HELPERS`** + `createPublicSupabaseClient`/`createUserSupabaseClient` — dependensi auth di semua handler.
- **`withSecurityHeaders` / `sendJson` / `assertSameOrigin`** — kontrak response semua handler.
- **`getBearerToken`** fallback cookie → harus tetap satu sumber.

## 5. Kandidat Ekstrak Tanpa Circular Dependency

- `http.ts` (sendJson, securityHeaders, withSecurityHeaders, assertRequestSize, assertSameOrigin) — leaf.
- `session.ts` (cookie read/write, requireCookieSession, refresh) — leaf, hanya butuh `http.ts`.
- `supabase-client.ts` (createPublic/User/Service client) — leaf.
- `inbox.ts`, `attention.ts` — leaf handler, butuh auth primitives + supabase client.
- `marison.ts`, `marison-outbound.ts` — leaf handler.

## 6. Risiko @ts-nocheck

- Satu file (`domain-runtime.ts:2`).
- Menghapus `@ts-nocheck` langsung = error type ratusan (handler verbatim legacy). Harus bertahap:
  1. Typed route map menggantikan `if`-chain.
  2. Extract handler dengan signature tipe penuh (token, params, body → JSON).
  3. Baru hapus `@ts-nocheck` per file hasil ekstrak.
- Characterization test ini (26 test) adalah safety net sebelum/selama pemecahan.
