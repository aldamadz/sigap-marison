# Changelog

## [2026-08-04] INBOX-01: Compact Approval Inbox — server-side filter, lazy detail, pagination

### Added
- `get_compact_inbox` RPC: server-side filter (search, request_category, task_type), keyset cursor pagination (available_at, task_type, id), returns compact item type without form_input_data/data_snapshot/attachments.
- `get_compact_inbox_count` RPC: same predicate as list for badge consistency, used for pagination total on first page only.
- `is_inbox_task_active` RPC: canonical predicate for detail authorization, checks signer/verifier active step and revision state.
- `GET /api/surat/inbox`: BFF endpoint with strict validation (limit 1-50, cursor base64, search max 200 chars, task_type allowlist).
- `GET /api/surat/inbox/:signatureId/detail`: BFF endpoint with UUID validation and is_inbox_task_active authorization.
- `compact_inbox_item` PostgreSQL type for RPC return value.
- `suratService.getMyInboxCompact()` and `suratService.getMyInboxDetail()` in client service.
- Lazy detail loading with skeleton placeholder in InboxPage.
- Load-more pagination button with remaining count.
- Debounced search (400ms) with filter key reset on change.
- `keepPreviousData` for smooth pagination transitions.
- 43 compact inbox tests (structural contracts, behavioral: cursor, pagination, limit, filter).

### Changed
- Inbox query key renamed from `surat-inbox` to `surat-inbox-compact`.
- InboxPage now uses compact list + separate detail query instead of full inbox query.
- `filteredInbox` memo simplified (search/category moved to server-side).
- Attention badge `inboxCount` now uses `get_compact_inbox_count` for consistency.
- `InboxPage.tsx` invalidation updated for new query keys.

### Fixed
- `domain.routes.ts`: registered `/api/surat/inbox` and `/api/surat/inbox/:signatureId/detail` routes (PR #93).

### Security
- All three RPC functions: SECURITY INVOKER, `SET search_path = public`.
- Grants: `service_role` only; `REVOKE` from `PUBLIC`, `anon`, `authenticated`.
- `p_user_id` sourced from BFF session, never from client.
- Detail authorization via `is_inbox_task_active` RPC (returns 403 for inactive/other user).
- Search parameterized via ILIKE (no SQL injection).
- Cursor validated: base64 decode, UUID format, timestamp, task_type allowlist.

### Migration
- `20260804081000_compact_inbox_rpc.sql`: applied to staging Supabase (wrufczusfopgvwvxsmjk).

### Verification
- `npm audit`: 0 vulnerabilities.
- `npm run lint`: clean.
- `npm run typecheck`: clean.
- `npm test`: 343/343 tests passed (54 files).
- `npm run build`: production build succeeded.
- `git diff --check`: no whitespace errors.
- Staging container healthy, endpoints returning 401 (auth enforced).

## [2026-08-04] fix: tighten transitive dependency security overrides

### Added
- `resolutions.fast-uri` block with `fast-uri: 3.1.5` and `$fast-uri: 4.1.2`. This handles both major-version lines so consumers requiring `^3.0.0` and `^4.0.0` get the corresponding fixed version.
- Tighter `glob` override (`^13.0.0`) covering the GHSA-5j98-mcp5-4vw2 command-injection fix.
- Tighter `brace-expansion` override (`5.0.9`) covering the CVE-2026-14257 mitigation bypass fixed in 5.0.9.

### Changed
- `package.json` overrides tightened from `glob: 11.0.0`, `brace-expansion: ^5.0.0` to `glob: ^13.0.0`, `brace-expansion: 5.0.9`.
- `package.json` devDependencies pinned `@types/node` to `22.16.5` and `typescript` to `5.8.3` to match staging baseline and avoid TS 5.9 Buffer type regression with exceljs types.
- `package-lock.json` regenerated to match the override resolution.

### Fixed
- `brace-expansion 4.0.0 - 5.0.8` (CVE-2026-14257 mitigation bypass) — overridden to 5.0.9.
- `fast-uri 3.0.0 - 3.1.4 || 4.0.0 - 4.1.1` (host confusion) — split-resolved to 3.1.5 and 4.1.2.
- `glob 11.0.0 - 11.0.3` (command injection via `-c/--cmd`) — overridden to `^13.0.0`.

### Verification
- `npm audit --audit-level=high`: 0 vulnerabilities (was 3 high).
- `npm run lint`: clean.
- `npm run typecheck`: clean.
- `npm test`: 213/213 tests passed.
- `npm run build`: production build succeeded.
- `npm run test:document-layout`, `npm run test:pgd-pdf`, `npm run test:storage-policy`: 0 failures.
- `npm run test:mrn16-sql`, `npm run test:mrn17-sql`, `npm run test:outbound-replacement-sql`: all passed.
- `git diff --check`: no whitespace errors.

## [2026-08-04] MRN-17: Specific vendor rejection diagnostics for HTTP 422 replacement preflight

### Added
- `server/marison-rejection-diagnosis.mjs`: Vendor diagnosis parser with `specificity: "field" | "area" | "generic"`. NIK masking covers 16-digit and alphanumeric patterns (e.g. "A 114"). `buildSafeContext` extracts roles and unit types without exposing NIK. `comparePayloads` returns summary-only changes. `collectSensitiveValues` extracts `submitted_by` and `approvals[].nik` for sanitization.
- `GET /api/integrations/marison/dispatches/:dispatchId/replacement-preflight`: Read-only endpoint that reads stored vendor response and payload_body, runs diagnosis, builds candidate payload via pure builder, compares changes, validates surat status and signatures. No queue mutation, no status change, no lease, no vendor POST.
- `POST createMarisonOutboundReplacement` now re-runs preflight before RPC to prevent TOCTOU bypass.
- Shared `VendorDiagnosisSpecificity` type in `marison-integration.service.ts`.
- `reasonCode` field in replacement preflight response for stable error classification.
- UI: replacement dialog calls preflight on open, shows specific vendor diagnosis grouped by area (identity, unit_type, project, branch, generic). Generic diagnosis shows "Penolakan vendor belum spesifik" without misleading master-data links.
- UI: contrast fix using `text-foreground`, `bg-muted/60`, `border-border`, `role="status"`, `aria-live="polite"`.
- UI: stale async protection via request sequence counter; response for job A cannot overwrite dialog for job B.
- UI: submit button only active when `preflightState === "ready"` AND `eligible === true` AND reason filled AND not pending AND (SIGAP changed OR Marison fix confirmed).
- UI: Marison fix confirmation checkbox required when `sigapChanged === false`.

### Changed
- `diagnoseVendorRejection`: generic messages no longer default to "identity" area; they return `specificity: "generic"` with summary "Penolakan vendor belum spesifik."
- `buildSafeContext` now accepts `sensitiveValues` parameter for payload sanitization.
- `preflightMarisonOutboundReplacement`: surat null, non-final status, incomplete signatures, and failed candidate payload now return `eligible: false` with stable `reasonCode`.
- `payload_body` null, JSON parse failure, and SHA-256 hash mismatch now report `payloadBodyInvariantViolated: true` and `eligible: false`. No fake `changedAreas` when old payload is invalid.
- Unit type change sentence no longer has stray closing quote.

### Tests
- 31 diagnosis unit tests (masking, specificity, safe context, comparison, sensitive values).
- 16 UI integration tests (NIK diagnosis, unit type diagnosis, no NIK in browser, Marison fix confirmation, invariant violation, blocked preflight no submit, checking state no submit, stale response protection, generic diagnosis no misleading links, replacement creation, conflict handling).
