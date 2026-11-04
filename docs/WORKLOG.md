# Worklog

## 2026-11-04 [Codex] MRN-802 Staging And Production Completed

- Supersedes pending deployment in the MRN-802 entry below. Selective source
  `e7bec74e2f794572d0d07f75b6c14ad46c9e6eac`; PR #804 staging, #803 main,
  #805 required main-ancestry sync. First staging `a2646ae` passed compiled
  acceptance before main promotion; final live staging
  `1d2d83154340b839a93a8c61eb0199a241781e71` contains selected production
  `4ea5e6c82a36ce65481d830f5c7ce8a91ab6558a` and passed acceptance again.
- Official staging runs41810078911/41810977031 and production41811323105
  completed quality AND deploy successfully. Source PR checks41809813358 and
  41809956000 passed. Local95 focused tests in8 files, lint, typecheck,
  frontend/backend builds and audit high/critical gate passed;20 existing moderate
  advisories remain. No suite coverage removed or quality bypass. A new source
  boundary assertion was corrected before the final95/95 run and release.
- Both live containers' compiled revision checks pass valid returned reapproval,
  same accepted-unit reuse, foreign-unit refusal and consumed/open/unknown-state
  refusal. Internal request without token returns401. No real business POST in
  this task; worker network tests used synthetic responses. Browser surfaces were
  unavailable; no browser or full vendor round-trip acceptance is claimed.
- Production historical051 replay reconstructs the old pre-POST context ONLY in
  memory and passes; the actual succeeded generation3 is blocked. Fingerprints
  of eight protected tables (document/signatures/attachments/revisions/decisions/
  archive/outbound/reconciliation) are identical across rollout. Still exactly
  three dispatch generations, generation3 succeeded/reference2. No approval,
  receipt rewrite, resend or business-data change. The prior797 POST is not repeated.
- Read-only configured external-source probe confirms units2048/2074/2173 have
  has_submitted=true with current type30 5.3. Runtime uses current API type, not
  a hardcoded30. Only IDs in the same accepted project's frozen payload can reuse
  a true flag; other/new units must explicitly be unsubmitted. Unknowns stay held.
- Production appc571223d1b2e healthy/restart0, Node22.23.4. PDFc3af751fdaf4,
  syncfc03d1194fee, outbound657fba2b5a1f and API99e7d80fd17a retain IDs;
  environment/ports/mounts and unrelated containers unchanged. Public production
  root/ready/version and staging ready/version200 with expected SHAs. App-recreate
  deployment is not a zero-downtime guarantee. No migration, secret, ACL or network
  changes, no worker source rollout. No blockers for this scoped implementation.
- Durable finding: derive revision permission from the private external event,
  resolved revision, archived accepted dispatch and restarted signatures; never
  trust a client revision flag or disable has_submitted checking globally. A
  successful same-number POST is not general retry/idempotency permission:
  timeout/5xx stays unknown, completed returns cannot be reused. Project changes
  or another submission's unit cannot use this narrow same-project authorization.
  `docs/PROJECT_CONTEXT.md` remains absent; shared document structure unchanged.

## 2026-11-04 [Codex] SEC-04 Live Production And SUR-30 Staging Promotion Checkpoint

- SEC-04 production completed independently: selective PR789 main626b5bd,
  staging parity PR790/live03a1e93 before cutover. Hosted exact-main quality
  41794042636 and final Deploy Production41794954594 succeeded.
- Production app3d37850b68c9 uses main626b5bd; PDFc3af751fdaf4,
  syncfc03d1194fee,outbound657fba2b5a1f and API99e7d80fd17a have SEC-04
  dependency-only images with original source fingerprints/SHAs retained.
  All Node22.23.4/restart0; Fastify5.12.7 and Nodemailer10.1.4 where installed
  verified with offline synthetic probes. Stage API patched/verified first.
  Effective environment, TLS mount, ports and unrelated containers preserved.
  Public root/version/live/ready200; no maintenance, migration or resend for SEC-04.
- SUR-30 isolated sourceca58d15 and staging integrationPR793/9635e8c passed
  Quality41797961420. New migration20261104160000 (SHA256b80bd155a0ffa037101b3ca5779d4afcc6ebc147f8778ebdd6da5eb8f47ec433)
  applied only to staging at this checkpoint. Prior9 valid reviews preserved;
  all document/signature/review/revision/archive/outbound fingerprints unchanged.
- Historical migration-ledger differences audited against protected REC-06 after
  snapshots: stage244 and production241 versions exactly match those baselines.
  Only the selected new version is applied, no repair/include-all/bulk replay.
  Production rehearsal under the existing supabase_admin function owner rolled
  back successfully:051 becomes valid, remains PROSES/step5, exactly1 new valid
  Unit document, all business fingerprints and original guards unchanged.
- Selective production PR794 merged as c9ca0e7 after hosted candidate quality
  41798358890 succeeded. This sync brings that main commit into staging ancestry
  without promoting unrelated staging features. Production migration/cutover
  still pending live-staging parity and explicit selected-migration ACK.

## 2026-11-04 [Codex] Quality baseline merged; staging runtime rollout pending / Issue #769

- #769 fix merged into staging as `314635c` (PR #786) after its Quality Gate
  passed. Deploy Staging run 41784282776 passed the full quality job in 9m43s
  but the deploy step stopped on the coordinated-worker guard: only `dockerfile`
  differs in the worker set, from the SEC-04 Node 22.23.4 pin, and the staging
  Compose project builds app, PDF worker, Marison sync and Marison outbound from
  the same `agenda-flow:staging` image.
- Observed state: staging source `314635c`; staging runtime `/health/version`
  still `5c467fe` with `/health/ready` 200; production runtime `ed124b6` with
  `/health/ready` 200. No migration, worker restart, secret, business data or
  production change was made, and the guard was not bypassed.
- Next: an operator with staging host access rebuilds `agenda-flow:staging` and
  recreates `agenda-flow-staging`, `agenda-pdf-worker-staging`,
  `agenda-marison-sync-staging` and `agenda-marison-outbound-staging` in a
  coordinated window without a live PDF lease, then runs
  `bash scripts/deploy-app.sh staging <staging-head>` for the head that includes
  this entry and smoke-tests `https://sigap.marison-testing.biz.id`.

## 2026-11-04 [Codex] SEC-04 staging integration / Issue #782

- PR #784 merged into staging as `21a99c8` after the branch absorbed
  `origin/staging`. The PR Quality Gate failed only the eight pre-existing
  baseline assertions, which also failed on the already-merged SEC-03 PR; the
  new SEC-04 suite passed12/12 in hosted CI.
- Deploy Staging run41777285026 then failed its `quality:changed` step for the
  same eight assertions because the dependency pins change `package-lock.json`,
  which selects the full suite. The staging runtime was not changed by that run;
  no bypass or gate edit was used.
- Resolution is tracked in #769 on `fix/quality-baseline-769`; production
  runtime, database, secrets and deployment remain untouched.

## 2026-11-04 [Codex] Quality baseline reconciliation / Issue #769

- Claimed #769 on `fix/quality-baseline-769` from staging after SEC-04 merged as
  `21a99c8`; its deploy quality job failed the full suite on the same eight
  pre-existing assertions that also failed on merged SEC-03, not on SEC-04 code.
- Reconciled all eight without deleting coverage: recomputed the admin and
  troubleshooting content hashes only after verifying the MRN-25 payload viewer
  and release-guidance commits, pointed the source expectations at the current
  `RealtimeSync` flush owner, atomic KEU10/additional-signer registration,
  persistent file-link `reference` argument and `MasterReviewStatus` Keterangan
  cell, bounded the SuratForm autosave assertion to its documented
  external-revision timer, and included the calendar `--results` suite.
- Local evidence: targeted eight files79/79 pass; lint and typecheck clean; full
  suite on CI-like Node24.22.2 295 files,2855 passed,1 skipped,0 failed. Hash
  values match the hosted Linux received values, so the drift was not CRLF.
- No product runtime, database, migration, secret, outbound call or deployment
  change. Staging deploy and smoke test remain the next step; production
  untouched.
## 2026-11-04 [Codex] MRN-802 Verified Returned Unit Revision Dispatch

- Active on isolated main-based `codex/unit-returned-revision-802`, Issue #802.
  User confirmed Digivasi rejects duplicate new document numbers but accepts
  returned revisions under the same number, and authorized staging then production.
  The earlier051 one-shot returned HTTP200 with the same submission_id2. That
  completed job is NOT reopened, queued or sent again by this implementation.
- Supersedes the blanket accepted-Unit revision hold only for proven returns:
  private external decision/latest event, resolved revision, archived accepted
  predecessor, document number/project, sequential dispatch and fresh signatures
  from the configured restart step must agree. Accepted payload body/hash and
  vendor receipt must be intact. Internal edits, rejected decisions, stale or
  reused returns, completed jobs and unknown outcomes remain blocked.
- Check authorization before BOTH logical build and frozen transport. Reuse a
  submitted unit only if present in that same accepted project's frozen payload;
  additions require explicit has_submitted=false. Missing/unknown unit state or
  another submission's unit fails422. Ordinary rejected replacement protections
  remain. Canonical payload, current API references, main_document, attachments
  and durable outbox are reused; no new HTTP endpoint, role grant or migration.
- Queue no longer labels every accepted-predecessor row as contract-blocked;
  actual validation/HTTP diagnosis is preserved. Admin recovery GET/POST both load
  full generation/predecessor context before allowing pre-POST rebuild.
- Focused tests cover valid return, forged/cross-context/stale/consumed evidence,
  approval restart, private read failure, token/lease boundary and foreign units.
  Real dispatcher fixtures materialize a valid candidate without a business POST.
  Worker fixtures prove one POST and succeeded/reference2 or terminal422/unknown
  timeout/5xx, without automatic business retry. Lint/typecheck/backend/frontend
  builds and audit high/critical gate pass;20 pre-existing moderate advisories.
- Read-only historical051 replay against the new compiled validator passes when
  reconstructing its pre-POST state ONLY in memory. The actual succeeded job is
  blocked. Zero writes/business POST; no data/history/approval changes. Remaining:
  exact-source hosted gates, staging deploy/acceptance then selective production.

## 2026-11-04 [Codex] MRN-797 Explicit Single-POST Exception Authorized

- Supersedes the no-resend boundary below only for051 generation3. After being
  told generation2 already exists as vendor submission_id2 and a same-number POST
  may create a duplicate submission/SPK, the user explicitly authorized exactly
  one real POST and accepted duplicate risk. No automatic retry is authorized.
- The general duplicate guard stays fail-closed. Operator exception uses the
  existing canonical latest-payload preview (now module-exported for trusted local
  operator tooling, no new HTTP endpoint or public permission) and records an
  exclusive one-shot attempt plus payload hash and vendor response privately.
  Any timeout/ambiguous response stops; never repeat to find out what happened.
- Staging/production classification release remains separately verified. Historical
  accepted generation2 is not overwritten. Record actual vendor reference, including
  a different ID if returned; do not claim an in-place update without evidence.

## 2026-11-04 [Codex] MRN Unit External Revision Dispatch / Issue #797

- User reports051 generation3 terminal failure and explicitly authorizes staging
  then production, but no resend. Separate branchcodex/unit-external-revision-dispatch.
  Read-only evidence: generation2 accepted on October21 as vendor submission_id2;
  generation3 created after external revision, payload absent/post_started_at null,
  three local build attempts, no vendor POST. Current document DONE, review valid.
- Cause: accepted revision and rejected HTTP422 replacement both reuse
  replacement_of_dispatch_id. Unit builder incorrectly requires all units to be
  previously unsubmitted for both, and a plain Error becomes500/retries.
- Added private intent classification binding predecessor ID/document/environment/
  kind/generation. Accepted predecessors require a vendor revision contract and
  fail closed409 before logical build or frozen-payload materialization; pre-POST
  recovery also rejects reopening this class. Rejected replacement and initial
  paths retain the existing unsubmitted-reference guard. Invalid unit references
  now return422 rather than retryable500, with no permission/duplicate bypass.
- Admin list uses one scoped batch predecessor query to explain historical revision
  failures without rewriting persisted jobs, payloads, responses or accepted history.
  Current official vendor OpenAPI only documents create POST/unit-submissions;
  no revision/update semantics or accepted-record ownership lookup is documented.
  Delivery remains blocked pending Digivasi's duplicate-safe revision contract.
- Pure tests and real raw dispatcher fixtures prove409 at logical/transport stages,
  no outbound network, no database RPC/write and unchanged frozen payload. No
  job reopened or new generation created. Remaining: gates, staging/main selective
  release and read-only production diagnosis acceptance. No migration/worker edit.

## 2026-11-04 [Codex] SUR-30 External Addendum Review Preservation / Issue #791

- User reports051/UAI/MKT.1.SGN/X/2026 final approval blocked after external
  revision; explicitly authorized staging then production without approval/resend.
  Separate branch `codex/unit-partial-external-revision` from main626b5bd.
- Read-only production diagnosis: request30,allocation3, retained76-character
  examiner note, identity/time/signature/project all match. Only four monetary
  fields across three allocation_detail objects differ from the October15 receipt;
  unit identities, raw catalog, type and production metadata are unchanged.
  Resolved external generation1 restarts at step5, after the signed examiner;
  immutable external archive contains the corrected allocation exactly.
- New forward-only migration20261104160000 preserves the original exact-snapshot
  validator as the primary path. Private fallback requires current persisted input,
  resolved linked external decision/generation, later approval restart, archived
  signed verifier/note/time, same project/count/unit/order/type/production metadata,
  and exact financial values in that external archive. No post-archive edit or
  same-count unit substitution can reuse the receipt. No history row is rewritten.
- Disposable PostgreSQL17 regressions pass on legacy staging and production
  shapes, including repeat migration, exact legacy path, positive correction,
  forged identity/type/production/count/project/money, stale/open revisions,
  altered archived verifier/note, missing final signature and private-helper ACLs.
  Focused Vitest7/7 passes. Selected test gate now runs both SQL deployment shapes.
- Remaining: CI, audited selected staging migration and runtime, production
  rehearsal/selective release/application, then read-only051 validation. No
  production approval, historical PDF regeneration, dispatch replay or business
  POST is authorized by this bug fix. Existing final signer must act normally.

## 2026-11-04 [Codex] OPS-QG Production-Only Eighth Assertion Identified

- Hosted candidate run41792231355 passed the remaining checks but exposed one
  further stale MRN-16 source assertion: main expected the old no-options identity
  call, although its production builder/recovery already pass the dispatch kind.
  Staging already has the two correct assertions. Ported those exact assertions
  without changing runtime behavior or weakening requester/signer identity checks.
- This corrects the preceding checkpoint: seven failures reproduced in the initial
  targeted set; the full main-based gate found the eighth in a different file
  from staging's eighth realtime test. Full hosted gate must pass before promotion.

## 2026-11-04 [Codex] SEC-04 Selective Production Release Started / Issue #782

- User explicitly authorized production after staging7108cf5 and requested a
  separate public-latency investigation prompt. No routing/DNS change is bundled.
- `codex/sec04-production-release` starts at main ed124b6 and retains the original
  SEC-04 commits08f2fa3/a3d0c0c, excluding their later staging-history merge.
- Reproduced seven stale baseline assertions on this production source,58 passes.
  Applied the corresponding OPS-QG checks without removing coverage. The eighth
  realtime-flush file exists only on staging and is not imported into production.
  Main troubleshooting docs intentionally differ from staging in the existing
  projectless user guidance; production-only normalized hash4305a73a is used.
  Admin hash0c485e76 and MRN-25/release guidance match the reviewed existing source.
- Staging four-service runtime was verified7108cf5, Node22.23.4, restart0;
  external API has a separate image and must be validated/rolled separately.
  Production source/runtime ed124b6 and readiness200 were observed before work.
- Remaining: selected CI gates, main/staging ancestry and live staging promotion,
  protected configuration/rollback preflight, coordinated production runtime
  rollout and public smoke. No migration, approval, replay or vendor business POST.

## 2026-11-04 [Codex] SEC-04 private-audit candidate hardening / Issue #782

- Validated the selected private-audit candidates with synthetic fixtures in an
  isolated worktree: no production data, SMTP, push provider, Supabase, or
  outbound network. The new 12-check suite was red on ed124b6 and is green after
  the fixes.
- Fixed legacy `/api/notifications/email` so a non-admin can only email itself
  and title/message/link are escaped; enforced the multipart aggregate cap while
  streaming before `formData()`; reused the active-profile gate in
  `getAuthorizedSurat`; included storage origin in ownership keys; restricted
  Web Push endpoints to known providers; pinned production quality/deploy jobs
  to the preflight-resolved commit.
- Deferred without code changes: external-api `trustProxy`, generic storage
  overwrite ownership, stateless cookie revocation, active-profile cache and
  attachment replacement task binding. They need owner/environment decisions.
- lint, typecheck and production build pass. Targeted suites pass. Full suite on
  CI-like Node24.22.2: 2743 passed, 8 pre-existing failures remain (docs hashes
  and source-drift checks already on main); they reproduce with this hardening
  stashed. Local Node24.11.1 predates the SEC-04 NUL-DNS fix, so that check
  passes only on the pinned/CI runtime.
- Staging PR and deploy verification pending. Production runtime, database,
  secrets and deployment untouched; no maintenance window opened.

## 2026-11-04 [Codex] SEC-04 runtime hardening / Issue #782

- Separate `codex/runtime-security-20261104` from main ed124b6; OPS-17 audit source
  remains immutable apart from its parent-owned documentation checkpoints.
- Official October21 Node security release22.23.4 applies to the observed app
  runtime22.23.1. Compatible Fastify5.12.7 and Nodemailer10.1.4 address published
  header normalization and address-parser advisories; no speculative app RCE claim.
- Exact old versions fail3 bounded component regressions; candidate passes4/4.
  Dependencies installed with ignore-scripts in a fresh bounded credential-free
  container; actual tests execute separately with network none/read-only deps.
- Full candidate regression/build gates running. Scope excludes broad ACL or
  authentication changes, replay and major documentation dependency upgrades.
- Root audit now0high/critical/low,20moderate records; baseline had22 total.
  Production maintenance estimate11:22WIB must be explicitly completed regardless
  of remaining offline audit/release work. No production upgrade yet.

## 2026-11-03 [Codex] SEC-03 validation evidence and release hold / Issue #766

- Source commit5310634; staging integration PR #767 preserves AUTH-09.
 217 related tests and39 desktop/Zod compatibility tests pass. Integration lint,
  typecheck and frontend/backend builds pass; documentation clean install and
  build pass with every resolved Zod at4.6.7. Root high/critical audit gate passes.
- Source full suite:2716 pass,8 fail,7 pending. All8 failing assertion names
  reproduce on isolated main baseline7a6aac7 using Zod3.25.76 (75 pass/8 fail
  in the83-test subset). Baseline quality follow-up #769 includes possible CRLF
  sensitivity; do not blindly update hashes or remove behavioral checks.
- Unrelated documentation dependency findings tracked in #768. No blanket
  npm audit fix, v3 compatibility fallback or quality/deployment bypass.
- Release held: PR #767 hosted CI41610672160 was still in progress at the time
  of this entry. No staging merge, deployment, worker restart or live migration.
  Staging public version remainsd33970e412eedf2a2a5ecec66bc637ba1c053a91;
  production untouched. KEU routing PR #765 remains separately unmerged.
- Next: inspect hosted CI, reconcile baseline failures independently, then
  coordinate app/worker staging rollout and smoke. Production needs explicit
  authorization. Durable lesson: validate staging-only desktop consumers when
  selectively upgrading a shared runtime dependency from main.

## 2026-11-04 [Codex] REC-06 active-only follow-up / Issue #773

- Forward-only migration20261104100000 limits new task allocation to PROSES and
  MENUNGGU_PERBAIKAN. Migration0900 was already applied in staging, so it was not
  edited. Completed, VOID and rejected archival updates are regression tested.
- Both migration rehearsals/selected staging applies and rollback-only canonical
  tester submit/inbox acceptance pass, with42 surat/179 signatures/5 tasks/75
  reservations unchanged. Production0900/1000 will be applied atomically after
  the final source/main/staging ancestry synchronization. No production writes yet.

## 2026-11-04 [Codex] REC-06 recommendation revision / Issue #773

- Claimed `fix/revision-enable-recommendation` from main. Production read-only
  diagnosis confirmed001/MBP/03.14-000.3.1/XI/2026 requires recommendation but
  has zero tasks; insert-only trigger misses requester revisions. Its current
  requester revision remains open; no source/signature/outbound mutation made.
- Forward migration20261104090000 uses canonical allocation on input update,
  preserves actor/capability guards, and normalizes parent/task lock ordering.
  Exact private submit permit restores the asking step without approving it;
  separate signature and terminal-status guards remain strict.
- Red test reproduces missing task. Real PostgreSQL tests pass both factory
  shapes, replay, ownership, late rollback, task/number dedupe, lock concurrency,
  canonical request->draft->submit->IT inbox, old approvals and history retained.
  Relevant38 Vitest tests, lint/typecheck/frontend/backend builds pass.
- Staging preflight/rehearsal clean; only new migration was missing, remote-only
  versions zero in staging overlay inventory. Applied with unchanged42 surat,
 179 signatures,5 tasks,75 reservations and preserved function owners/ACLs.
- Actual Hariono UJI staging fixture request/draft/submit/inbox acceptance passes
  within ROLLBACK. Its old single-account usage assigns PRC staff as recommendation
  maker; the test temporarily adds one existing active PBO candidate inside the
  same rollback transaction. No profile, candidate or document changes persist.
- User explicitly authorized production plus narrow missing-task recovery.
  Remaining: source/staging/main PRs, staged runtime ancestry, production schema
  preflight/rehearsal/apply, audited recovery with unchanged parent/revision/
  signature/outbound fingerprints, and public smoke. No external resend.

## 2026-11-03 [Codex] SEC-03 Zod4 compatibility / Issue #766

- User requested upgrade and validation after the existing high Zod advisory
  blocked KEU routing. Branch `fix/zod4-validation-security` from main; staging
  only. No production, live database or business dispatch changes.
- Pinned Zod4.6.7 in all runtime workspaces and documentation overrides. Kept
  unrelated dependency versions intact. Native email lowercase normalization
  replaces transform to preserve credential typing under both TypeScript modes.
- Isolated Linux installation:217 related tests, lint, typecheck and frontend,
  backend/shared and Zudoku builds pass. New bounded regression checks collection
  size rejection before per-element issues; no live load/exploit test performed.
- Root audit:0 high/critical,21 moderate/1 low (runtime-only5 moderate/1 low).
  Documentation Zod findings removed;19 unrelated findings remain, including
 10 high/2 critical. Do not describe the whole documentation toolchain as clean.
- Pending integration, full dependency-change CI, AUTH-09 validation and staging
  rollout/smoke. Source node_modules junction was left untouched; testing uses an
  isolated build folder rather than mutating the user's shared dependency tree.

## 2026-10-26 [Codex] SUR-38 production release completed / Issue #751

- PR #754 staged the recommendation PDF layout follow-up; PR #755 selectively
  merged the feature to main; PR #756 synchronized main ancestry into staging.
  Live staging `d33970e412eedf2a2a5ecec66bc637ba1c053a91`, production
  `76af3f9fe64a2c1b50f52f787b12b9a8847257c7`. App and PDF worker share
  the intended image in each environment; unrelated workers were unchanged.
- Production migration `20261026030000` passed a rollback-only rehearsal,
  then applied atomically with one ledger record on CT 110. Existing surat and
  signature counts remained 80 and 353; no historical additional signer was
  fabricated. Private schema and authenticated-only registration ACL verified.
- Four eight-signer PDF fixtures were rendered/visually inspected; the
  recommendation footer now remains on page one when item rows permit. Clean
  Linux focused PDF tests, lint, typecheck and app build passed. Production PDF
  worker rendered PGD, KEU 1, KEU 10 and recommendation test fixtures directly.
  Five public production ready probes returned 200 after rollout.
- Hosted GitHub quality-check jobs did not start due account billing/spending
  limit; this is not CI success. No live production application submission,
  approval, PDF regeneration of existing documents or external resend was used
  for acceptance. Existing stored PDFs remain unchanged until normal publication.

## 2026-10-26 [Codex] SUR-38 PDF verification and production candidate / Issue #751

- User authorized selective staging-then-production release after PDF verification.
- PGD, KEU 1, KEU 10 and recommendation eight-signer PDFs rendered and visually
  inspected, including partially signed documents. Signer identities and pending
  boxes remained visible with no overlap or clipping.
- Recommendation originally moved the eight-signer footer to a mostly empty
  second page. Its unused filler rows now shrink only for seven/eight signers;
  actual item rows remain intact. Re-rendered one page and added regression tests.
- Focused PDF tests, lint, typecheck and frontend/backend build passed locally.
  Remaining: staging PR and coordinated app/PDF-worker rollout, staging smoke,
  production migration preflight, selective main PR, production rollout/smoke.

## 2026-10-26 [Codex] SUR-38 staging rollout / Issue #751

- PR #752 merged from `feature/requester-additional-signers-20261026` into
  staging commit `a9643ac715beff6b7adfadee876db1b6b17ff9cf`. Production
  remains untouched and has no release authorization for this feature.
- Migration `20261026030000` applied only to staging after a successful rollback
  dry-run. Ledger, anonymous/private ACLs, historical signature rows and
  canonical function owners verified. No existing surat/PDF/outbound rows changed.
- App and PDF worker run the same staging image and SHA above. Existing sync,
  outbound and other containers retained their IDs; health live/ready/version and
  registration page all returned 200. A recoverable copy of the prior PDF worker
  filesystem was prepared before deployment because Docker had pruned its image.
- Clean Linux image build, lint, typecheck and 102 affected tests in 11 files
  passed. Real disposable PostgreSQL covered route protection, approvals, draft
  revision, KEU10 threshold and concurrent retry. Nine PDF fixtures passed
  Poppler and eight-signature visual inspection.
- Live browser: Pengajuan Aset draft `035/UAI/PBO.1/X/2026` displayed all three
  Add signer controls; added an active test BM as Memeriksa, moved it before
  the mandatory HRD examiner, saved and refreshed with person/order retained.
  Removed the test addition and restored the original draft. No submission or
  outbound request occurred. Every Buat Baru form shares this editor.
- Hosted GitHub check `121433079598` did not start due billing/spending limit;
  never count it as a pass. Pre-existing high Zod advisory remains; package
  dependencies were unchanged. Production promotion requires a later request.

## 2026-10-26 [Codex] SUR-38 / Issue #751

- Active: `feature/requester-additional-signers-20261026`, isolated from main
  ba813c9. Staging only. Mandatory form steps remain required and retain their
  relative order; requester additions can move before/after a mandatory signer
  in the same Membuat/Memeriksa/Menyetujui group. Existing limit is eight total.
- Atomic registration validates mandatory candidates before a private transaction
  permit initializes additional rows and effective positions. Plan is frozen on
  submit; revision drafts retain addition metadata. KEU10 mandatory finance and
  amount-based director constraints remain canonical; PDF supports added rows.
- Focused tests: 16 UI/helper assertions passed; real disposable PostgreSQL
  verifies required signers, roles, retry, ordinary/KEU approvals, revision and
  threshold correction, and concurrent submit. Lint/typecheck pass. PDF fixtures
  rendered including eight signers, inspected visually without overlap.
- Staging preflight: all 11 versions absent from main are present in origin/staging;
  no unknown ledger version, historical replay or repair. Captured protected
  function/constraint/business/runtime baseline at operator issue751/preflight.json.
  App live 3a27afac, PDF worker 5fef5a38. New migration remains pending.
- Audit reports a pre-existing high Zod advisory and six moderate/one low findings;
  no dependency change or forced major upgrade in this feature. Hosted CI and
  final staged acceptance remain pending. No production change authorized.

## 2026-10-19 [Codex] DASH-03 / Issue #638

- Active: `feature/actionable-role-dashboard-20261019`, isolated worktree from
  production `a69a35983cbdc1a2111f2d9c87371122d6478986`; staging target only.
- Removed obsolete dashboard Agenda widgets; added requester, assigned-signer
  and department/office queues, prerequisite/upcoming separation, SLA drilldown,
  named responsible people and explicit server-targeted reminders (six-hour
  deduplication). Current Work Calendar summary remains.
- User explicitly permits all members to monitor their organizational scope:
  Pusat department, exact KCP, KC plus descendant KCP. Approval rights unchanged.
- Forward migration `20261019090000` pending staging apply; audited live function
  definitions and ledger, no repair/replay. No production authorization/actions.
- Real disposable PostgreSQL tests cover RLS, dynamic hierarchy/cycles,
  inactive/deleted/anonymous actors, queue/history/business SLA and concurrent
  reminders. UI/docs tests and desktop/mobile light/dark visual checks included.
- Remaining: final changed gates, PR/CI, selected staging migration, deployment
  and live acceptance. `docs/PROJECT_CONTEXT.md` absent at task start; durable
  finding: read/detail predicates must not recurse through RLS, while monitoring
  scope never confers approval rights. Runtime proof follows in a dated entry.

## 2026-10-22 [Codex] MRN-27 / Issue #704

- Active: `codex/external-pdf-latest-20261022`, isolated from production d525f498.
- User explicitly requests staging then production: existing external PDF links
  resolve the latest approved publication without resending the business request.
- Main/attachment logical references, immutable attachment metadata history and
  atomic stable-ID replacement retain old objects. Preview/email snapshots stay
  pinned; recommendation links retain canonical fingerprint validation.
- Forward migration `20261022090000` pending real PostgreSQL tests and staged
  rollout. No outbound recovery, new generation, vendor POST or payload rewrite.
- Focused local tests: 68 passed. Remaining: clean Linux gates, database preflight,
  PRs, staging acceptance, selective production promotion and runtime verification.

## 2026-10-22 [Codex] MRN-27 Completed / Issue #704

- Supersedes the pending release status above. Source `704ef70d93719e85a88d6a64b8168fdf96e6e982`;
  PR #705 staging, #706 selective production, #707 ancestry synchronization.
- Live staging `5bbacb456b2211f16bf477299d8ff1625fcee210` contained production
  target before cutover; production `8768534043e947d0c74daa40a471a8f9d93eaf66`.
  Public SHA/health/live/ready/root verified; production workers kept their IDs.
- Forward migration `20261022090000` applied and verified both environments,
  normalized SHA256 `9b2fa427651dd1d8aba3be607680b79973c39098f7d55db527e1d9d4d8179541`.
  Audited known historical lineage drift; no replay, include-all or ledger repair.
  Dispatch rows, original token coordinates/security fields and active attachments
  unchanged during application. Archive RLS/ACLs and service-only RPCs verified.
- Exact-source clean Linux lint/typecheck/frontend+backend builds/diff check passed;
  100 focused tests in eight files and real disposable PostgreSQL assertions passed,
  including repeat migration, immutable archive, stale replacement, actor checks,
  preview single-use, revocation and canonical recommendation resolution.
- GitHub hosted check 119591459656 did not start because billing/spending is blocked;
  this is not CI success. Four existing moderate development advisories remain;
  npm audit high/critical gate passed. No dependency changes in this feature.
- Read-only public acceptance: staging main URL repeated twice, exact canonical
  bytes and no-store; production letter 051 main AND legacy recap URLs changed to
  the latest corrected bytes without mutating their token coordinates or the
  frozen dispatches. Prior physical objects remained byte-identical.
- No vendor POST, resend, new generation, approval, content correction or worker
  rollout. No blockers remain. Vendor-local downloaded copies are outside SIGAP
  URL resolution; archive metadata does not recreate files deleted before this fix.
- Durable finding: bind future tokens to logical document/attachment identity,
  never positional list order; compare publication state again after metadata
  reads so a concurrent revision cannot mix working attachments with old approvals.
  `docs/PROJECT_CONTEXT.md` remains absent; no shared document structure changed.

## 2026-10-22 [Codex] MRN-28 / Issue #711

- Active: isolated `codex/latest-payload-preview-20261022` from main `13739c9`.
- User approved Generate Payload Terbaru: immutable sent history plus current
  canonical candidate, field comparisons, timestamp/validation and JSON export.
- Staging target; asked separately whether to promote this addition to production.
  No outbound resend, new generation, payload rewrite, migration or token mint.
- Read-only capability reuse fails closed when new documents lack existing active
  links. Canonical builder injection also prevents automatic PDF job enqueue.
- Remaining: exact-source Linux gates, UI visual acceptance, staging PR/deployment.

## 2026-10-22 [Codex] MRN-28 Completed / Issue #711

- Supersedes the staging-only/pending status above: user subsequently explicitly
  authorized staging then production. Source `8f56cd60c0318295b017b6ac6655ef8e620c0368`;
  PR #712 staging, #713 selective production, #714 ancestry sync.
- Live staging `1008cb9cdb2ef44bfe607c91963585826a458ec7` contains the production
  target before cutover; production live `aec4be43b3f0d7fe3839af6ad49a51b3dccebd82`.
  Public SHA/health/live/ready/root passed. Workers retained IDs; no migration.
- Exact-source clean Linux npm ci/lint/typecheck/frontend and backend build,
  diff check, 136 focused tests (11 files) and audit high/critical gate passed.
  Four existing moderate development advisories remain, no dependency changes.
  Hosted check 119628988615 did not start due account billing/spending limit;
  this is NOT CI success. TypeScript target incompatibility was corrected and
  all gates rerun; no unrelated baseline assertions weakened.
- Actual component Playwright desktop1440/mobile390 light/dark passed explicit-only
  generation, JSON download, no viewport overflow and no JavaScript errors.
  Mobile warning/comparison/JSON now share one scroll region, footer stays usable.
- Staging protected public API tested 12 existing dispatches: current candidates
  for Asset/Fund/Unit passed; three incomplete samples fail closed with 409.
  Anonymous401/non-admin403 and full before/after hashes of documents, signatures,
  attachments, PDF jobs, file tokens, archive metadata and dispatches verified.
- Production 051 generation 1 AND accepted generation 2 return latest Unit JSON:
  2048 upper/lower1703120/246000;2074 1703120/434492;2173 1826521/1203009.
  Four nominal differences are visible; eight total canonical field changes.
  Both views correctly warn already accepted, even when viewing failed gen1.
  Source/business/file tables and frozen payloads remain byte-identical.
- No vendor business POST, resend, replacement generation, approval, token mint,
  PDF enqueue, database/schema change or worker restart. No release blockers.
  Data in the external system is NOT corrected by generate/copy/download; use a
  separately authorized vendor correction path, not duplicate POST. Existing active
  file links are required; missing links cannot be silently minted by this preview.
- Durable finding: inject read-only document-link resolution into canonical
  builders, block their enqueue fallback and compare document state after reads.
  Previewing already-submitted Units must not issue a send/replacement receipt.
  `docs/PROJECT_CONTEXT.md` remains absent; shared structure unchanged.
# 2026-10-22 [Codex] AUTH-09 Desktop staging integration started

- Issue #718, branch `codex/desktop-sigap-integration-20261022`, main-based.
- User authorized staging preparation and team prompt, not production.
- Isolated device pairing/notifications and own/admin revocation; browser consent
  uses existing account login. No credential sharing with Tauri JavaScript.
- Forward migration20261022120000 and contract/team prompt prepared. Focused
  API tests24 passed; PostgreSQL, UI and deployed acceptance still pending.
- No production changes. `docs/PROJECT_CONTEXT.md` was absent; this task does not
  invent historical project knowledge or change shared-file structure.

## 2026-10-22 [Codex] AUTH-09 Staging Activated, Issue #718

- Previous404 root cause: staging was still1008cb9cdb, #719 remained Draft and
  the selected migration had not been applied. User explicitly requested activation.
- PR #719/#720 merged normally to staging. Live/public SHA
  `cb56ddceca371a25078040d667141dc496ac35d0`; app10ee9c542dbe, image
  `83f54b24a2c80a8902a4a6c5ad62277c76876e173f678438ad1f4c5387867417`, healthy,
  restart0. Main/production untouched. No secret or broad CORS/role change.
- Only forward migration20261022120000 applied, exact SHA256
  c67a65f94a511e2f566447dabed0215e5d58904e8472e0d94c647ee4c880d13b.
  Known ten remote-only historical migrations audited unchanged; no older local
  drift. Three RLS tables and five internal functions service-only verified.
  No migration repair, replay or include-all. Outbound rows remained unchanged.
- Clean exact-merge Linux:27 focused tests, real PostgreSQL17 assertions and
  concurrent exchange exactly one winner, lint/typecheck/frontend+backend build,
  audit high gate passed. First repeated SQL runner hit the image's temporary
  Unix-socket startup; test-only3608d31 now waits for the final TCP listener.
  Hosted checks119721058570/119750532114 never started due billing/spending,
  not CI success. Four moderate development advisories predate this release.
- Public authenticated acceptance passed all seven desktop endpoints.53 temporary
  notifications traversed two pages, own read persisted, foreign read404,
  anonymous401/non-admin403, no-store, desktop/web isolation, rotation and refresh
  reuse revocation, logout preserves web. Synthetic fixtures removed and test
  device sessions revoked; existing inbox and document/vendor data untouched.
- Real public browser: anonymous link presents normal login; explicit consent,
  device exchange, own device page and admin confirmation/revocation passed.
  1440 desktop and390 mobile light/dark: logo loaded, no horizontal overflow or
  page errors. Revoked token immediately401. Screenshots/proofs private on operator.
- All four non-app staging containers retained IDs/images/restart0: PDF,
  external API, sync and outbound. No vendor POST, worker rollout or production
  deployment. App/root/live/ready and public revision smoke passed.
- Deliverable contract and `PROMPT_TIM_TAURI_SIGAP.md` match live staging. Native
  packaged Windows/macOS notifications remain the desktop team's test, not a
  claimed browser capability. Fully exited apps still require future OS push.
  PROJECT_CONTEXT remains absent; no shared-file structure change.
