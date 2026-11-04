# SIGAP Feature and Release Map

## SUR-30 External Addendum Review Preservation (2026-11-04, Issue #791)

- Selective main-based fix for retained30-to3 readiness review blocked at final
  approval after audited external adendum correction. User authorized staging
  then production, no approval or resend. Migration20261104160000 is additive;
  original exact-snapshot validation remains the primary path and rollback target.
- Additional private validation accepts only unchanged project/count/unit/order,
  type/production metadata and verifier identity/time/note, with corrected upper/
  lower monetary fields exactly matching the current resolved external archive.
  Review stage must precede configured approval restart. No history rewrite,
  new external send, fabricated examiner note or automatic final approval.
- Real PostgreSQL17 staging/production shapes pass positive, tamper, stale-event,
  final-signature and ACL checks; applied twice successfully. Deployment pending.
  Rollback restores the original validator body through a new forward migration;
  retained legacy function is private. No data rollback or history deletion.

## SEC-04 Selective Production Promotion (2026-11-04, Issue #782)

- User authorized production after staging acceptance. Main-based candidate
  contains only original SEC-04 commits08f2fa3/a3d0c0c and the main-relevant
  OPS-QG assertion reconciliation; the staging-history merge is excluded.
- Main has seven stale baseline assertions, not the staging-only realtime-flush
  file. Preserve the distinct production documentation hash and all coverage.
- Runtime/API rollout and final proof pending. No production routing, database,
  approval or outbound resend change is part of this release. Latency diagnosis
  remains a separate measurement task; no latency improvement is claimed here.

## SEC-04 Private-Audit Candidate Hardening (2026-11-04, Issue #782)

- The selected candidates were validated with synthetic fixtures and fixed:
  legacy email recipient/HTML context, multipart aggregate cap, inactive
  participant document access, storage-origin ownership, unrestricted push
  endpoints, and production deploy commit binding. New suite 12/12 green after
  the fixes.
- No database migration, ACL sweep, outbound resend, or production data change.
  Deferred candidates need owner confirmation: external-api `trustProxy`,
  generic storage overwrite ownership, stateless cookie revocation,
  active-profile cache and attachment replacement task binding.
- Status: staging candidate pending PR/deploy verification; production not
  released. Rollback is a source revert; no schema rollback required.

## SEC-04 Compatible Runtime Security Patch (2026-11-04, Issue #782)

- Follow-up to user-authorized OPS-17 tests-first maintenance/security review.
  Frozen audit source stays in a separate worktree; remediation starts from main.
- Pin application and external API image stages to Node22.23.4, replacing22.23.1
  and the API floating Node22 tag. Pin Fastify5.12.7 and Nodemailer10.1.4 in the
  relevant workspaces; root lockfile changes only those two installed packages.
- Regression fixtures cover NUL DNS rejection, nested-comment recipient parsing,
  canonical-case header constraints and reviewed image pins. The three behavior
  checks fail under old runtime/dependencies and all4 pass on the candidate.
- No auth-flow, database permission/schema, form identity, approval or outbound
  payload change. No mail/network service is contacted by regression fixtures.
- Full candidate gates and staging verification pending. No production runtime
  upgrade at this checkpoint. Root audit0 high/critical,20 moderate dependency
  records remain; separate documentation dependency review stays in #768.

## REC-06 Recommendation Enabled During Revision (2026-11-04, Issue #773)

- Follow-up20261104100000 restricts allocation to active requests; completed,
  cancelled and rejected archives never acquire new tasks during metadata edits.
  Added forward-only because0900 had already reached staging.
- Canonical input updates create a missing recommendation task for an active
  requester/delegated admin without duplicate numbers/tasks or office grants.
  Parent-row/advisory lock order is consistent with direct task allocation.
- Private, transaction-bound requester submission can restore the exact asking
  step while recommendation work is pending; signature and terminal-status
  approval gates remain enforced. No public trigger-helper execute permission.
- Migration20261104090000 is forward-only and replayable. No historical bulk
  backfill, signature reset, new vendor POST or change to form identities.
- User authorized staging then selective production and narrow recovery of
  001/MBP/03.14-000.3.1/XI/2026. Relevant Vitest38 tests, canonical PostgreSQL
  requester/inbox flow, two factory shapes and concurrent allocation pass.
  Staging schema applied; actual tester RPC/inbox acceptance passed under full
  rollback. Production still pending selected PR, rollout and audited recovery.

## SEC-03 Zod4 Validation Security (2026-11-03, Issue #766)

- 2026-11-03 [Codex] `fix/zod4-validation-security` upgrades root, backend,
  shared and documentation Zod to4.6.7 for GHSA-mrhx-c7xc-m3w5. Staging only;
  no production authorization. No database migration or business resend.
- Retain login normalization/password bytes, BFF defaults/record values,
  HTTP400 field errors, environment defaults and strict outbound contracts.
  Parsed Asset/Unit/Non Unit/Fund fixtures match captured Zod3 JSON hashes.
- Linux lint, typecheck, frontend/backend builds and217 related tests pass.
  Zudoku build passes. Root audit has0 high/critical; documentation still has
  unrelated10 high/2 critical findings requiring a separate dependency review.
- Pending: staging integration including AUTH-09 desktop validators, CI,
  coordinated application/worker rollout and public smoke. This unblocks the
  pre-existing Zod audit failure on KEU routing candidate PR #765, not its release.

## SEC-01 DOMPurify Patch (2026-10-23, Issue #727)

- 2026-10-23 [Codex] Newly published high/critical advisories affect pinned
  DOMPurify3.4.16. Selective patch to3.4.17 is a prerequisite for the authorized
  REC-04/SUR-37 release, not an unrelated dependency refresh.
- Only direct pin/lock and focused sanitizer regression; preserve all other
  dependency versions. Staging first, then selective production after gates.

## MRN-28 Current Payload Candidate (2026-10-22, Issue #711)

- Candidate `codex/latest-payload-preview-20261022` from main, staging first.
- Admin Integration keeps immutable sent payload and explicitly generates current
  JSON through canonical outbound builders with an injected read-only link strategy.
  Shows field changes, timestamp, validation, hash and copy/download actions.
- No dispatch preparation, generation, vendor business POST, token mint or PDF job.
  Existing same-environment capabilities must resolve to canonical approved files;
  missing links/recommendation transport URLs stop generation, never substitute
  internal/public storage URLs or bypass fingerprint checks.
- Unit preview can inspect already-submitted units but cannot issue a replacement
  receipt; existing send/recovery validation remains unchanged. No migration.
- Source 051 addendum repair and MRN-27 are production prerequisites already present.
  Production promotion requires explicit authorization for this addition.
- 2026-10-22 [Codex] Released after explicit user production authorization:
  PR #712/#713/#714, live staging `1008cb9cdb`, production `aec4be43b3`.
  136 focused tests, clean Linux lint/typecheck/build/audit high gate and UI
  desktop/mobile light/dark passed. Protected public acceptance proves corrected
  051 addendum values for both generations, with every source/file/dispatch table
  unchanged; no external resend. Hosted CI billing prevented startup, not a pass.
  Details and current limits are in the dated MRN-28 completion worklog.

## MRN-27 Latest Published External PDF Links (2026-10-22, Issue #704)

- External links follow the same document's approved published main/attachment
  PDF. Preview, email and historical signer links remain pinned; no outbound resend.
- Original capability coordinates and immutable sent body/hash remain evidence.
  Only canonical publications qualify; drafts, revoked/expired links, foreign
  origins/documents and ambiguous replacements never select a newer file.
- Retain previous attachment objects and archive metadata append-only. Atomic
  replacement preserves stable IDs in one-file slots; multi-file replacements
  require unambiguous identity rather than relying on list position.
- Forward migration20261022090000; recommendation resolution retains its canonical
  fingerprint gate. User explicitly authorized staging then selective production.
- Vendor-local downloaded copies still require vendor reload; only SIGAP-hosted
  delivered URLs are controlled here. No real vendor POST in acceptance.
- 2026-10-22 [Codex] Released: PR #705/#706/#707; staging live `5bbacb456b`,
  production live `8768534043`. Migration applied with frozen dispatch/token proof
  in both environments. 100 focused tests, real PostgreSQL, lint/typecheck/build
  passed. Public production 051 main and recap legacy URLs return newer bytes;
  original objects and dispatches unchanged. Hosted CI billing prevented startup,
  not a reported CI pass. See the dated MRN-27 completion in `docs/WORKLOG.md`.

## SUR-36 Unit Addendum Import Amounts (2026-10-21, Issue #700)

### SUR-37 Decimal Item Quantities (2026-10-23, Issue #726)

- 2026-10-23 [Codex] Positive item measurements accept up to six decimal places,
  including values below one. Inputs/drafts/confirmation/recommendation models,
  KEU totals and PDFs must preserve them without digit stripping or integer fallback.
- Building/unit allocation counts and identifiers stay integral. Whole-Rupiah
  extended prices round once per line through exact scaled integer arithmetic;
  KEU10 SQL uses the same rule. No historical business data or payload rewrite.
- Migration20261023120000 replaces only recommendation quantity validation and
  KEU10 normalization, preserving ACLs and unrelated safeguards. Test in real
  PostgreSQL before selected staging then production rollout explicitly authorized.
- Fund serialization preserves decimal quantities. Vendor Asset quantity remains
  integer-only per current external docs; do not round or fabricate outbound values.

- Candidate `codex/unit-addendum-import-20261021` from main, target staging.
- Unit XLSX import rounds numeric values and cached numeric formula results only
  in the Struktur Atas/Bawah columns to whole rupiah before strict parsing.
  Excel's hidden fractions must not silently clear an otherwise visible amount.
- Reject invalid nonempty money and formulas without cached results with a cell
  address before committing any imported allocation state. Keep blanks and zero
  distinct. Other columns, the default employee reader, and the shared strict
  currency parser retain their previous behavior.
- Write/reopen/import/PDF-table regressions cover all six reported amounts and
  totals. No schema, production data, historical attachment, approval or vendor
  outbound change; production release requires explicit authorization.

## MRN-26 Verified Fund Replacement and Manual Receipt (2026-10-21, Issue #648)

- Fund HTTP422 replacements use an explicit admin command with separate vendor-fix,
  nonreceipt (including Postman), and production-send confirmations. No agent replay.
- Verified candidate uses existing active file links, current final PDF, main_document
  and supplemental attachments; only document placement changes, not business fields.
- New generation freezes its validated body/hash at creation. Original job is intact.
  Advisory/row locks, one child, final signatures, document timestamp and acceptance/
  unknown-outcome gates protect against stale submits, double clicks and duplicates.
- Internal manual-receipt RPC matches vendor number/type/amount/items against frozen
  payload and audits the old422 plus human-provided receipt; it does not send.
- User supplied successful Postman receipt for007 (vendor8) and explicitly approved
  recording acceptance, not resending007. Other Fund replacements remain user actions.
- New forward-only migration20261021100000; staging then selective production under
  the ongoing production recovery request. Unit/Asset/NonUnit policy is unchanged.

## MRN-25 Fund Postman Preview Extension (2026-10-21, Issue #648)

- Separate on-demand Postman tab for Fund: main_document contains the verified
  final PDF; attachments retain supplemental files, never a duplicate main PDF.
- Frozen history/hash and business values, including marketing_cost, are unchanged.
- Reuses only existing, active, same-letter capabilities on the configured app
  origin. Stale/missing links, unmatched files or incomplete payload fail closed.
- Admin/current-environment/same-origin/no-store protections remain. No new
  token, vendor call, dispatch, replay or database migration. Manual Postman POST
  is a real send and may duplicate vendor data; verify receipt first.
- User explicitly authorized staging then selective production. Candidate branch
  codex/fund-postman-payload-20261021; runtime acceptance pending.

## MRN-25 Outbound Payload Viewer (2026-10-21, Issue #688)

- Admin-only, on-demand stored JSON viewer per dispatch/generation in Integration.
- Separate from replacement/recovery: reading/copying never sends or rebuilds a
  payload, issues a file token, changes a job, or calls a vendor endpoint.
- Frozen body hash is verified; unsent snapshots and unavailable payload are
  explicitly labelled. Credential fields are masked; business fields remain.
- Same-origin, active admin, current environment, no-store response and zero
  client cache retention. No migration or worker rollout.
- User authorized staging then selective production; implementation in progress.

## OPS-10 Scheduled Maintenance and Cloudflare Fallback (2026-10-19, Issue #642)

- Admin-only schedule: activity, message, start WIB and estimated duration;
  disruption-only mode stays usable, full mode closes automatically at its start.
- Announcement/reminder begins at the preceding calendar day 00:00 WIB. Daily
  suppression is per account/browser/revision; the banner remains. Full mode
  requires explicit admin completion, never an automatic reopen at its estimate.
- Cloudflare Worker and SQLite Durable Object retain announcement/state/audit and
  branded animated fallback independently of the origin. APIs return JSON 503;
  no POST replay or invented outage ETA. Control uses a backend-only Ed25519 key,
  live admin authorization, same-origin checks and optimistic revision guards.
- Staging-only implementation/acceptance; production remains unchanged pending
  user acceptance and selective release alongside DASH-03. No database migration
  or worker stop/rollout. Maintenance is not a database migration write freeze.
- Runbook: [OPS_10_SCHEDULED_MAINTENANCE.md](OPS_10_SCHEDULED_MAINTENANCE.md).
- Acceptance follow-up: full schedules navigate open dashboards (also admin)
  to the canonical edge page, identical to refresh and independent of origin
  restarts. Exact recovery/configuration routes remain reachable; completed
  schedules exit safely. Disruption schedules never force navigation.

- Production promotion explicitly authorized on 2026-10-19 after staging
  transition/restart acceptance, together with DASH-03. Provision independent
  production key, hostname and state; do not activate a test production schedule.

## DASH-03 Actionable Role Dashboard (2026-10-19, Issue #638)

- Staging candidate from main; production is not authorized for this new feature.
  Removes legacy Agenda counters/charts/filter from the dashboard only; preserves
  old Agenda data/API and the separate current Work Calendar summary/clock.
- Requester, assigned signer and organization tabs use one bounded server-side
  summary/page RPC, not full client-side document or profile downloads. Real
  signer assignments default to the signer tab; requester auto-signature is not
  counted as signer work. Active queues are all-time; terminal history uses the
  selected completion/decision month, with explicit WIB boundaries.
- Ready, prerequisite-blocked and upcoming assignments are distinct. Upcoming
  stages have no SLA clock. The canonical business-minutes calculator and the
  responsible department configuration measure current/finished stages; requester
  revision pauses approval SLA. Percentages include the measured denominator.
- All members monitor their own Pusat department or exact KCP office. KC members
  additionally monitor descendant KCP offices from the current master hierarchy;
  cycle-safe traversal and reparenting apply dynamically. Detail/attachment read
  uses the same predicate without recursive RLS. Approval/write permissions,
  selected issuing-office grants, parent numbers and signers are not changed.
- Explicit reminders resolve active recipient/context server-side and create
  existing SIGAP notifications, serialized/debounced for six hours across team
  members. No arbitrary recipient, self-reminder, terminal/prerequisite-blocked
  reminder, approval or external dispatch. Production reminders are not tested.
- Existing realtime flush invalidates the new actor-bound query on document,
  signature, attachment, recommendation and revision events. Background refresh
  preserves data; failed loads show an error rather than misleading zero counts.
- Forward migration `20261019090000`; focused real PostgreSQL scope/RLS/clock/
  queue/notification tests plus UI/service/navigation and responsive visual tests
  precede stage-only apply/deploy. No worker, external or production rollout.
- Follow-up `20261019091000` qualifies the SQL `current_role` column for stage
  labels/search; the first browser acceptance exposed collision with PostgreSQL's
  CURRENT_ROLE keyword. The already-applied initial migration is not edited.

- Production promotion explicitly authorized on 2026-10-19 after staging
  acceptance, together with OPS-10. Apply only the two named migrations after
  catalog/ledger preflight; production acceptance does not send test reminders.

## MRN-24 Vendor Main Document Schema Diagnosis (2026-10-19, Issue #648)

- Read-only production evidence identifies missing `main_document` columns in
  Marison's Fund, Unit and Asset tables (`SQLSTATE[42703]`). Its published API
  still accepts this URI field. Removing it is not a fix: the older Asset job
  lacks the field but receives the same vendor database error.
- Admin outbox lists expose only a constant, sanitized diagnosis from the last
  failed response, never raw SQL, connection details, payloads or document URLs.
  "Periksa penolakan" performs existing read-only preflight; it does not resend.
- Historical failure is not evidence of current vendor readiness. Digivasi must
  confirm the schema correction and receipt status before separately authorized
  recovery. Immutable payload/hash, receipt and replacement gates stay intact.
- App-only staging then selective production release is approved. No migration,
  worker rollout, business POST, replacement generation or job mutation is in
  scope. DASH-03 and OPS-10 remain staging-only pending user acceptance.
- Vendor handoff: `docs/contracts/marison/vendor-main-document-schema-20261019.md`.

## SUR-33 Internal Recommendation Number Office (2026-10-16, Issue #633)

- Asset requests from KC/KCP retain their issuing office, number and signers.
  Automatic recommendation tasks may reserve their configured Pusat number
  without granting the requester Pusat or another office's submission access.
- Forward migration `20261016090000` gives the validated canonical factory a
  private one-use reservation capability bound to transaction, connection, actor,
  row ID and exact number context. The existing issuing-office trigger consumes
  it; ordinary inserts, locked-office updates and requester ownership remain
  guarded. No public endpoint, role/grant expansion or hierarchy rewrite.
- Follow-up `20261016091000` requires an active, non-deleted actor when consuming
  the capability, including direct RPC attempts with an old authenticated session.
  Both migrations are required for release; the first was already applied to
  staging before this additional abuse-case test, so it is not edited in place.
- Nullable represented-by-admin ownership checks fail closed. Existing task
  idempotency and advisory-lock numbering remain canonical; a later failure
  rolls back parent, reservation, task and temporary capability together.
- Production's live factory exactly matches `20260721183000`, while staging
  matches `20260812135500`; do not assume environment parity from repository SQL.
  The new migration recognizes only those audited body hashes and normalizes
  the July allocation forward. Never repair the ledger or replay old migrations.
- Focused real PostgreSQL tests reproduce the original failure, then exercise
  non-superuser routine ownership, mixed migration ownership, unauthorized
  direct inserts, private ACLs, replay, rollback and concurrent allocation.
- Release staging first, then explicitly authorized selective production with
  exact migration ledger/function checks. Production acceptance is read-only:
  do not submit the user's preserved draft or trigger approval/outbound.
- KCP Pati currently belongs to KC Jepara, confirmed by the user on 2026-10-16;
  this supersedes the earlier KC Batang instruction. No office data is changed.

## SUR-32 Compact Unit Examination PDF (2026-10-15, Issue #626)

- Supersedes SUR-30's dedicated Unit examination appendix presentation only.
  The main quantity shows original requested count struck through beside the
  latest matching ready count; equal or unexamined requests are not crossed out.
- A unique explicit matching quantity in the item name (e.g. "Rumah 30 Unit")
  also shows the old number struck beside the ready count. Do not rewrite saved
  names, kavling codes, type dimensions, ambiguous phrases or unrelated numbers.
- Named, dated examiner notes and requested/ready/outstanding counts occupy a
  separate box left of the signatures, never the requester's Catatan. Long notes
  flow onto following pages without clipping or splitting the signature block.
- The form header references the real final PDF page count, not "Lihat footer".
  Other requester/signer revision appendices remain; immutable examination audit,
  stored request, historical source/signer cutoffs and outbound are unchanged.
- App/PDF worker rollout is coordinated staging first, then selective production
  after native renderer, historical snapshot, overflow and visual acceptance.
  Existing published files require controlled regeneration, not approval/replay.

## SUR-31 Unit Allocation XLSX Text (2026-10-15, Issue #622)

- Tipe Unit and Desain are literal string cells, not `{text: ...}` objects
  serialized as JSON. Preserve external type punctuation (`30/53`, `60/72`)
  and leading zeros, and explicitly format both columns as text (`@`).
- Keep nine-column layout, filter, validations, amounts, dates and production
  serial behavior unchanged. Formula-looking external values remain strings,
  not executable spreadsheet formulas. Existing files are not rewritten and
  external unit references remain authoritative during approval/outbound.
- Real XLSX write/reopen and importer round-trip regressions precede staging
  acceptance and explicitly approved selective production release. No schema,
  API, worker, outbound replay or saved allocation change. Excel's mismatched
  paste-selection error is separate from this exported-cell defect.

## CAL-09 Multiline Result Preview (2026-10-15, Issue #618)

- Calendar result presentation preserves line breaks, spacing, numbered lists
  and dash bullets. Plain-text values remain unchanged in storage and editing;
  React escapes content, with no HTML/Markdown execution or new dependency.
- Shared day/week/search rows limit the result preview to three lines with a CSS
  ellipsis and safe long-word wrapping. Clicking the preview opens the same full
  detail as the title, including read-only team entries; full detail is not clamped.
- Presentation only: no database, status, API, PDF worker or authorization change.
  Focused row/detail/editor tests and desktop/mobile visual checks precede staging
  deployment. Production is unchanged unless explicitly requested for this fix.

## SUR-30 Partial Unit Readiness (2026-10-15, Issue #612)

- Marketing's original requested count remains unchanged. Planning may select
  between one and the requested number of ready units; partial readiness requires
  a meaningful examiner note. Only selected units continue through approval and
  outbound; outstanding units do not generate another submission automatically.
- Forward migration `20261015130000` adds participant-RLS protected immutable
  examiner history: original count/project, selected units, outstanding count,
  actual actor ID/name snapshot, server timestamp and reason. Every examination
  round is retained. Existing drafts, approvals and frozen outbound jobs are not
  backfilled or rewritten. Legacy completed allocations remain compatible.
- The canonical verification RPC still owns authorization and atomic writes.
  New trigger guards capture its result, reject zero/excess/duplicate units and
  missing partial reasons, and require a matching review receipt at completion.
  Optional legacy reallocation equality gates are patched only where present;
  production does not have the same legacy wrapper/trigger shape as staging.
- Detail/confirmation and approval inbox show named examination evidence; PDF
  places it on separate appendix pages. Historical signer/source cutoffs remain
  enforced. Existing signature events drive the history query invalidation, without
  a new realtime publication, public RPC, endpoint or expanded signing authority.
- App and PDF worker rollout must be coordinated after selected migration apply.
  Focused UI/service/native PDF and both real PostgreSQL schema shapes precede
  staging acceptance and explicitly approved selective production release.
  Asset replacement preflight screenshot is a separate Issue #604 follow-up;
  no real production retry/replacement is authorized by the Unit feature.

## MRN-23 Separate Main Document (2026-10-15, Issue #604)

### Asset Replacement Diagnosis Follow-Up

- Read-only admin preflight now returns a sanitized vendor diagnosis for terminal
  HTTP 422 Asset/Fund/Non Unit jobs in production. It explicitly reports that
  replacement for those kinds is unsupported, rather than throwing a generic
  preflight error that hides the cause.
- This does not enable replay: production replacement creation remains limited
  to the existing verified Unit path. Environment/admin/terminal-state gates,
  Unit receipts and database protections remain unchanged. No vendor POST, old
  payload rewrite, new generation or infrastructure change is part of diagnosis.
- Queue UI explains the block and does not imply that a new generation exists.
  SQL exception details are replaced with a safe database-error explanation;
  connection names, raw SQL and embedded private values are never diagnosis text.
  Vendor-side schema readiness and an explicitly approved duplicate-safe recovery
  path remain separate work. Stage-first selective production promotion follows
  focused handler/UI tests, lint, typecheck and builds.

- Vendor docs now publish optional top-level `main_document` as a URI string on
  Asset, Unit, Non Unit and Fund. Fresh SIGAP payloads include the canonical final
  parent PDF there; missing final PDF/link fails closed before vendor POST.
- Supplemental requester/examiner attachments remain name/link objects; Asset
  keeps them at item level alongside its recommendation PDF. PGD Dana, KEU 1
  and KEU 10 retain Fund types, totals, approvals and project/office resolution.
- Deduplicate by storage origin/bucket/path; do not duplicate the main PDF in
  attachment arrays or substitute the first attachment. Redact document bearer
  links in diagnostics. Existing file-view authorization remains unchanged.
- Contract versions advance for fresh payloads; old frozen jobs/hashes retain
  their original optional-field compatibility. No replay, new public endpoint,
  schema/RLS or worker source change. Vendor schema readiness is a separate gate.
- Focused contract, document-bundle, mapper and native PDF readiness tests precede
  staging acceptance and explicitly authorized selective production promotion.
- Evidence: `docs/contracts/marison/main-document-20261015.md`. Issue #604's
  already-POSTed Asset generation is not automatically replaced or retried.

## SUR-29 Draft and Number Reservation Lifecycle (2026-10-14, Issue #596)

- Issue #608 corrects mixed-owner self-hosted execution: existing office guard
  runs as non-superuser `postgres`, but the private recommendation helper was
  created by `supabase_admin`. Migration `20261015110000` grants only the trusted
  `postgres` definer EXECUTE on that helper; API roles remain denied. No function
  body, office/task validation, RLS, document, reservation or owner is rewritten.
  The PostgreSQL regression first reproduces the exact permission error, then
  creates/saves an ordinary draft as authenticated with a non-superuser definer,
  tests legitimate USED-number recommendations and rejects forged office/task/
  actor contexts. Staging-first promotion includes rollback-only live draft tests;
  production acceptance is read-only, without allocating or submitting a number.
- Production expiry cron cancelled numbers while autosave extended only the draft.
  Forward migration `20261014180000` shares a server-controlled seven-day lease
  on ordinary draft saves and protects valid drafts from that existing cron.
- Truly expired ordinary drafts become EXPIRED when their reservation is cancelled;
  legacy DRAFT/CANCELLED rows are closed without deleting payloads or attachments.
  Used numbers, revision drafts and submitted documents remain unchanged.
- Corrective migration `20261014181000` preserves canonical recommendation-task
  drafts that intentionally use existing USED numbers. Task, parent, owner,
  reservation, number, claimed state and candidate access must all match;
  a client label cannot create an exception. No USED number is changed.
- `20261014182000` aligns the existing issuing-office trigger with that canonical
  task authorization. Office identity and authenticated candidate must still match.
  Actual staging claim/save and forged-context checks run in a full rollback.
- Owner/admin cancellation can clear stale DRAFT/EXPIRED records without reviving
  a number or resetting its reuse window. Pending-number cancellation retains the
  configured reuse policy and audit. No new public RPC/HTTP endpoint or grant.
- Disposable PostgreSQL and focused draft UI tests precede staging acceptance
  and explicitly requested selective production release.

## CAL-08 Completion Uses Saved Results (2026-10-14, Issue #592)

- Detail quick actions and list status prompts default completion text to the
  existing saved realization. Users may retain or edit it; absent/blank results
  still require input. Cancellation never saves a discarded edit.
- Row prompts initialize once per entry/prompt opening so realtime refetches
  cannot replace unsaved typing. Reopening reads the latest persisted result.
- No schema, authorization, worker or business data rewrite. Focused UI tests,
  lint, typecheck and build precede staging-first selective release.

## DOC-13 Named and Detailed Revision Evidence (2026-10-14, Issue #585)

- Display actual requesting actor from the document-scoped revision event,
  separate from the requester who submitted corrections. Prefer recorded
  participant names for PDFs; missing legacy names are not guessed from a step.
- Detail/confirmation shows before/after names, quantity, status, financial and
  other persisted form fields, plus added/deleted item values and attachments.
  Requester revision histories are read through existing participant RLS;
  no endpoint, grant, schema or write authority is added.
- PDF evidence stays in the separate revision appendix. Enrichment is in-memory,
  historical source/time cutoffs remain, and document/signature snapshots are not
  rewritten. Old files remain valid; stored PDF bytes are not silently replaced.
- Selected release is staging first then production, as explicitly approved.
  Worker rollout is coordinated with app rollout; do not requeue every old job
  or trigger a vendor POST to test the presentation change.

## DOC-12 Interactive PDF Queue Latency (2026-10-14, Issue #584)

- Production first-open jobs spent 4.803-14.912 seconds waiting for a worker,
  while actual render/upload took 0.481-0.814 seconds in four measured jobs.
  Existing ready PDFs use the cached path. No current queue backlog or fresh
  worker failure was found; old failed jobs are not blindly requeued.
- Default idle poll cap becomes 5000 ms in the worker and standalone compose,
  matching the already running staging configuration. Base remains 2000 ms,
  bounded idle backoff and operator overrides remain intact.
- No new schema, RPC, approval, document content or vendor request. Runtime
  configuration must be checked separately: an explicit old 30000 ms setting
  overrides the corrected default. Only the PDF worker is reconfigured after
  its active jobs drain; other services and images are preserved.
- This bounds the idle detection delay, not total PDF time under arbitrary
  load. Existing prepared files, historical approvals and snapshots remain intact.

## OPS-12 Full Proxmox Production Migration (2026-10-14, Issue #573)

- User selected total production migration, including self-hosted Database/Auth
  on new CT 110 and existing MinIO storage VM 100. Staging/shared Ubuntu services
  are excluded. Production connection-password rotation was explicitly authorized;
  application user passwords remain unchanged.
- Final cutover completed on 2026-10-14: app/PDF/sync/outbound/external API/tunnel
  on CT 104; Database/Auth/REST/Realtime on CT 110; Storage API and existing MinIO
  on VM 100. Ubuntu production replicas/workers/connectors are stopped with
  restart disabled. Cloud production data is retained for rollback, not live.
- Final restore verified 99 Cloud Auth/application/history table counts, 376
  account password hashes, 226 migration rows, publication, 150 policies, 264
  functions, 78 relation ACLs, schema/default/column ACLs and both Auth triggers.
  Six managed Storage tables are destination-owned; copied metadata is retained.
- All 173 source-available referenced files (51,452,583 bytes) were copied and
  downloaded again with matching hashes. Final frozen-source reread changed zero
  files. All 35 current attachments and six canonical PDFs were available. The
  562 missing historical references already lacked files at source; this migration
  does not claim to reconstruct them. Saved URLs/snapshots are not rewritten.
- Independent maintenance surface returns HTML/JSON 503 with no-store,
  Retry-After and security headers. Local desktop/mobile preview and targeted
  HTTP tests; animated production maintenance was enabled during cutover and
  removed after read-only acceptance. Production root/health/external return 200.
- Runtime release SHA `91e6c3be05664f63c8481aa7b9d9c6166542f5f0`; live staging
  `da990cae26f8f6b051eb18e664bf04bafba75503`. Inbox, attention, monitoring,
  calendar, SSE ready/profiles denial, existing PDF link and external client
  credentials passed. Actual password login/two-user mutation E2E was not run.
- Production DB operations now use the authorized Proxmox operator and CT 110,
  not legacy Cloud Management helpers/MCP project `xuhyodtmgwteyslhrkfx`.
  Deployment uses the dedicated Proxmox runner; worker configuration preserves
  verified private TLS for outbound. Details and rollback constraints are in
  `docs/PRODUCTION_PROXMOX_TOTAL_MIGRATION.md`.

## MRN-18 Complete Attachment Arrays (2026-10-14, Issue #572)

- Fresh outbound Asset jobs retain main/requester/examiner documents alongside
  the canonical recommendation PDF. Vendor Asset schema uses `items[].attachments`
  with name/link objects, not an invented top-level attachments field.
- Unit, Non Unit and Fund contracts already use top-level attachment object
  arrays. File access links and deep-frozen dispatch history remain unchanged.
- Mapper and runtime regressions verify recommended asset requests no longer
  discard request attachments. Old frozen jobs are not rewritten or resent.
- Forward migration `20261014100000` adds a service-only verified Unit replacement
  RPC and permits production entries in the existing replacement audit. Production
  requires explicit confirmation, active admin, final signatures, frozen hash,
  fresh matching unit identities/type and explicit unsubmitted vendor flags.
- Worker preparation rechecks production replacement references. Other production
  categories remain blocked; historical payloads are not modified or requeued.
  Native PostgreSQL and targeted UI/helper tests precede staging-first rollout.
  Production runtime `5828a40b1c07e3b01915e2a61aa2d3e860d5d498` and staging
  `fffa555912a1c5eddeb762db0d5bfc7196a9caae` verified on 2026-10-14;
  migration applied in both. Panusupan replacement succeeded on one attempt
  with API type 30, preserving the old rejected generation unchanged.

## DOC-11 Revision Appendix / MRN-17 Pre-POST Recovery (2026-10-13, Issue #568)

- Candidate `fix/revision-appendix-external-20261013` from production main,
  selected for staging then production. Depends on DOC-10 readiness and queue
  correction (#563), including already verified migration `20261013150000`.
- PGD, KEU 1, KEU 10 and recommendation renderers append revision evidence on
  separate pages after the original form. Canonical requester snapshots show
  before/after values, additions/removals and attachment metadata. Legacy reasons
  remain visible without inventing missing historical values or exposing file links.
- PDF worker reads revision history only for the matching document/signature
  source; frozen KEU 10 decisions and previous signer cutoff remain authoritative.
- Fund approval maps Supervisor/SPV to the existing vendor staff role while
  retaining manager/director priority and fail-closed unknown role handling.
- Production outbound worker still targets the old Ubuntu application. The
  coordinated operator rollout must persist its internal URL to Proxmox primary,
  pin its existing image, preserve credentials and keep a single worker instance.
- User authorized recovery of exactly three terminal jobs proven never POSTed.
  Canonical reconciliation and its audit trail must be used after release. The
  already POSTed SPK Unit HTTP 422 job is excluded: its frozen type 3052 differs
  from the current external reference type 30; no replacement/resend is implied.
- No new migration, public endpoint, schema/RLS or approval mutation. Changed
  tests, native PDF visual verification and exact runtime ancestry are release gates.

## REC-03 / DOC-05 / SUR-05 Approval Document Consistency (2026-10-13, Issue #563)

- Forward-only `20261013150000` excludes only `parent_workbook_source` from
  recommendation readiness/publication comparison. Finished canonical PDFs remain
  ready after parent signatures rotate that pointer, without viewer-triggered jobs.
- Child source, child/parent input, attachment references present in the existing
  payload, stored fingerprint, storage coordinates and publication lease remain
  guarded. Keep environment-specific render payloads and publisher behavior;
  do not replay missing historical migrations or rewrite recommendations.
- Compact approval cards read flat number/title/requester/department/category
  fields, with legacy detail fallback; no per-card detail fan-out or ACL change.
- PGD revision PDFs reserve room for notes, retain every populated item (including
  rows beyond 15), and keep the complete dated signature block together. Pending
  signers stay blank; rejection/approval history is not changed. Actual page counts
  appear in the footer. App and PDF worker require coordinated staging-first rollout.
- PostgreSQL reproduces production drift, verifies pointer-only changes, parent
  gate/publication, real content rejection, privileges and migration replay. UI and
  native renderer regressions precede live evidence on Issue #563. Production
  approvals/content are not modified for acceptance.

## CAL-03 Provisional Result Persistence (2026-10-13, Issue #559)

- Preserve `realization` for planned, in-progress, blocked and reopened tasks;
  explicit empty input still clears it. Completion still requires a result.
- Forward-only migration `20261013130000_work_calendar_preserve_partial_results`
  replaces only the before-change trigger. No stored-row rewrite, event type,
  RLS/ACL, timing, owner, lifecycle or notification change.
- Detail saves/refreshes retain provisional results. Historical PDF continues
  to use recorded completion results, never the later current-row result;
  provisional per-day result history is not invented or backfilled.
- PostgreSQL owner/foreign/anon, optimistic concurrency, normalization, length,
  completion/reopen, immutable fields, delete and migration replay tests.
  Staging then selective production authorized; live evidence belongs to #559.

## ADM-01 / ADM-02 Organization Reference Contract (2026-10-13, Issue #555)

- Native admin-user validation selects only canonical master columns:
  departments `id,name`; offices `id,name,kedudukan`. Neither master has an
  `is_active` column in staging or production; no activity field is invented.
- User/parent active and deletion checks, admin/same-origin authorization,
  organization pairing and automatic branch reporting remain unchanged.
- App-only correction with real Supabase adapter contract regression tests;
  no migration, permissions or employee supervisor changes. Staging then
  selective production authorized; deployment evidence belongs to #555.

## ADM-01 / AUTH-08 Profile Office Embedding Correction (2026-10-13, Issue #551)

- Pin profile-office embeddings to `profiles_office_id_new_fkey`, the employee's
  primary office, rather than the implicit many-to-many delegated-office relation.
  Directory, subordinate, admin and profile readers retain the same response key.
- Directory read failures reject instead of becoming successful empty lists.
  Admin shows a retryable error, unknown initial counters and retained last-good
  rows on background failure. Actual empty collections remain a separate state.
- App-only correction; no migration, RLS, grant, profile or worker mutation.
  Staging-first, selective production authorized; live evidence belongs to #551.

## AUTH-08 / SUR-25 Delegated Issuing Office (2026-10-12, Issue #539)

- Candidate `feature/delegated-submission-office-01` from main `594c81f`;
  target staging only. No production grant or rollout authorized for this feature.
- Admin-only `/admin/configuration/access` manages explicit per-user office grants
  for `submission.issue_for_office`. No admin role, signing authority, general
  configuration access or office-wide document visibility is granted implicitly.
- Employee primary office and department remain unchanged. The selected issuing
  office drives projects, numbering, office snapshots and canonical signer candidates.
  KC sees its descendant external projects; KCP sees only its own. A KC grant does
  not permit issuing as descendant KCPs; those require their own explicit grants.
- Selection precedes form/project/number; changing office clears dependent input.
  After reservation the office is immutable. Draft RPC lookup includes office,
  project and supplied entity/type to avoid cross-office numeric-counter ambiguity.
- Forward migration `20261012140000`: RLS-protected grants, append-only grant/revoke
  audit, canonical allocator/core guards and draft/document/reservation validation.
  Revocation blocks new allocation/draft save/submission, not historical approval
  or PDF background updates. No change to employee profiles or old document numbers.
- Source verification includes disposable PostgreSQL authorization, scope,
  revocation, immutable office, equal counter numbers across offices and audit/RLS;
  UI/service tests cover grant races and context. Live evidence belongs to Issue #539.

## MRN-13 External-only Active Projects (2026-10-09, Issue #521)

- `fix/external-project-source-only-01` from main; staging first, selective production.
- Active registration/admin/counter catalogs contain only API-synced external projects,
  fully paginated and never enriched from a local-only source record.
- Local-only projects are retired, not physically deleted: production has a historical
  letter FK whose ON DELETE SET NULL would destroy its reference. Documents, reservations,
  counters and snapshots retain their old IDs. New number/registration/counter selections
  reject retired projects in PostgreSQL, including direct browser bypass and reuse claims.
- Manual identity creation/deletion/editing is prohibited, including authenticated admins.
  Only SIGAP accounting entity assignment remains editable under existing admin RLS.
- API synchronization matches by external ID only, not legacy name/code. Existing project
  identity/collision handling and external full-collection pagination remain canonical.
- Migration `20261009160000` requires coordinated deployment. Verify the HTTP sync
  scheduler targets the updated application (production primary: Proxmox LXC104),
  rather than the old Ubuntu rollback app; its scheduler code itself is unchanged.
  Office ownership is NOT widened: an external project under KC Solo is not silently moved
  to KCP Karanganyar. No guessed mapping, vendor submission or historical renumbering.

## REC-03 / DOC-05 In-Progress Recommendation PDF (2026-10-12, Issue #534)

- `hotfix/recommendation-preview-pdf-01` from main; staging before production.
- Generic recommendation preview jobs resolve the existing source-bound canonical
  snapshot when PGD/KEU renderers do not match; no guessed template or content.
- Only fingerprinted final recommendation jobs use canonical publication.
  Preview completion does not advance approval, finalize the recommendation or
  satisfy outbound readiness. Missing/stale source remains fail-closed.
- No migration or endpoint change. App image and PDF worker require a coordinated
  rollout; never restart a worker with a live PDF lease or restart sync/outbound.

## CAL-04 Historical Daily PDF (2026-10-12, Issue #528)

- Candidate `fix/work-calendar-daily-pdf-01` from main; initial release to staging.
- Each date gets a canonical lifecycle projection through that day's exclusive
  midnight cutoff (or download time for today). Later completion, reopening and
  results never replace the historical day's state. Week/month exports repeat
  the same task per visible report date without duplicating stored tasks.
- Start, finish and duration belong only to the report day; completion stays
  blank unless actually completed that day. Office hours, holidays, lunch and
  blocked/planned pauses retain the existing timing contract.
- Missing or incomplete history is explicitly unknown, not the latest status.
  Status filters run after daily projection; history reads remain own/RLS-bound,
  fully paginated, bounded to four concurrent reads and cancellable.
- PDF has a separated title/owner/job header, zero-padded Indonesian dates,
  lighter table and per-page footer; no visible Asia/Jakarta label.
- No migration, new endpoint, worker change or business mutation. Production
  unchanged until an explicitly authorized selective release.

## MRN-21 / SUR-03 Dana Umum Cabang (2026-10-09, Issue #517)

- Correction for branch/KCP PGD Fund: `Tanpa Proyek (Dana Umum)` is an explicit
  supported choice at number allocation and registration, not an Asset exception.
- `generate_fund_branch_letter_number` verifies the active PGD Fund usage,
  requester, office, department and letter type server-side. Immutable scope
  `branch_fund_general` shares the existing office/year counter and lock with
  other project-free branch forms; admin reuse windows and audit remain intact.
- New project-free numbers omit the project segment, including `-000`; KCP
  retains its parent-office code. Project-selected PGD, KEU 1/10, SPK and historic
  numbers are unchanged. Reservation and registration guards prevent scope swaps,
  conflicting project flags and direct browser reservation insertion.
- Forward migration `20261009140000_branch_fund_without_project_numbering.sql`.
  Source verification: affected service/UI tests and real PostgreSQL allocator,
  draft, cancellation/reuse, submit, authorization and concurrent allocation.
  Live deployment/acceptance evidence is recorded on Issue #517, separately from
  source tests. Production rollout requires staging-first runtime ancestry.

## SUR-24 / SUR-17 / MRN-12 / NTF-02 Released Issue #509 (2026-10-09)

- Runtime aplikasi terverifikasi setelah PR #511: production `080b02f721`, staging
  `b0994ef9`. Production berjalan di Proxmox LXC 104; worker PDF/sync/outbound
  tetap Ubuntu tanpa restart. Main menjadi ancestor source dan runtime staging.
- Migration `20261009090000`, `20261009093000`, `20261009113000` diterapkan dan
  diverifikasi di kedua environment; publication 12 tabel public tanpa `profiles`.
  Fingerprint 13 tabel bisnis tetap; tidak ada surat/approval/vendor POST production
  yang dibuat untuk acceptance. Bukti lengkap: Issue #509 dan PR #511.
- CI pada feature head `f24fd62` dan merge main `080b02f721` SUCCESS; changed tests,
  lint/typecheck/build serta integration PostgreSQL lulus. Browser staging membuktikan
  RAB opsional dan checkbox tidak menyembunyikan upload; draft uji dibatalkan.
  Production dashboard/monitoring dan bundle baru terverifikasi read-only.
- Batas acceptance: uji dua akun/burst live belum dijalankan. Jangan menganggap
  regression test sebagai bukti approval dua sesi atau pengiriman vendor live.
  Probe Ubuntu mengalami koneksi Cloudflare lambat; probe Windows root/ready
  sekitar 0,45 detik. Guard penomoran Dana Cabang tanpa proyek ditindaklanjuti #517.

Acceptance browser menemukan label dinamis `Manager Terkait` pada Dana. Label
ini memakai RAB opsional yang sama tanpa mengasumsikan HRD atau Perencanaan;
migration forward-only `20261009113000_fund_rab_generic_manager.sql` melengkapi
  dua migration awal, tidak mengubah file yang sudah applied ke staging.

- Branch `fix/fund-review-realtime-release-01`, basis production `main` `019d243`.
  Pengguna memilih rilis production setelah pengujian staging. Source dirilis
  selektif melalui PR #511; seluruh staging tidak dibawa ke production.
- SUR-24 (ID baru, revisi kebutuhan 2026-10-09): lampiran RAB opsional pada Dana
  HRD dan Perencanaan; tidak ada kewajiban upload atau guard waiver checkbox.
  Tim Perencanaan boleh melampirkan RAB jika pemohon belum melampirkannya.
  HRD dapat meminta RAB/perbaikan redaksi melalui alur canonical
  `Minta Perbaikan Pemohon`, bukan otomatis menolak atau memblokir karena RAB kosong.
  Checkbox `Tidak memerlukan RAB` (`rab_not_required`) hanya menyatakan maksud
  pengecualian, misalnya servis AC/kendaraan; tidak menghapus file yang sudah ada.
  Pilihan jenis biaya PGD Dana tidak berubah; KEU 1/KEU 10 tetap tidak terpengaruh.
- SUR-17: tim pemeriksa opt-in dimulai dengan nol orang terpilih. Admin memilih
  orang yang tepat per kegunaan dan tahap; tidak otomatis memilih seluruh kandidat
  atau menetapkan Usman/Tri hanya karena tersedia.
- MRN-12: revisi Unit eksternal membuka proyek hanya untuk pemilik revisi yang
  masih terbuka; identitas/nomor surat tidak berubah. Pilihan proyek memuat ulang
  kapasitas terbaru dan mengosongkan alokasi lama agar diperiksa ulang.
- MRN-12: tabel privat baru `unit_revision_availability_receipts`
  menyimpan receipt kapasitas berumur pendek dari lookup external terbaru oleh
  backend; bukan kapasitas dari browser. Server memeriksa pemilik, revisi eksternal
  terbuka, draft aktif, proyek/kode dan jumlah yang cocok, kapasitas cukup, masa
  berlaku serta receipt belum dipakai. Receipt dikonsumsi sekali dalam transaksi
  pengiriman revisi; receipt basi, tidak cocok atau replay ditolak. Akses tabel
  langsung browser ditutup. Receipt diuji melalui PostgreSQL nyata; submit revisi
  dokumen production tidak dilakukan untuk acceptance.
- AUTH-01: placeholder login generik `nama@perusahaan.com` dan
  `Masukkan password Anda`; autentikasi dan kredensial tidak diubah.
- NTF-02: `RealtimeSync` menangani refresh query termasuk `surat-inbox-compact`,
  `surat-inbox-kpi` dan `surat-inbox-detail`. Listener Inbox hanya mengatur cursor
  dan toast, tanpa refetch duplikat; event revisi/rekomendasi juga mereset cursor.
  Regresi event-only lulus; uji dua sesi lintas akun live tetap belum dibuktikan.
- ORG-01, SUR-22/SUR-23/ADM-01, kebijakan penomoran SUR-03B dan Kalender Kerja
  adalah baseline rilis sebelumnya, bukan fitur baru kandidat #509.

## Snapshot Rilis Terverifikasi dari Handoff (2026-10-09)

| Area | Production | Staging |
| --- | --- | --- |
| Snapshot rilis sebelum #509 | `main` `019d243` | `staging` `075fb545` |
| Aplikasi | Proxmox LXC 104; Ubuntu lama hanya rollback | Environment staging terpisah |
| Worker PDF/sync/outbound | Tetap Ubuntu | Worker staging terpisah |
| Supabase project | `xuhyodtmgwteyslhrkfx` | `wrufczusfopgvwvxsmjk` |

Snapshot ini berasal dari handoff pengguna, bukan audit runtime baru oleh subtask.
ORG-01 serta SUR-22/SUR-23/admin reset sudah dirilis (PR #497 dan #507).
Catatan kandidat lama di bawah merupakan riwayat pengembangan bertanggal;
status baseline di atas menggantikan klaim lama yang belum diperbarui.

## ORG-01 Dynamic Branch Reporting (2026-10-08, Issue #499)

- Released baseline (handoff 2026-10-09, PR #497/#507); branch
  `fix/dynamic-office-reporting-01` initially targeted staging.
- Branch/KCP employees follow active officer priority BM > Assistant BM > SPV.
  Equal-rank officers never report to one another; unique SPV may supervise the
  office, while multiple SPVs require a unique department match. KCP first uses
  related KC BM, then own-office lower officers or the related KC fallback.
  Canonical `profiles.parent_id` is recalculated on profile or office topology writes,
  including transfers, BM replacement and deactivation; sync cannot restore a stale ID.
- Missing/ambiguous officers or broken/cyclic ancestry clear the relationship fail-closed.
  HQ, BM and director configured relationships remain unchanged. Leaving a branch
  clears its old automatic BM relation rather than carrying it into headquarters.
- Forward migrations `20261008140000` and `20261008150000` audit parent changes
  in an admin-only table and preserve configured Kost supervisor/director relations.
  Existing hierarchy/RLS/calendar consumers use the canonical parent, with no new
  public endpoint or realtime publication. Historical documents/signatures stay intact.
- Historical release gates: real PostgreSQL and changed UI/admin tests before
  staging acceptance; no manual per-user production patch.
- Forward migration `20261008160000` adds officer fallback and department-sensitive
  refresh. Ambiguous cross-department SPVs do not become arbitrary reporting parents.
- Forward migration `20261008170000` separates contextual maker from branch review:
  maker offers requester, local SPVs and department Assistant Managers, not another BM.
  Normal branch BM stages use related KC BM > Assistant BM > SPV, matching department
  first; unmatched departments may choose among SPVs. Strict KEU 10 BM makers and
  configured UJI STAGING tester workflows are not broadened. Signature inserts and
  reassignments enforce the same candidate rule in PostgreSQL; existing identities stay intact.

## Selected Production Release SUR-22 / SUR-23 / ADM-01 (2026-10-08)

- Released baseline (handoff 2026-10-09, PR #497/#507), originally authorized as
  `release/requester-corrections-production-20261008`
  from `main`, selecting PRs #492, #493 and #494 with their corrective commits.
- Retain deployed Proxmox session hotfix `9184d0e` and its original ancestry.
- Include only migrations `20261008100000`, `20261008110000`, `20261008120000`.
  Staging fixtures, requester RAB choice and unrelated staging changes are excluded.
- Staging browser acceptance passed requester editing with item quantity unchanged,
  attachment replacement after reload, signer proposal 5 to 3, same-number resumption
  and a rejected PDF stamp. Production uses Proxmox LXC 104 for the application;
  PDF, sync and outbound workers remain on Ubuntu. Coordinate only the PDF worker
  with the application release and keep the previous images for rollback.
- Read-only production audit finds Fatchul Aziz already in KC MAGELANG with external
  employee ID 198 and no owned drafts/documents. No profile correction is necessary;
  requester office guards prevent a conflicting form/draft context being submitted.
- Live production acceptance and exact runtime SHA are recorded in the release PR.

## OPS-06 Production Session Query Pressure Hotfix (2026-10-07)

- Branch `hotfix/production-session-query-pressure` from production `main`;
  deployed blue/green at commit `9184d0e` to Proxmox LXC 104
  (`sigap-app-prod-01`, `10.10.10.241:3010`).
- Coalesce concurrent active-profile authorization checks per user and access
  token, then retain only successful checks for five seconds with a bounded
  in-memory cache. Upstream errors, revoked tokens, inactive profiles, and
  deleted profiles remain fail-closed and are never cached.
- Scope is the Fastify application only: no schema, worker, business-record, or
  vendor integration change. Caddy on `10.10.10.253` now sends the production
  domain to LXC 104. The prior Ubuntu app at `10.10.10.246:3010` remains healthy
  as the immediate rollback target; production PDF, sync, and outbound workers
  remain on Ubuntu and were not duplicated or restarted.

## SUR-22 Requester Corrections and Signer Proposals (2026-10-08, Issue #490)

- Released in production and staging; original branch
  `feature/requester-data-attachment-revision-01` (handoff 2026-10-09).
- Minta Perbaikan Pemohon requests details/specifications or attachments without
  reducing items. The full original draft opens through Tindak Lanjut, preserves
  saved edits and intentional attachment removals, and confirms deletions.
- Revisi oleh Penandatangan retains explicit item proposals and requester confirmation.
  Preview and PGD/KEU PDF show requested/approved values and the signer's reasons.
- New internal revisions resume the asking step and retain earlier approval snapshots.
  Later signatures and verification restart; canonical KEU10 totals/directors are re-evaluated.
- Forward migration `20261008100000` extends existing revision RPCs, protects the
  active owner/event/draft boundary, and stores immutable before/after history.
  Legacy vendor revisions keep their established contract and are not reclassified.
- Historical attachment files are retained and remain authorized by their document.
- Real disposable PostgreSQL, changed UI tests, native PDF rendering and staging
  acceptance are release gates; fixtures are not included in the migration.
- Follow-up SLA uses requester department configuration and canonical working
  minutes from the revision request, independently of paused manager approval SLA.
  Migration `20261008120000` authorizes only the requester and active admins.
- Migration `20261008110000` freezes explicit approval/rejection decisions in PDF
  payloads, invalidates native PDFs on rejection and rejects stale publications.
- Staging browser acceptance found the draft reader still required a vendor
  marker. It now accepts strict internal requester-edit markers as well, while
  rejecting closed events, other targets, string booleans and signer proposals.

## SUR-23 / ADM-01 Requester Office and Admin Reset Wiring (2026-10-08, Issue #491)

- Released in production and staging; original branch
  `fix/submission-office-and-admin-reset-01` (handoff 2026-10-09).
- Load the complete ordered office/active candidate collection, resolve KCP BM
  through the closest related KC and reject broken/cyclic/cross-office chains.
- Ordinary requester drafts and number generation must match current profile
  office/department. Revision identity and historical snapshots remain unchanged.
- Native admin-user operations reuse the configured server service client;
  authenticated admin and same-origin checks remain enforced. Secrets never return.
- The reported Fatchul Aziz office is legacy profile data, not a UI name fallback;
  any scoped staging data correction is audited separately from the code migration.
- No schema changes or automatic production/user-password mutation in this PR.

## MRN-12 / SUR-17 / NTF-02 External Units, Fund Checks and Realtime (2026-10-07, Issue #484)

- Candidate `hotfix/external-unit-fund-checker-realtime-01` from production main.
- Unit type comes exclusively from a fresh, fully paginated external lookup;
  slash-separated references are preserved. Missing vendor type fails closed.
  Design replaces the visible Block label; supplied production identifiers are read-only.
- Historical checker configuration used Usman when available for PGD Dana HRD.
  Candidate #509 replaces that default with opt-in, zero-selected exact people
  per usage/stage; existing document snapshots stay intact. KEU unchanged.
- Every current item must be checked; stale item snapshots and legacy RPC bypass
  are rejected atomically. Manager approval and historical signatures stay intact.
- Production receives the already-tested reconnect/session/allowlist behavior from
  staging. Scoped migration `20261007090000` publishes five RLS-protected tables,
  excludes profiles and aligns revision verifier containment; no vendor resend.
- Changed-only local tests plus real PostgreSQL regression precede stage acceptance
  and selective production release. No real production submission is created.

## KEU-10 Land and Permit Cost Submission (2026-10-06, Issue #471)

- Candidate branch `feature/keu10-configurable-workflow-01` from production main.
- Separate KEU 10 editor, confirmation/detail views, native PDF and worker routing.
- Three grouped purposes reuse existing approval-route templates. Maker is the
  related branch manager; Finance is a signed verifier before final approval.
- Tactical land approval uses server-computed totals: at most Rp2 million goes
  to Director I; above that goes to the President Director. Confirmed corrections
  restart approvals and retain historical values, identities and signatures.
- New forward-only migration and real Postgres tests required. Stage acceptance
  precedes selective production release; no test fixtures or vendor POST in prod.
- PGD Pengajuan Dana explicitly selects operational, production or marketing cost.
  KEU 1 and KEU 10 do not display/require that choice; their technical vendor type
  is automatic operational. Issue #479 corrects registration, detail and export
  with forward-only migration `20261006183000`; historical documents stay unchanged.
- Production promotion prerequisite SEC-01: sharp 0.35.5 closes high advisory
  GHSA-wq5f-xc86-pv6w; root pin and backend minimum are aligned. Image/PDF
  regression checks and fresh CI are required; no audit gate suppression.
- Staging: migrations `20261006170000` / `20261006171000` applied, PR #473
  deployed at `a930cde`; canonical rollback smoke and browser draft/confirmation PASS.
- Production prerequisite audit: the original vendor decision RPC is present but
  its historical routing alias is absent. `20261006164500` is a forward-only,
  idempotent compatibility prerequisite (no-op with existing alias); it preserves
  the original implementation without applying unrelated historical migrations.
  Real PostgreSQL tests cover both database shapes. Production rollout pending.

## SUR-04A Incremental Verifier Attachments (2026-10-05, Issue #389)

- Status: staging candidate; production unchanged.
- Components: `ApprovalAttachmentPicker`, `InboxPage`; depends on SUR-04.
- Repeated selections append queued files; individual queued files can be removed.
- Persisted optional evidence is retained. New files persist through the canonical
  verification action. Count/type/size limits and authorization remain unchanged.
- No migration, worker, or vendor contract change.

## UI-03 Theme Bootstrap Cascade (2026-10-05, Issue #459)

- Branch `fix/theme-bootstrap-cascade-01` from main; staging validation first.
- Initial HTML styles use the same CSS layer order and dynamic background/text
  tokens as the application. This prevents the light bootstrap background from
  overriding the dark theme after the Tailwind 4 build-tool upgrade.
- Verify compiled HTML and CSS together in desktop/mobile light and dark modes.
  No migration or worker changes; production rollout follows staging acceptance.

## MAR-10 KEU 1 Confirmation Reconciliation (2026-10-01, Issue #438)

Candidate: `fix/keu1-confirmation-signer-reconciliation-01` from main.
Preserve a context-validated requester or local supervisor during draft restore,
workflow reconciliation and confirmation. Requester-only steps still resolve to
the current actor; invalid supervisor choices fall back to the requester.
No database migration, reservation rewrite, outbound or approval mutation.
Deployment and runtime acceptance remain to be verified in both environments.

## MAR-10 KEU 1 Submit and First Signer (2026-10-01)

- Issue #434, `fix/keu1-submit-and-first-signer-01` from main; staging first.
- Forward-only migration `20261001060000`: correct the registration trigger's
  nonexistent `new.no_urut` reference using the validated document number prefix
  and matching letter type. Preserve office, owner, year, status and scope guards.
- KEU 1 requester approval step one offers requester plus active same-branch
  supervisors from every department. Database trigger enforces the same rule;
  other steps/forms remain unchanged. A selected supervisor is not auto-approved.
- No historical-number repair, fixture promotion, real approval or vendor POST.

## SUR-02/REC-01 Stable Realtime and Recommendation Editor (2026-10-01)

- Issue #430, branch `fix/realtime-stable-recommendation-ui-01` from main.
- Keep inbox tasks/details mounted while realtime refreshes; distinguish first
  load from background refresh for linked documents. Union event keys with a
  bounded flush; recommendation tasks and requester follow-up refresh too.
- Recommendation editor: PIC before derived location, semantic section headings,
  explicit per-item notes. Hide the duplicate global note only for the multi-item
  recommendation model; historical stored notes remain intact.
- No migration, approval, document mutation, or vendor POST. Validate staging
  before selective production release; retain existing staging reconnect fixes.

## MRN-18 Fund Requester Approval Hotfix (2026-10-01)

- Branch `fix/fund-requester-approval-role-01`, tracked under Issue #125.
- Canonical `Pemohon` maps to vendor Fund Submission `staff`; unknown roles
  still fail closed. Approval identity, order, action, and notes are unchanged.
- No migration or configuration change. Target staging first; selective
  production release and one proven pre-POST recovery authorized by owner.
- Production recovery requires confirming no transport attempt or ambiguous
  vendor outcome before requeue; use canonical audited recovery, not raw SQL.

Snapshot audit: 2026-08-04 (Asia/Jakarta)

REC-01/SUR-02 corrective candidate (2026-10-01, Issue #422): migration
`20261001090000_restore_recommendation_partial_submission_recovery.sql` restores
owned draft/USED-reservation retry and draft-based recommendation task linkage.
Fresh registrations still delegate to the current core (including MAR-10 guards).
No business record is rewritten. MRN-14 empty-project copy refers to the planning
system, distinguishing unavailable data from projects not yet ready for use.
Target: staging validation before selective production promotion.

Dokumen ini adalah baseline untuk menentukan fitur mana yang berada di staging,
fitur mana yang boleh dipromosikan ke production, dan cara menarik fitur dari
production tanpa merusak data atau fitur lain. Perbarui dokumen ini pada setiap
PR fitur, perubahan schema, atau perubahan deployment.

## 1. Sumber Kebenaran

Status pada dokumen ini diverifikasi dari:

- route dan menu aplikasi React;
- service browser dan endpoint Fastify di `backend/src`;
- migration PostgreSQL dan schema PostgREST kedua project Supabase;
- runtime aplikasi production Proxmox LXC 104 serta worker Ubuntu;
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

## 2. Snapshot Environment Historis (2026-08-04)

Tabel berikut disimpan sebagai riwayat, bukan kondisi live 2026-10-09.
Gunakan snapshot rilis terbaru di awal dokumen untuk pekerjaan #509.

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

## 3. Kondisi GitHub Historis (Snapshot 2026-08-04)

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
| SEC-01 | Dependency hardening: React 19, React Router v8, ExcelJS streaming fail-closed, js-yaml, nanoid, Tailwind 4, dan DOMPurify | Tailwind 4.3.3 / DOMPurify 3.4.16 kandidat rilis staging lalu production, disetujui 5 Oktober 2026 | Clean install, audit, CSS compatibility tests, responsive light/dark visual comparison, Docker, and staging smoke tests | Pertahankan token dan geometri kontrol; dev tagger lama dihapus; tidak mengubah permission atau database; belum deployed |
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
| CAL-04 | Export PDF Kalender Kerja, durasi dari riwayat status server (jeda istirahat/jam kantor, terhambat, selesai), edit judul dan alignment ikon, carry-forward tanpa mengganti tanggal asal, terlambat hanya tenggat eksplisit | Production + Staging; rilis sebelumnya terverifikasi sebelum #509 (handoff 2026-10-09); riwayat staging PR #467 `99e5a3d` | `src/features/work-calendar/**`, test kalender, migrations `20261006080000_work_calendar_carryover_deadlines.sql`, `20261006110000_work_calendar_bootstrap.sql`, `20261006120000_work_calendar_notification_scope.sql`, production Calendar build flag | CAL-03 F1-F7, server event history, settings KPI dan holidays; jsPDF existing | Satu task tetap satu ID. Event/availability tidak carry-forward. Jam historis tanpa evidence tidak direka. Audit historis 2026-10-06 menemukan catalog production belum memiliki CAL-03 meskipun ada klaim rilis source. Baseline 2026-10-09 sudah terverifikasi; pertahankan shared notifications dan jangan repair alias migration lain. |
| CAL-03 | Unified Work Calendar — route cutover /calendar, team members RPC, profile repository (F3); F4A: ketepatan filter Tim, keterbacaan dark mode, label aksi tambah kontekstual; F4A Director Scale: Team Overview server-side (pagination + agregat); F4B: detail entri responsif (side sheet 480–560px desktop/tablet, dialog layar penuh mobile) di Hari/Minggu/Bulan/Tim + Quick Add dari area tanggal kosong Minggu/Bulan; F5: siklus hidup pekerjaan (satu pekerjaan = satu baris, aksi "Lanjutkan hari ini"/"Ubah jadwal"/"Terhambat"/"Selesai" hanya PATCH baris yang sama), histori peristiwa server-side, tenggat `due_date`, warna penanda statis aksesibel, dan timeline peristiwa di panel detail; F6: hari & jam kerja diturunkan dari konfigurasi KPI existing (read-only, default Senin-Jumat 08:00-17:00), tabel `holidays` (libur nasional/cuti bersama) dengan impor terkurasi, dan pembeda visual nonkerja/libur berlabel di tampilan Hari/Minggu/Bulan; F7: ringkasan pekerjaan hari ini & tertunda di dashboard (`get_work_calendar_dashboard_entries`), notifikasi lonceng berbasis tabel `notifications` bersama (badge angka + ikon kategori, generator on-demand idempotent `generate_work_calendar_notifications` untuk tenggat terlewati/pengingat tindak lanjut/eskalasi atasan dengan dedupe unik + debounce 6 jam serta eskalasi berbasis hari kerja) dan integrasi `work_calendar_events` ke modul Aktivitas Terbaru (`get_my_recent_work_calendar_events`); F8: penutupan produk — manual Kalender Kerja `docs/CAL-03_WORK_CALENDAR.md`, changelog gabungan staging, audit aksesibilitas ringan termasuk Dark Mode (tanpa fitur/kolom database baru) | Production + Staging; baseline Kalender Kerja terverifikasi sebelum #509 (handoff 2026-10-09); klaim source 2026-09-23 adalah riwayat, bukan bukti catalog live saat itu | `src/pages/work-calendar/WorkCalendarPage.tsx`, `src/features/work-calendar/**` (termasuk `lib/work-calendar-add-action.ts`, `lib/work-day-config.ts`, `lib/work-team-overview.ts`, `data/supabase-work-team-overview-repository.ts`, `data/supabase-work-calendar-settings-repository.ts`, `data/work-calendar-holiday-mapper.ts`, `components/WorkCalendarDayBadge.tsx`, `hooks/use-work-team-overview.ts`, `components/TeamOverviewView.tsx`, `components/TeamOverviewFilters.tsx`), `supabase/migrations/20260915093000_work_calendar_team_members.sql`, `supabase/migrations/20260916170000_work_calendar_team_overview.sql`, `supabase/migrations/20260916171000_work_calendar_team_overview_scale.sql`, `supabase/migrations/20260917120000_work_calendar_lifecycle.sql`, `supabase/migrations/20260918090000_work_calendar_holidays.sql`, `supabase/migrations/20260918120000_work_calendar_notifications.sql`, `supabase/tests/work_calendar_team_members.integration.sql`, `supabase/tests/work_calendar_team_overview.integration.sql`, `supabase/tests/work_calendar_team_overview_scale.integration.sql`, `supabase/tests/work_calendar_lifecycle.integration.sql`, `supabase/tests/work_calendar_holidays.integration.sql`, `supabase/tests/work_calendar_notifications.integration.sql`, `scripts/test-work-calendar-sql.mjs`, `scripts/import-holidays.mjs`, `supabase/data/holidays.example.csv`, `src/index.css` (blok `.work-calendar-scope`), `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Header.tsx` (badge angka + ikon notifikasi kalender), `src/components/dashboard/Dashboard.tsx` (widget ringkasan), `src/components/dashboard/RecentActivity.tsx`, `src/services/dashboard.service.ts`, `src/services/notification.service.ts`, `src/test/work-calendar-*.test.*` | `profiles` (hierarchy parent_id), `master_offices`, `master_departments`, `department_kpi_configs` (dibaca, tidak diubah); audit logs; tabel `agendas` dan modul legacy dipertahankan di database | Route `/calendar` aktif sebagai kanonikal, route `/agenda` dilepas; catatan implementasi berikut adalah riwayat source September 2026, bukan audit live baru. F4A F3 tidak menambah migration/schema: kelompok, metrik, dan rasio Tim kini dibangun dari `visibleEntries` sehingga satu anggota terpilih hanya menampilkan pekerjaannya, override kontras/hierarki gelap dibatasi pada `.work-calendar-scope` (light `--primary` 30%, `--destructive` 45%, dark `--primary` 62%), dan aksi tambah memakai label kontekstual per tampilan tanpa duplikasi di Hari. F4A Director Scale menambah migration `20260916170000_work_calendar_team_overview.sql` berisi RPC `list_work_calendar_team_overview` (scope `auth.uid()` recursive descendants, page 25 + `total_count` + agregat seluruh filtered result), `list_work_calendar_team_overview_options` (opsi Kantor/Departemen/Anggota terotorisasi), dan `list_work_calendar_member_entries` (lazy-load per anggota/tanggal, menolak self/anon). Semua `security invoker`, `search_path = ''`, revoke anon + grant authenticated. Filter runtime (Kantor → Departemen → Anggota) hanya mempersempit; Entitas belum diimplementasikan karena tidak dapat diturunkan per-anggota dari relasi kanonikal. Catatan source lama mengklaim penerapan 2026-09-23; audit 2026-10-06 membedakan source dari catalog production. Koreksi final F4A Director Scale (`20260916171000_work_calendar_team_overview_scale.sql`, klaim source lama 2026-09-23, bukan bukti penerapan live) menyambungkan `createSupabaseWorkTeamOverviewRepository` dari `WorkCalendarPage` ke `WorkCalendarWorkspace` pada route `/calendar` nyata, menghapus eager `listTeamMembers()` (bootstrap hanya profil sendiri + probe boolean `has_work_calendar_team_members()`), memakai satu `calendar.anchorDate` untuk heading/query/agregat/lazy detail, memindahkan state filter/page ke React Router (Back/Forward/refresh/deep link), membatalkan request basi dan menutup detail saat konteks berubah, serta menambah pencarian Anggota terbatas server (`search_work_calendar_team_members`, hard cap 50) yang lazy. RPC baru 171000: `has_work_calendar_team_members()`, `search_work_calendar_team_members(text, integer, integer, uuid, uuid)`, `get_work_calendar_team_member(uuid)`; `list_work_calendar_team_overview_options()` dan `list_work_calendar_team_overview(...)` di-`create or replace` dengan offset di-clamp lewat `ranked` CTE (`row_number()` + `WHERE`) agar halaman di luar rentang tidak menyimpulkan `total_count = 0`. F4B tidak menambah migration/schema maupun kontrak repository: satu pola detail entri dipakai di keempat tampilan (side sheet dari kanan 480–560px pada desktop/tablet, dialog layar penuh pada mobile) dengan focus trap, fokus awal ke heading, Escape/tombol tutup/overlay menutup, fokus kembali ke pemicu, dan seleksi `entry` disimpan di query param sehingga Browser Back menutup detail serta id tidak valid/tidak terotorisasi dibuang setelah data selesai dimuat. Edit dilakukan di dalam sheet yang sama (crossfade detail↔editor, tanpa modal bertumpuk); entri bawahan tetap read-only. Quick Add dari area tanggal kosong Minggu/Bulan menampilkan tanggal target, memfokuskan input judul, Enter menyimpan/Escape membatalkan, anti double-submit, error tetap di panel, dan aksi "Tambah detail" menuju editor lengkap tanpa entry ganda; `+N lainnya` serta klik pekerjaan existing tetap membuka Hari/detail. Motion memakai Framer Motion terbatas (overlay 160ms, sheet 240ms, crossfade 120ms, reduced 80ms) dengan `useReducedMotion`. Audit visual menemukan dan memperbaiki dua regresi: permukaan `fixed` (overlay/sheet) semula menjadi anak `.sigap-page` sehingga `space-y-5` menambahkan `margin-top: 20px` dan membuat sheet terpotong 20px serta overlay menyisakan celah; permukaan itu kini dipindahkan ke `document.body` lewat portal. Anak `AnimatePresence` pada Quick Add mobile juga diberi kunci eksplisit agar tidak ada peringatan React duplicate key. |

### 4.3 Persuratan Inti

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| SUR-01 | Registrasi surat dinamis | Production + Staging | Surat form/service, registration RPC | Form usage, numbering, workflow, storage | Sangat tinggi; gunakan feature flag, jangan revert migration |
| SUR-18 | Kandidat kontekstual tahap Membuat | Candidate staging + production (Issue #442) | `first_maker_policy`, candidate helper UI/service, signature guard, migration `20261001120000` | SUR-01, SUR-02, master profil/kantor/departemen | Pemohon sendiri, SPV kantor yang sama, BM KC terkait, Asisten Manager departemen terkait; profil aktif saja. Template internal dan fixture memakai policy configured. Snapshot surat lama tidak diubah, tahap lanjutan tetap konfigurasi asal. |
| SUR-17 | Matrix pengajuan SPK Unit/Non Unit, Aset, Dana kanonikal | Staging; pemulihan konfigurasi rekomendasi Aset pada branch perbaikan | Delapan jalur baru Pusat/Cabang, signer pemohon otomatis, pilihan Direksi, input operator pemeriksa yang terkonfigurasi; migrasi `20260917130000`–`20260917133000`, pemulihan rekomendasi `20260918100000`, dan tes SQL disposable | SUR-01, SUR-06, REC-03, PGD, master profil dan kantor | Kegunaan lama diarsipkan, tidak dihapus fisik; template rekomendasi lama tetap aktif khusus tugas tertaut dan disembunyikan dari pilihan biasa. Tiga jalur Aset kanonikal harus menunjuk template rekomendasi PBO/REK/UAI. Surat lama mempertahankan snapshot. Production tidak disentuh |
| MAR-10 | Form KEU 1 dan hierarki proyek Non Unit; status PGD dan tim pemeriksa per manajer | Production + Staging; promosi presentasi KEU 1 dan guard BM dalam review (Issue #452) | Editor/PDF/seed KEU 1, pilihan proyek KCP di bawah KC, status item PGD 1-4, judul pengajuan, migrasi `20260929070000`-`20260930140000`; kandidat `20261001130000` | SUR-01, SUR-17, master kantor/proyek/departemen, renderer PDF | KEU 1 tanpa proyek; Free Cash, ringkasan/ekspor/outbound mengikuti Kebutuhan Dana. Step BM memakai mode eksplisit `related_branch_manager`, bukan fallback semua staf; fixture tester tetap configured. Rollout renderer memerlukan app + PDF worker terkoordinasi; PDF tersimpan tidak otomatis dirender ulang. Pertahankan migrasi, data, dan identitas signer historis saat menarik UI/renderer. |
| SUR-02 | Draft registrasi, reservasi nomor, dan sinkronisasi matrix aktif | Production + Staging; rekonsiliasi matrix kandidat diperkuat di staging | Draft/reservation RPC, tables, signer reconciliation | SUR-01, numbering, DOC-02 | Draft aktif selalu mengikuti kandidat dan tahap terbaru saat dibuka maupun sebelum submit; surat yang sudah terdaftar tetap memakai snapshot lama untuk audit |
| SUR-03 | Nomor surat atomik dan konfigurasi counter | Production + Staging; KEU 1 Cabang proyek opsional kandidat staging | Numbering admin, RPC, migration 20261005090000 | Letter type, office/entity | Nomor baru Kas Kecil Cabang dengan proyek memakai kode proyek; tanpa proyek tidak memakai -000. Scope counter tanpa proyek tetap terisolasi; nomor historis tidak diubah |
| SUR-03B | Jendela pemakaian ulang nomor draft dibatalkan (admin-configurable) | Production + Staging; baseline kebijakan nomor sudah terverifikasi sebelum #509 (handoff 2026-10-09) | `letter_number_reuse_policies`, kolom audit `surat_reservations.voided_at/voided_by/reuse_until/reused_count/last_reused_at`, event log `letter_number_reservation_events` (tiap batal & tiap reclaim), `claim_reusable_letter_number` (internal, server-time, service_role only), guard `create_surat_registration_draft` anti-resurrect VOID, void + 3 generator, halaman admin numbering (2 bagian), teks pembatalan draft | SUR-03, SUR-13, MRN-22 | Nomor VOID hanya dapat dipakai ulang dalam jendela (jam/hari) yang diatur admin; lewat batas => VOID permanen; USED tidak pernah dipakai ulang; VOID historis tidak dihidupkan ulang; reclaim detach draft batal lama agar pemilik baru draft fresh; helper internal tidak bisa dilewati timestamp klien; audit per siklus di event log + audit kolom; reuse atomik per scope (advisory lock + row lock), diuji dua koneksi paralel |
| SUR-04 | Lampiran awal dan lampiran approval | Production + Staging; lampiran tambahan opsional pemohon/pemeriksa kandidat production setelah acceptance staging (Issue #389) | Storage upload, attachment tables | Private storage, file authorization | Pertahankan file dan metadata saat UI ditarik; submit harus membaca ulang file draft dari database. Kandidat #389 wajib diuji pada kegunaan riil staging sebelum promosi production; fixture UJI STAGING tidak ikut production. |
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
| SUR-16 | Keputusan eksternal dan revision generation | Production rollout in progress; client-credentials + Zudoku | Callback M2M strict, scoped short-lived access token, raw-body HMAC, event idempotency, immutable revision history, Tindak Lanjut pemohon, routing Unit/Rekomendasi/umum, approval dan outbound generation baru | SUR-01, REC-03, MRN-17 | Consumer menukar `client_id`/`client_secret` melalui `/api/access-token`; client provisioning default ke scope `submission:decide`, menyimpan secret hanya dalam file operator yang aman, dan tidak menghentikan proses Node secara paksa. `event_id` tetap menjadi idempotency key bisnis. Static decision token hanya internal facade-to-backend. Zudoku disajikan sekali pada `/docs` dengan kontrak OpenAPI yang sama seperti runtime. Runtime production wajib mengiklankan `https://external.marisoncloud.com` dan membawa revision image yang dapat diaudit. |

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

### 4.5 Permohonan Unit, Non-Unit, Aset, dan Marison

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| MRN-01 | Lookup project Marison | Production + Staging | External data source `/projects` | Token + HMAC | Dapat dinonaktifkan per data source |
| MRN-02 | Lookup unit berdasarkan project | Production + Staging | `/unit?project_id=...` | MRN-01 | Dapat dinonaktifkan per form/data source |
| MRN-03 | Lookup non-unit berdasarkan project | Production + Staging | `/non-unit?project_id=...` | MRN-01 | Dapat dinonaktifkan per form/data source |
| MRN-04 | Alokasi unit, kode produksi, dan rekap | Production + Staging; format tanggal kode outbound dd/mm/yyyy kandidat staging | Surat form/service, production-code | Unit source, PDF attachments | Tanggal sumber tetap ISO; kode produksi baru memakai dd/mm/yyyy tanpa konversi zona waktu. Payload yang sudah dikirim tidak diubah atau diputar ulang; snapshot lama tetap terbaca |
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
| MRN-19 | Hentikan retry storm RPC outbound Marison | Staging candidate | Wrapper RPC idempoten untuk replacement yang sudah ada; konflik mapping dikembalikan sebagai hasil terstruktur; helper strict tidak dapat dipanggil role API; BFF tetap memetakan konflik ke HTTP 409 | MRN-16, MRN-17 | Staging-only; tidak merotasi service role, tidak memodifikasi antrean bisnis, dan tidak menyentuh production |
| MRN-20 | Outbound Fund Submission untuk Non Aset | Latest vendor contract candidate; staging target only | User memilih tipe biaya dan mengisi rincian item; `amount` dihitung dari nominal item; division dari employee external, approval per signer, lampiran final, durable kind `fund`, endpoint `/fund-submissions` | MRN-13, MRN-16, MRN-17 | OpenAPI vendor aktif 26 Agustus 2026: seluruh Fund wajib `branch_id`; Fund berproyek juga membawa `project_id` yang satu cabang, dana umum meng-omit `project_id`; field `description`, `amount`, `items`, `attachments`, dan approval notes diserialisasi eksplisit; production tidak disentuh |
| MRN-21 | Fund Submission tanpa proyek (dana umum) | **Verified staging 20 Agu 2026** — dana umum `044/UAI/MKT.1/VIII/2026` diterima vendor (`fund_submission_id 17`); latest-contract update pending review | Form Non Aset memilih "Tanpa Proyek (Dana Umum)"; snapshot tanpa `requested_project`; payload meng-omit `project_id` tetapi tetap menyertakan `branch_id` employee external. Kontrak terbaru juga mewajibkan `branch_id` pada Fund berproyek | MRN-18, MRN-20 | `projectId` resolution source tetap opsional, `branchId` kini wajib untuk semua Fund melalui migration forward-only `20260826110000_fund_required_branch_latest_contract.sql`; proyek diminta tetapi tidak tervalidasi tetap ditolak sebelum POST; production tidak disentuh |
| MRN-22 | Aset cabang tanpa proyek (lingkup virtual "000") | Staging candidate (PR #260) | Migration `20260903120000_branch_asset_without_project.sql`; `branch_has_registered_projects`, `assert_branch_asset_fallback_eligible`, `resolve_form_usage_category`; kolom `letter_number_counter_configs.office_id` + `cabang_000`; immutable `surat_reservations.number_scope_type`; trigger reservation & registrasi memakai helper DB; RPC 7-param baru dengan `p_form_usage_id`; legacy 6-param RPC tidak dapat membuat fallback; predicate frontend `isBranchAssetFallback` sebagai satu sumber kebenaran; service memakai query master data nyata, bukan `false` hardcoded | MRN-04, MRN-21, SUR-13 | Fallback berlaku hanya jika kantor non-Pusat tidak mempunyai satu pun proyek terdaftar; schema `master_projects` tidak memiliki status aktif/nonaktif. Migration forward-only; counter cabang_000 default `start_from = 1` per (entity, office, year) tanpa konfigurasi admin wajib; advisory lock keyed by (entity, office, year, scope); test runner disposable PostgreSQL `scripts/test-branch-asset-without-project-sql.mjs` menerapkan migration langsung dan menguji fallback, authorization, RLS, backfill, immutability, serta isolasi counter; production tidak disentuh |
| TIM-01 | Canonical currency module dan input UX Tim Pemeriksa | Staging deployed 4 Agustus 2026 (PR #91 merged, SHA db80239) | Canonical rupiah.ts: parseCurrencyInput, formatCurrencyInput, formatRupiah, formatRupiahZero; Tipe Unit digit-only inputMode=numeric placeholder 30; Struktur Atas/Bawah currency input prefix Rp non-editable right-aligned; Nomor Kode Produksi normalized 3-digit on blur; Blok decimal-only single dot; PDF semua nominal Rp 1.000.000, empty→-, zero→Rp 0, total rows; Excel Tipe Unit dan Blok Text cell, Nomor string 001; validasi bisnis per-kavling; 47 regression tests | MRN-12, SUR-04 | No migration; no schema change; 300/300 tests pass; production belum disentuh |
| MRN-11 | Hybrid master branch dan karyawan external | Production + Staging | Mapping ID external ke UUID lokal, review kelengkapan admin, sync run/issue audit, sumber terkunci sesuai deployment environment | `/branches`, `/employees`, Auth admin, ADM-01, ADM-02, ADM-03, ADM-06 | Production memakai `external.marisonregency.id`; staging memakai `marison-external.digivasi.com`. NIK adalah identitas primer: NIK yang sudah ada diperbarui, sedangkan NIK baru membuat akun Auth dan profil memakai password bootstrap yang hanya dibaca dari konfigurasi environment. Division karyawan membentuk dan memetakan departemen SIGAP canonical sebelum profil disinkronkan. |
| MRN-12 | Tipe unit pada alokasi dan seluruh output | Staging only | Input alokasi, spreadsheet impor data, ringkasan layar, PDF adendum, PDF kode produksi, PDF summary, email, payload `units[].type` | MRN-04, MRN-05, kontrak OpenAPI unit | Spreadsheet hanya alat input data massal, bukan dokumen surat; promosikan bersama MRN-05 setelah pengujian dokumen dan payload disetujui |
| MRN-13 | Hybrid master proyek external | Staging; mapping manual proyek siap divalidasi | Mapping `master_projects.marison_project_id`, sync run/issue audit, panel Integrasi Marison, Master Proyek, badge review admin | `/projects`, MRN-11 branch mapping, ADM-07 | Master proyek ditarik dari external dan tetap memakai UUID lokal SIGAP; admin dapat membuat proyek lokal atau memetakan ID external secara manual tanpa membuat duplikat; proyek external tanpa entitas masuk antrean review |
| MRN-14 | Form pengajuan Non Unit terstruktur | Production + Staging; detail pasca-nomor candidate (Issue #418) | Editor jenis pekerjaan, nilai, catatan perencanaan, summary/detail, snapshot project external | MRN-03, MRN-06, MRN-11, MRN-13, DOC-02 | Pilih proyek valid, pesan nomor, lalu isi pekerjaan pada Persetujuan & Berkas melalui slot detail modul. Editor tidak tampil atau mengambil jenis pekerjaan sebelum nomor tersimpan. Pekerjaan tetap wajib lengkap untuk submit; mapping proyek/kantor tetap wajib untuk nomor. Tidak mengubah payload, schema, worker, atau urutan modul lain. |

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
| DOC-09 | Fast path preview PDF privat | Staging deployed; lean authorized preview kandidat staging | PDF job response, polling status, one-time file viewer token | DOC-05, DOC-07, SUR-05 | Preview PDF melewati query lampiran yang tidak diperlukan dan mencari job aktif/selesai secara paralel; browser deteksi pertama 500ms lalu 1000ms. Cache source/fingerprint, backoff worker, otorisasi dan token sekali pakai tetap dipertahankan |
| DOC-10 | Pipeline dokumen database-native tanpa XLSX | Staging candidate; legacy cleanup pending rollout | Registrasi, approval, PDF worker, outbound attachment, route konfigurasi | SUR-01, SUR-06, DOC-02, DOC-05, REC-03 | Database menjadi sumber kebenaran; approval menginvalidasi cache PDF; outbound menunggu PDF final; kode, tabel, kolom, dan storage template lama dihapus; production belum disentuh |

### 4.7 Notification, Realtime, Email, dan Audit

| ID | Fitur | Status | Komponen utama | Dependensi | Penarikan production |
| --- | --- | --- | --- | --- | --- |
| NTF-01 | Notifikasi in-app dan unread state | Production + Staging | Notifications table/header | Workflow events | Pertahankan histori jika UI ditarik |
| NTF-02 | Sidebar attention Realtime via SSE | Production + Staging | Attention provider, `/api/events` | Realtime publication, RLS | Fallback focus refetch tetap ada; jangan kembali polling |
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
| ADM-06 | Master kantor/cabang | Production + Staging | Office admin | Users, agenda, surat, Marison branch | Cross-cutting |
| ADM-07 | Master proyek | Production + Staging | Project admin | Surat/Marison | Jangan campur dengan project external tanpa mapping |
| ADM-08 | SLA/KPI departemen | Production + Staging | KPI pages/RPC/config | Workflow/signature timestamps | UI dapat ditarik; data config dipertahankan |
| ADM-09 | Job title display overrides | Production + Staging | Configuration page | Signature rendering | Memengaruhi dokumen baru dan rebuild |
| ADM-10 | Email settings | Production + Staging | Configuration page | NTF-04 | Dapat dinonaktifkan tanpa menghapus config |

### 4.9 Dokumentasi dan Komponen Dormant

| ID | Fitur | Status | Bukti | Keputusan saat penarikan |
| --- | --- | --- | --- | --- |
| DOCS-01 | Dokumentasi publik dalam aplikasi | Production + Staging | `/docs` routes | Aman ditarik sebagai UI |
| DOCS-02 | Protokol koordinasi manusia dan AI | Staging only | Root `AGENTS.md`, `docs/AI_COLLABORATION.md`, GitHub Issue/draft PR | Dokumentasi operasional; pertahankan selama pekerjaan paralel diizinkan |
| EXT-01 | External API keputusan pengajuan SIGAP | Production rollout in progress | Fastify M2M API, client credentials, Zudoku/OpenAPI, container terpisah | SUR-16, production DNS/tunnel, production Supabase | Endpoint publik hanya melalui HTTPS; client secret disimpan dalam bentuk hash dan kredensial plaintext hanya dibuat sekali pada file operator |
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

## DOC-12 Historical Signed PDF Download (2026-10-23, Issue #743)

- 2026-10-23 [Codex] Candidate main-based fix routes Monitoring Admin's signed
  stage download through the canonical signature-bound PDF endpoint instead of
  treating native document markers as stored file paths. Applies to legacy and
  native snapshots; unsigned/rejected-only stages offer no signed download.
- Explicit user authorization: staging then selected production. Historical
  stage3 must exclude approval marks from stages4/5 even after final completion.
  Existing document authorization, snapshots, approvals and outbound stay intact.
- Target014/UAI/PBO.1/X/2026 is already DONE with five signed stages at diagnosis;
  user requested its historical stage3. No migration or PDF worker source change.

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

## REC-03 / SUR-22 Recommendation Requester Revision Photos (2026-10-12, Issue #542)

### 2026-10-20 REC-03 Image Preview Follow-up (Issue #665)

- Restore editor previews through the existing allowlisted legacy-storage display
  gateway; saved upload URLs and immutable draft/revision references are unchanged.
- Confirmation and detail previews render every canonical multi-detail attachment,
  while retaining old single-image and nested-attachment compatibility.
- Clipboard accepts browser item files when the files collection is empty, without
  duplicate uploads; the image drop zone is keyboard focusable. No changes to file
  authorization, storage ACL, PDF workers, approval or outbound. Target staging then
  selective production as explicitly requested, including DASH-04 border follow-up.

- `fix/recommendation-revision-photos-01` from main; staging first, selective production.
- Canonical revision drafts retain the recommendation task/parent context and editable
  requester-owned per-item photos. Photo references are rebound to the new draft;
  files themselves are not copied/deleted. Existing broken drafts are prepared once
  on open without discarding saved edits or restoring deliberate subsequent removals.
- Recommendation submission validates its own canonical item model and draft-owned
  photo identities instead of requiring unrelated PGD `items`. Examiner attachments
  remain protected; original number, return step and immutable before/after history
  continue through the existing requester revision RPCs.
- Forward migrations `20261012160000` and `20261012163000` change private helpers/canonical RPC bodies only.
  Parent summary access for submitted tasks requires the authenticated owner and an
  active linked requester revision/draft; unrelated users and closed revisions stay denied.
  No new endpoint, publication or worker source. App-only rollout; migration history
  and function-shape guards must pass separately in each environment.
- Affected tests and disposable PostgreSQL cover photo retention/removal, redaction-only
  save, forged identity/file rejection, reopening, audit and duplicate submission.
  Source tests are not a claim that a production document was resubmitted.

## AUTH-08 / SUR-25 Selected Promotion and Draft Context (2026-10-13, Issue #546)

- Selectively promote original issuing-office access commits #539, excluding their
  staging merge ancestry. The only permission is `submission.issue_for_office`;
  employee profile, department, approval rights and admin role are not replaced.
- Forward correction `20261013090000` after `20261012140000` reads the wizard's
  nested `formData` context as well as legacy flat payloads, rejecting conflicting
  identities. The original draft payload and saved selections are preserved.
- This fixes a staging number-success/draft-save failure affecting HQ Marketing
  Fund creation, without bypassing office authorization or reservation ownership.
- Disposable PostgreSQL tests cover wrapped create/autosave, flat compatibility,
  conflicting context, immutable office, revocation, HQ Marketing and KC/KCP scope.
  Live acceptance and release identities belong to Issue #546, not inferred here.

## DASH-04 Dashboard Visual Hierarchy (2026-10-20, Issue #659)

- Staging-only visual follow-up to DASH-03: differentiated KPI icons, stronger
  selected filters, SLA status badges, measured on-time meter and clearer document
  identity, requester and current-position layout. Missing measurements stay
  unmeasured, never a fabricated zero-percent performance result.
- Working-minute durations render as hours and minutes; no assumption about
  workday length, SLA threshold or business-clock calculation is introduced.
- Compact scope controls and stacked queue rows below desktop width keep all
  requester, position, SLA and action information visible without sideways scrolling.
  Light/dark, keyboard focus, loading, empty and error paths remain supported.
- Existing RPC, organization visibility, data counts, reminder recipient/cooldown
  rules and exact document links are unchanged. No database migration, new endpoint,
  worker rollout or production authorization. Keep the main-based feature branch
  for a later explicitly requested selective production release.

### 2026-10-20 DASH-04 Release and Selector Border Follow-up

- The original DASH-04 visual hierarchy is live in production at
  `637cc5a3ff1327a049d168c685af37914d08b58c` (PR #661), after staging
  verification and ancestry sync #662. This supersedes the initial staging-only
  status above. Full release evidence is recorded in Issue #659.
- New follow-up, clarified by user: one dashed outline around each complete
  dashboard scope and queue-category control, not around individual tabs.
  Active choices use a distinct background and primary text without a tab border.
  The shared Tabs component, filtering, keyboard behavior and permissions are
  unchanged. This additional styling targets staging; it is not yet production.

### 2026-10-20 DASH-04 Strong Solid Tab Groups

- Latest user direction supersedes the dashed outline above: both complete scope
  and queue-category controls have a solid two-pixel primary border; individual
  tab choices remain borderless, with distinct active backgrounds and text.
- Summary and SLA cards retain the same neutral border whether selected or not.
  No selected ring or colored border competes with the tab controls. Keyboard
  focus indicators, aria-pressed state, filters, counts and reminder rules remain.
- This follow-up targets staging only; the production dashboard is unchanged.

## REC-03 Complex Recommendation PDF Layout (2026-10-21, Issue #670)

- User authorized staging then selective production. Compact main-form cells
  reference complete flowing item details when text is long; no component,
  applicant note, examiner note or attachment is removed from the document.
- Complex items do not add empty filler rows. Bounded main rows, note/signature
  blocks and image rows stay together; oversized narrative flows separately.
  Detail headings use visible dark text instead of white text without a backdrop.
- Header totals are reconciled with actual PDF layout, including text overflow
  and revision appendices. Simple forms retain their existing worksheet layout.
- App and PDF worker must use the same selected image. Drain PDF jobs, preserve
  rollback images/configuration and verify public SHA plus rendered PDFs before
  promotion. No migration, permission, workflow, signature or outbound changes.
- After release regenerate only the current main PDF of
  `013/UAI/PBO.4/X/2026`; retain historical signer PDFs and immutable source data.

## SUR-35 PGD Fund Requester Notes (2026-10-21, Issue #676)

- Optional multiline requester notes use the existing `form_input_data.catatan`;
  draft, revision and submission keep the canonical input without a schema change.
- Confirmation, saved detail and native PGD PDF place notes before fund type and
  requested total. Empty notes remain optional; KEU 1/10 are unchanged.
- Candidate staging then selective production release, explicitly authorized.
  Roll out app and PDF worker together; stored PDFs are not rewritten automatically.

## REC-03 Parent Overview Photo (2026-10-21, Issue #680)

- A unique detail whose normalized name matches the original applicant item is
  its overview when another named component exists. Its photo is optional;
  every component photo remains required, even after reordering. Removing all
  components restores the photo requirement. Ambiguous duplicate names stay required.
- UI labels and submission validation share the same predicate. No extra model
  fields, schema changes, attachment removal or relaxed attachment authorization.
- Staging first, then selective production as continuation of the requested release.
  App-only rollout; PDF worker/data/history/outbound remain unchanged.

## REC-03 Attachment PDF Layout (2026-10-21, Issue #684)

### REC-04 No Printed Revision History (2026-10-23, Issue #725)

- 2026-10-23 [Codex] User authorized staging then production. Recommendation
  PDFs omit revision-history appendices and their actor/history queries. Current
  form, signatures, component descriptions and photo attachments remain intact.
- Application audit records and other form PDFs are unchanged. App/PDF worker
  must be rolled out together. Already-generated files are not silently rewritten;
  retain signer/archive PDFs and use canonical regeneration for selected main PDFs.
- Focused renderer/worker regressions pass62 tests before integration gates.

- Attachment appendix follows the approved preview reference: bounded image
  column on the left and item identity/action/location/PIC/description/notes on
  the right. Several short component blocks can share a page, without forced
  per-component blank space. Extra photos continue under the same item identity.
- Main worksheet/signatures, metadata, ordering, image ownership and original
  files remain unchanged. Long text flows instead of clipping; actual page totals
  are reconciled after layout. No schema or business workflow changes.
- Explicit staging then selective production release requires coordinated app
  and PDF worker rollout. Existing stored PDFs are not bulk rewritten.

## SUR-38 Requester Additional Signers (2026-10-26, Issue #751)

- Released from `feature/requester-additional-signers-20261026` to staging and
  production after explicit production authorization and PDF verification.
  Required configured signers are locked; additions can be inserted, removed
  and moved within Membuat/Memeriksa/Menyetujui, up to eight total signers.
- Server validates the complete mandatory route and active candidates, atomically
  freezes additional approvals, remaps recommendation/revision stage references,
  and retains additions in revisited drafts and PDF snapshots. KEU10 preserves
  mandatory finance/director checks and its amount-dependent revision rules.
- Migration `20261026030000` applied to staging and production after rollback
  rehearsals; existing documents, signatures and outbound rows unchanged.
  Coordinated app/PDF rollout completed in both environments.

### 2026-10-26 [Codex] SUR-38 staging release

- PR #752 merged to staging SHA `a9643ac715beff6b7adfadee876db1b6b17ff9cf`.
  App and PDF worker both run that image; four public smoke endpoints returned 200.
- Live Pengajuan Aset draft confirmed all three Add controls, select, reorder,
  autosave, refresh retention and removal. Disposable PostgreSQL covered ordinary
  and KEU10 approvals, corrections and concurrency. No real approval or outbound.
- Hosted CI did not start due GitHub billing. Clean Linux lint/typecheck/build and
  102 focused tests passed; pre-existing high Zod advisory remains separately.
  No production release authorized.

### 2026-10-26 [Codex] SUR-38 production release

- Production explicitly authorized after PDF review. PR #754 staged the
  seven/eight-signer recommendation layout correction, PR #755 selectively
  promoted SUR-38 to main, and PR #756 synchronized main ancestry to staging.
- Live staging `d33970e412eedf2a2a5ecec66bc637ba1c053a91`; production
  `76af3f9fe64a2c1b50f52f787b12b9a8847257c7`. Both app/PDF worker pairs
  share an image. Production migration `20261026030000` is in CT 110 ledger;
  previous documents/signatures remain untouched.
- Eight-signer PGD, KEU 1, KEU 10 and recommendation PDF layouts were checked
  visually. Runtime worker render smoke and five production public readiness
  probes passed. Hosted CI remains blocked before execution by GitHub billing.
  No live submission, historical PDF rewrite or outbound resend was performed.
