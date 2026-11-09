# Worklog

## 2026-11-09 [Codex] SLA-03 / Issue #873 Security Correction Candidate

- Forward migration 20261109170000 derives revision pauses solely from canonical events; overtaken unsigned stages still charge. An INVOKER trigger rejects direct lifecycle writes from authenticated/anon, including business admins; canonical definer RPC owners remain trusted. Real disposable PostgreSQL action-clock, KPI/dashboard, RLS and lifecycle assertions pass, including repeat migration and concurrent refresh. Historical intervals remain intact. Exact-lock CI and staging database preflight/rollout pending; production untouched.


## 2026-11-09 [Codex] AUTH-03 Recovery Authorized and Safe Feedback Candidate

- User explicitly authorizes SMTP restoration and production release. Continue
  owned branch fix/password-reset-smtp-20261109 / PR867 / Issue866 from mainc73e2c8.
- Independent no-message transporter.verify confirms SMTP535/EAUTH/AUTH PLAIN in
  production AND staging; TLS remains enabled, no recovery link/email generated.
  Public MX records still target Hostinger. Hostinger connector has no mailbox
  management operation; hPanel session requires operator login, requested via
  secure browser handoff. No provider password or production config changed.
- Login reset dialog now maps HTTP5xx,429 and network failure to safe Indonesian
  feedback, retaining the dialog/retry and never rendering raw provider/edge
  response. Success stays account-independent. No auth/rate-limit/edge weakening.
- Password-reset SMTP logs retain only error code, command and numeric response
  code, not raw reply/message/recipient or recovery URL. Synthetic real-dispatcher
  tests cover503 privacy, success/cooldown, unknown-account feedback and IP limit.
-35 focused tests in5files pass, lint/typecheck/frontend+backend builds pass.
  Initial fresh-worktree tests required build:shared before runtime imports;
  no baseline assertion weakened. Affected gate and staging rollout pending.
  Actual SMTP restoration/production rollout await provider-account recovery.

## 2026-11-09 [Codex] AUTH-03 Password Recovery SMTP Diagnosis (Issue866)

- User reports service_unavailable on production forgot-password. Read-only
  diagnosis only; no new production deployment/config/secret mutation authorized.
- Live SHA c73e2c8, readiness200; app, self-hosted database and Auth healthy.
  Existing application request log confirms Password reset email failed with
  EAUTH, AUTH PLAIN, SMTP5355.7.8. No diagnostic recovery POST/link/email was sent.
- Required SMTP settings are present, TLS465 configured, and every SMTP runtime
  value matches the protected operator environment file; only booleans were
  output. This is credential/account-policy rejection, not stale container config
  or evidence that the SIGAP account's password is wrong. Exact provider-side
  reason still requires authorized SMTP/account verification.
- handlePasswordResetRequest generates the recovery link before SMTP delivery;
  send failure raises503. Maintenance edge maps origin503 to service_unavailable,
  obscuring this dependency-specific failure. Do not bypass edge/SMTP security or
  expose account existence, internal SMTP replies or recovery tokens to clients.
- Pending explicit permission: repair production SMTP credentials/account access;
  separately stage a safe reset-error message. No account/password, database,
  environment, app container, worker, outbound or maintenance state changed.
  PROJECT_CONTEXT.md absent; original dirty workspace untouched.

## 2026-11-09 [Codex] SLA-03 Production Authorization and Compatibility

- User explicitly authorizes production after staging beeb26b and its successful
  guarded deploy42561938182. PR862 selects only the main-based SLA03 branch.
- Production252-version lineage matches the protected MRN30 baseline. Initial
  rollback rehearsal failed closed on compact active-breach SQL formatting;
  no committed production schema or business change occurred.
- New forward migration20261109105900 normalizes only that known compact call
  before immutable20261109110000. Explicit audited order is compat then clock;
  staging already has the clock and compat is a no-op. No blind history repair.
- Real PG17 tests cover compact formatting, unchanged semantics/owner/ACL,
  repeated compatibility before/after clocks and the full action-clock suite.
  Actual production rollback rehearsal now passes:153clocks,21paused candidates;
  business fingerprints and approval/verification guards unchanged. Apply and
  selective main/staging ancestry/production rollout still pending.

## 2026-11-09 [Codex] SLA-03 Local and Staging Rehearsal Checkpoint

- Private interval accounting and existing authorized KPI metadata implemented.
  Readiness includes third-party verification, unfinished canonical recommendation
  (including the deployed next-stage guard), revisions, future intake and inactive
  signers. Own form/upload preparation does not pause. No approval policy change.
- Ready intervals preserve fractions before rounding and accumulated work across
  available-at/revision changes. Concurrent refresh serializes per clock; monotonic
  server timestamps never reject a business write due to an older transaction.
  Indexed current-state reads avoid heavy prerequisite queries on every KPI row.
- New migration20261109110000; clock tables/controls private with RLS, original
  public KPI caller grants/owner retained. Completed history uses legacy clock;
  existing active elapsed is a preserved baseline, not a retrospective correction.
-94 targeted app tests pass; affected gate69tests plus original dashboard SQL and
  SLA03 PG17 clock tests pass. Tests cover repeated migration, waiting/resume,
  fractional intervals, future intake, legacy baseline, authorization, rollback,
  real dependency triggers and two-connection refresh. Lint/typecheck/build pass;
  audit0high/critical18moderate unchanged. No full suite.
- Staging preflight matches protected MRN30 ledger255; exact source SHA256
  d80a88bb1fed79745c0f0a4b8df456bf82263c7f592ea5bf920bc0511cb373af.
  Twice-applied rollback rehearsal passed against actual managed database:22clock
  candidates,3paused; business fingerprints and approval/verification guards
  unchanged. No committed database/runtime changes yet. Hosted CI, apply and
  staging rollout/acceptance remain; production not authorized or changed.
- Separate pre-existing weekly SQL fixture fails with duplicate weekly-rule key
  at this week's boundary. --weekly coverage is retained; --action-clock loads
  the same policy with its own clock assertions, not the unrelated weekly fixture.

## 2026-11-09 [Codex] SLA-03 Action Readiness Clock Started

- Issue858, isolated fix/sla-action-readiness-20261109 from mainb0b2c05.
  User requests pause whenever a signer waits for prerequisites; default target
  staging, no new production release authorization. Root dirty worktree untouched.
- Read-only production diagnosis confirmed active next-step recommendation guard
  blocks2to3 while KPI counts current2 until now. Approval policy is not silently
  changed; all SLA consumers must share actual prerequisite readiness.
- Implement private server interval accounting, preserve already-spent time and
  completed history, expose paused reasons through existing authorized RPCs.
  Initial legacy elapsed is preserved at cutover; no invented past pause events.
  Own input/upload work remains timed. Regression/real PG tests and staged
  catalog/ledger preflight remain required; PROJECT_CONTEXT.md is absent.

## 2026-11-09 [Codex] SUR-41 Examiner Unit Reference Overrides / SUR-34

- Issue852, isolated codex/unit-examiner-editable-reference-20261109 from
  mainaccb8da; user explicitly authorizes staging then production. Primary dirty
  worktree untouched. Original SUR34/LT commit747cbfd selected without its old
  staging ancestry. No production mutation during implementation.
- Shared reference application now seeds missing fields only; explicit edits
  and deliberate clearing survive fresh external reads, autosave and remount.
  Unit type/serial/design/date unlocked; LT raw external only and excluded XLSX.
  Type import enabled and template hints aligned; production code remains derived.
- Canonical builder uses saved examiner values while requiring fresh unit/project
  identity and existing availability/returned-unit checks. Frozen revision
  transport no longer treats approved type differences as foreign identities.
  Blank/oversize/control-character types fail422. Raw references unchanged;
  existing verification actor/time/audit snapshots retained, no new RPC/schema.
- Focused16files172tests pass,1optional supplied-workbook test skipped; lint,
  typecheck/build/diff check pass, audit0high/critical18moderate. Actual Inbox
  test edits all four fields, verifies derived code/autosave/remount and disabled
  LT. XLSX and both PDF table outputs plus canonical logical/frozen payload tests
  retain edits and source identity. No full suite requested or run locally.
- No vendor write, real approval, resend, historical payload/PDF rewrite or
  worker source change. Remaining: hosted gates, staging integration /
  acceptance, then selective production. PROJECT_CONTEXT.md remains absent.

## 2026-11-09 [Codex] NTF-07 Selected Production Promotion

- User explicitly authorizes production for the browser notification fixes.
  Reuse owned main-based branch and Issue845; historical staging-only decisions
  above/below are superseded only for this selected promotion.
- Release activation status restoration on remount/focus, shared control state,
  permission revocation handling and safe retry diagnostics. Explicit popup and
  self-delivery test controls remain gated to the exact staging public build URL;
  neither test control is exposed or executed in production.
- No backend/DB migration, worker source, provider allowlist, recipient audience,
  business document or outbound change. Current live production c2e95a8; live
  staging1268e27. Repeat affected gates, selective main PR, main ancestry sync to
  live staging and public runtime/build/readiness verification remain required.
- PROJECT_CONTEXT.md still absent. Primary dirty worktree/user files untouched.

## 2026-11-06 [Codex] NTF-07 Popup Follow-Up Staging Verified

- Source479ec2b+e8b2fec, PR847 merged1268e27. Final source CI42201443801,
  staging push CI42201791767 and official Deploy Staging42201791834 all SUCCESS.
  Local8files103tests/lint/typecheck/build/diff check pass. No migration or worker
  rollout. Live1268e271285d6cb61ed9c5f07c74effd2b05715b, readiness200;
  app952b0a37b75c healthy; PDF/sync/outbound/external API IDs unchanged.
- Real Tester P3 browser acceptance: separate Tes popup browser / Tes pengiriman
  SIGAP controls visible; popup click successfully awaited showNotification and
  started cooldown without an in-app send. This verifies API acceptance, not
  visual OS-toast delivery or remote Web Push delivery. Permission/Do Not Disturb
  guidance is shown. Positive activation/remount/shared-control behavior is covered
  by synthetic tests, not claimed as a live full-browser acceptance.
- Actual IAB activation/persist returned400 push_provider_unsupported on load and
  explicit activation; safe explanation remains and active status is NOT falsely
  shown. Provider allowlist unchanged. Full Chrome/Edge required for supported
  remote push acceptance; no browser subscription credentials were extracted.
- Production remains c2e95a8f09fcb0d35d4c4d3e8a6c42d0b4e9da21 (read-only check).
  Automatically triggered production run42202427216 cancelled because this task
  is staging only. No production release/data/audience/secret/provider change.

## 2026-11-06 [Codex] NTF-07 Explicit Popup and Activation Restoration

- User clarifies testing the actual device popup, not only an in-app notice.
  Same owned branch/Issue845, staging only. PR847 expands from evidence-only
  into the corrective follow-up; production remains explicitly excluded.
- Separate explicit staging controls: local ServiceWorker showNotification test
  (no server send/email/provider subscription) and existing self delivery test.
  Both retain click-only execution/cooldown and do not claim remote push delivery.
- Activation button checks existing worker/subscription plus server persistence
  on mount and visible focus. No permission prompt or new subscription from the
  status check; no permission-only false success. Stale background results cannot
  overwrite manual activation; status/read errors remain safe and retryable.
- Shared activation events synchronize Settings/header with the automatic
  provider; old in-flight checks cannot undo its completed activation.
- Focused8files103tests, lint, typecheck and build pass. Hosted gate, staging deploy
  and browser popup acceptance pending. No backend/schema/audience/allowlist change.

## 2026-11-06 [Codex] NTF-07 Verified Staging Release

- Source06d5fde; PR846 merged49d7aba. PR CI42176996328 and staging push
  CI42177260800 passed; local affected tests28/28, lint, typecheck and build pass.
  Deploy42177260793 quality passed, but both runner attempts timed out while
  resolving/downloading GitHub Actions, before checkout/deploy. Run cancelled;
  no Runner.Worker remained before the operator fallback.
- Used an isolated exact49d7aba checkout on Ubuntu and unchanged official
  scripts/deploy-app.sh staging, first --check-only then real deploy. All guards,
  environment identity, image/runtime SHA and readiness/root smoke tests passed.
  Live49d7aba10057c350a1f2c1b8eab935b53292408e, app2d1fba7f580c healthy;
  PDF/sync/outbound/external API worker IDs unchanged. No migration/secrets change.
- Real Tester P3 browser acceptance: button visible in Settings/Notifikasi,
  explicit click created one self notification, disabled cooldown displayed,
  unread bell incremented0->1, clicking test opened dashboard and marked it read.
  No email, permission change or business/vendor action. Native OS popup was not
  accepted as verified: this IAB has no active supported push subscription.
- Production remains c2e95a8f09fcb0d35d4c4d3e8a6c42d0b4e9da21 (read-only check).
  Automatic production workflows after cancelled staging attempts were skipped.
  User explicitly excludes production for NTF-07. Operational task completed.

## 2026-11-06 [Codex] NTF-07 Staging Self Notification Test

- Issue845; isolated main-based codex/staging-test-notification-20261106.
  User explicitly requests staging only. Settings button creates one fixed test
  notice for its current account via existing authenticated notification service,
  never email or arbitrary recipient/link/content. No new endpoint or migration.
- Production build excludes the control; no production rollout authorized.
  Cooldown is UI ergonomics, not a new server rate-limit guarantee. Existing
  backend recipient authorization is retained. Popup follows browser consent and
  configured tester audience; successful creation never claims OS delivery.
- Affected tests28/28, lint, typecheck, build and diff check pass. Remaining:
  PR/staging integration, live button acceptance
  with tester and final runtime proof. No production mutation or vendor action.

## 2026-11-06 [Codex] MRN-30 Receipt-Bound Revision Completion

- Forward follow-up20261106093000 is required alongside900. Final review found
  the existing external-revision enqueue still selected succeeded predecessors
  only; accepting a callback alone would leave later Fund reapproval unsent.
  New evidence predicate binds the resolved current revision event/history to
  its receipt, exact predecessor and completed approvals. Original retry and
  unrelated replacement/identity rewrites are blocked by a database trigger.
- Real PG17 fixture covers callback -> requester draft -> resubmit -> approval
  completion -> exactly one fresh pending generation. Original failed payload
  stays unchanged, unsigned/unresolved replacement and completion replay fail
  closed. Two-connection idempotency still passes. Unit path unchanged.
- Migration900 already applied staging after rehearsals, ledger254; app runtime
  staging420fd01 deployed by42162774102. Source0487746 CI42162628010 passed;
  initial staging integration PR841 completed. Production900 was NOT applied.
  Actual010 rejected/revision_required canonical routines both passed inside
  deliberately rolled-back subtransactions; all business fingerprints retained.
- This new930 is never an edit of applied900. Remaining: combined rehearsal,
  source/CI refresh, staging930 rollout and selective production promotion.

## 2026-11-06 [Codex] MRN-30 Missing Fund Callback Receipt

- Issue839, owned isolated codex/external-decision-receipt-20261106 from main539f200.
  User approved the authenticated callback receipt rule, staging then production.
  Production010 remains DONE with only an old main_document422 failed dispatch,
  no decision event and no vendor ID. Authorized vendor GET lookup returns404;
  no business POST or manual success was performed to invent evidence.
- New20261106090000 patches only the exact preserved decision guard with drift
  assertions. Latest posted terminal/unknown Fund payload must still match the
  final document, approvals, hash, number, environment and decision chronology.
  Append-only private receipt is committed only with a real authenticated decision.
  Historical dispatch state/response/payload/hash and external reference remain.
- PostgreSQL17 migration applied twice, rejected/revision/idempotency/rollback,
  wrong environment, no POST, active/new generation, stale/changed/forged payload,
  unsigned/newer approval, KEU/Unit exclusion and private ACL assertions pass.
  Two independent connections produce one decision and one receipt on replay.
- Remaining: affected gates, actual canonical-wrapper rehearsals, staging and
  selective production migration/deployment. No real production callback will
  be manufactured for acceptance; external must retry its own signed decision.
  PROJECT_CONTEXT.md remains absent; no shared document structure changed.

## 2026-11-05 [Codex] CAL-10 Shared Team Calendar Implementation

- Claimed819 on main-based codex/calendar-team-scope-20261105. User approved
  organization read scope independent of reporting, including KC child KCP.
  Default target is staging; no production permission for this new feature set.
- New migration20261105060000 preserves original reporting access and owner-only
  writes, adds active same-department Pusat and branch office read access across
  team search/availability/aggregates/detail/export and entry/event RLS.
- Existing pagination/carryover/date/ACL contracts retained; unknown live RPC
  shapes fail closed pending audit. Disposable PG17 repeated migration and real
  authenticated tests pass peer read/no write/delete, cross-scope isolation,
  office transfer and deactivated/deleted profile cases. Legacy suites run in
  separate databases rather than silently changing historical expectations.
- Other approved work (monthly reception/SLA, durable notifications/reminders,
  post-maintenance What's New) remains separate. No remote schema/data changes
  yet. PROJECT_CONTEXT absent; shared structure unchanged.
## 2026-11-05 [Codex] OPS-18 Completion Release Notice Candidate

- Claimed821 on codex/maintenance-whats-new-20261105 from main; staging only.
  Admin notes publish only on actual complete after start, expire at next WIB
  midnight and remain separate from next schedule. Public status hides draft
  notes; existing signed/CAS controls and maintenance status behavior retained.
- What's New uses the existing maintenance-status query and authenticated
  account preference, no additional status polling. Explicit opt-out is stored
  via new20261105061000, one bounded row/account, authenticated own-user RPC;
  close/X/Mengerti only suppresses the current browser session. Failed durable
  dismissal stays visible with an error, never silently claims success.
- Edge/server15 tests, affected frontend20 tests and actual PG17 ownership/
  duplicate/inactive/anonymous/direct-write assertions pass. Remaining gates,
  responsive/browser acceptance and staging rollout pending. No remote changes
  or production authorization. PROJECT_CONTEXT remains absent.
## 2026-11-05 [Codex] NTF-06 First Push Activation Follow-Up

- Staging package is live at3e66a9e (PR828 / deployment42008023544). Tester P3
  successfully saved notification preferences, but in-app browser push activation
  failed. No test push has been sent; popup acceptance remains incomplete.
- Source inspection identified a first-install race: register() can resolve
  before a worker is active. Subscription now waits for serviceWorker.ready,
  bounded15seconds with timer cleanup; provider AbortError becomes an actionable
  sanitized status rather than a false success or raw provider error.
- Five service regressions and four preference UI cases pass; affected lint,
  typecheck and frontend build pass. Normal Chrome comparison requested because
  an embedded browser may not provide a functioning push provider. This fix is
  staging-only, with no migration, provider allowlist relaxation or auto-prompt.

## 2026-11-05 [Codex] NTF-06 Notification Delivery Candidate

- Issue823; owned `codex/notification-delivery-20261105`, based on main f38df45.
  User selected browser popups, approved organization reminders and calendar
  reminders; Ticketing deferred. New package targets staging, not production.
- Durable bounded planner/leases, sanitized generic push, provider revalidation,
  retry/ownership/preferences, canonical login/task navigation and settings
  implemented. No old notification backfill or business/outbound actions.
- Real PG17 twice-applied assertions and two-connection single-winner delivery
  pass. Synthetic provider/network fixtures, landing/login/permission UI tests,
  existing inbox approval/revision regressions, lint/typecheck/build run locally.
- A regression test exposed the old URL-clearing effect selecting an unrelated
  task when the intended task was absent; removed that fallback, retained normal
  initial selection and composite approval/verification identity.
- Remaining: final source gates/PR, live staging DB rehearsal/rollout with
  tester-only audience and explicit browser acceptance. Department monthly
  receiving/SLA policies are a separate remaining work item, not implemented by
  this notification candidate. `docs/PROJECT_CONTEXT.md` remains absent.
## 2026-11-06 [Codex] SLA-02 Weekly Reception / Scoped Delegation

- Issue825 continues on its owned main-based SLA branch. User explicitly
  authorized staging then production, including the prior department package.
- Added forward migration20261106060000: optional default-off department policy,
  regular/specific ISO-week windows intersecting monthly closing, own-department
  managers assigned only by admin, dynamic transfer/revocation checks and audit.
  Signer SLA remains independent when optional policy is off; historical frozen
  snapshots are not rewritten. Closed intake moves to the next valid period.
- Real PostgreSQL17 repeated migration and legacy/monthly regressions pass,
  including exact Thursday16 cutoff, ISO year boundary, holiday/break, weekly
  exception, monthly intersection, forbidden delegation, default off and immutable
  stage hold. New --weekly gate remains focused; no whole-suite expansion.
- UI work isolated with agent on codex/sla-weekly-ui-20261106; parent owns SQL,
  test runner and shared status docs. Review and rollout remain pending.
  No business submission, approval, vendor resend or production mutation yet.

## 2026-11-05 [Codex] SLA-02 Monthly Receiving Candidate

- Issue825; main-based owned `codex/department-receiving-periods-20261105`.
  Staging only. User approved moving closed intake to the next period rather
  than rejecting it; monthly SLA/receiving overrides are separate from defaults.
- New rules/admin audit, immutable per-stage processing snapshot, bounded
  working-day/holiday reopening and canonical future-availability enforcement
  implemented. Completed/historical signatures are not backfilled or rewritten.
- Future stages stay out of actionable inbox/count, SLA breach and running SLA.
  Signature/verification writes and manual reminders reject early processing.
  Limited progress detail exposes only reception date/message, not internal rules.
- PostgreSQL17 applies migration twice and checks exact cutoff, monthly override,
  month/year rollover, holiday/weekend/break, snapshot forgery/clock immutability,
  early actions, RLS/admin audit and existing dashboard reminder concurrency.
  Nineteen focused UI/validation/dashboard tests pass; final gates, actual staging
  shape rehearsal and deployment remain. No production or vendor action.

## 2026-11-05 [Codex] SUR-40 Searchable Registration Choices

- Issue813, main-based `codex/registration-search-20261105`; staging then
  production authorized together with SUR39. Shared native Command/Popover
  project selector covers standard/KEU/PGD and separate SPK Unit contexts.
- Search accepts project name/code/office. Existing signer search now includes
  job/department/office, still filtering only pre-authorized eligible candidates.
  Numbered context locking, Unit revision eligibility, disabled external projects,
  no-project choice, input callbacks and stored identities remain unchanged.
- Searchable control uses a modal popover to avoid focus restoration from the
  previous form selector closing the new search. Tests cover typing, keyboard,
  empty state, no-project, disabled controls, reopen/reset and real form revision.
-159 related tests/27files, lint/typecheck/frontend build pass. No dependency,
  migration, API, approval or vendor POST changes. Browser/runtime rollout pending.
  PROJECT_CONTEXT absent; shared document structure unchanged.

## 2026-11-05 [Codex] SUR-39 Signer Organization Progress Scope

- Issue812, main-based `codex/signer-scope-monitoring-20261105`; user explicitly
  authorized staging then production. Members see progress when an active signer
  belongs to their Pusat department, exact KCP or KC descendant scope. Current
  profile/hierarchy drives transfers; no snapshot or manual ACL backfill.
- New read-only helper updates monitoring list/detail/count and dashboard team
  scope. Original can_read_surat/can_monitor_surat_scope, document RLS, reminders,
  inbox, approval and mutations stay unchanged. Newly visible progress strips
  private input/files/attachments/signature snapshots. Dashboard suppresses
  reminder controls when the old write-authorizing monitoring scope is absent.
- PostgreSQL17 tests cover both the original dashboard regression/concurrent
  reminders and new cross-requester scope, pagination, department/KC/KCP isolation,
  transfers, disabled/deleted profiles, anonymous denial and private-file refusal.
  New migration applied twice in disposable database; all assertions passed.
- Updated dashboard/monitoring guidance; reviewed only those intended content
  changes before refreshing the user-doc fingerprint. Lint/typecheck/build pass;
  focused runtime tests passed. Real-environment rehearsal and rollout pending.
- MRN29 now independently live production84a494a/staging8c7df66. Both compiled
  no-send acceptance gates and public health passed; receipt history untouched.
  PROJECT_CONTEXT remains absent; no shared document structure changes.

## 2026-11-05 [Codex] MRN-29 Staging Database Applied, Runtime Pending

- IntegrationPR810 merged8b57f3e after hosted Quality41966316475 SUCCESS;
  selectivePR809 targets main and must wait for live staging acceptance. Old765
  closed as superseded, not reported as a successful historical deployment.
- Selected migration20261103160000 SHA256
  e8bc7a89cf9ea8fc526532cb0b4cf9c4eac4f0f4f7b7320621f58dd9cec59c07
  rehearsed with rollback on both real schemas and applied only to staging.
  Exact source-related selection passes171 tests/20 files; no full-suite bypass.
- Protected SUR30 preflight comparison proves each current legacy ledger is
  unchanged except the already authorized20261104160000. Stage245/prod242
  versions before this change; no repair/include-all/replay of historical drift.
  Stage now246. Routing: stage35PGD allowed,1KEU and6HRD blocked; production
  rehearsal62PGD allowed,31KEU and10HRD blocked. Private service-only ACL passes.
- Production read-only evidence confirms14 KEU receipts succeeded today around
  09:13-09:17WIB. Preserve all22 historical KEU dispatches, payloads and receipts;
  no external cancellation/deletion or repeated POST authorized. No active unsent
  ineligible job at preflight. Transaction assertions preserve document/signature/
  revision fingerprints and allow only specified unsent dispatch retirement.
- Remaining: staging app deployment41966678302 with selected migration ACK,
  compiled no-send acceptance, mainCI/promotion, ancestry sync and production.

## 2026-11-05 [Codex] MRN-29 Release Resumed After Explicit Authorization

- User reports Kas Kecil still reaching Procurement and authorizes staging then
  production. Diagnosis: original PR765 remains unmerged; its prior Zod audit
  blocker was fixed separately, not a completed KEU release. Ticketing deferred.
- Current-main candidate `codex/keu-procurement-release-20261105`, PR809, carries
  only the existing MRN-29 boundary. Preserve both new routing authorization and
  MRN-802 returned-Unit validation before logical/frozen transport construction.
- Real PostgreSQL17 twice-applied migration and no-POST assertions pass. Focused
  runtime/unit/file-link/routing tests66/66 pass after building shared outputs;
  Unit fixtures allow only the new read-only form RPC, still rejecting all writes.
  Lint, typecheck, frontend/backend builds and high/critical runtime audit pass.
  Four pre-existing moderate runtime dependency records remain; no lock changes.
- Remaining: audit current environment ledgers, transaction rollback rehearsals,
  exact integration CI, selected migration, staging runtime acceptance, selective
  main promotion and staging ancestry, production rollout/acceptance. No live
  migration, dispatch cleanup, approval, vendor POST or resend at this checkpoint.
- PROJECT_CONTEXT remains absent; no shared document structure change.

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
## 2026-11-03 [Codex] MRN-29 Implemented, Release Held By Existing Security Gate

- Source877ea0a on `fix/keu-procurement-outbound-boundary`; staging integration
  PR#765 (PR#764 superseded because of a documentation-only merge conflict).
  All KEU blocks before preparation/materialization/recovery/POST; only trusted
  PGD is eligible. Historical stored payload remains viewable. Poll cleanup
  handles newly ineligible unsent leases without starving remaining PGD work.
- Clean Linux lint, full typecheck, frontend/backend build and 83 focused tests
  passed. Additional offline BFF acceptance3/3 passes, including frozen KEU
  rejection409 with zero file mint/storage read. CI41607935629 affected quality
  gate passed after its acceptance mock was updated; final audit failed.
- Existing production-dependency audit:1high Zod (<4.6.6, suggested major4.6.7),
  5moderate,1low. No dependency/lock change was made by this feature. Do not
  merge/deploy by bypassing audit; a separately scoped compatibility/security
  fix is required before rollout. Latest SQL-only follow-up passed real PG17.
- Staging Management API preflight read35PGD/1KEU1/6HRD documents,42surat and
  179signatures. Ledger audit: only new version20261103160000 is local-only;
  11older remote-only entries (including staging AUTH09) were inventoried, no
  repair/include-all used. Active function definitions backed up privately.
  Both migration rehearsals used BEGIN/ROLLBACK and passed (7non-PGD blocked).
  No live migration/queue/approval update, app deploy, vendor POST or resend.
- Runtime staging remainsd33970e412eedf2a2a5ecec66bc637ba1c053a91; production
  unchanged and not authorized by this request. Remaining: resolve the existing
  audit blocker, rerun exact integration gates, apply selected staging migration,
  deploy and accept staging; production needs explicit authorization.


## 2026-11-03 [Codex] MRN-29 Procurement Boundary In Progress / Issue #411

- Owner clarified all KEU ends in SIGAP pending Finance gateway; only PGD
  dispatches to Procurement. Claimed on Issue #411; branch from current main,
  default staging only. Production not changed or authorized by this request.
- New private SQL routing helper uses persisted form numbers with KEU veto and
  strict PGD allowlist; category alone cannot grant outbound. Gates enqueue,
  claim, preparation/reopen/replacement/POST updates. Legacy active pre-POST
  jobs are skipped without deleting evidence; posted history remains unchanged.
- Backend checks canonical routing before building or materializing frozen
  payloads and before latest/Postman/recovery/replacement; stored evidence
  remains readable. Removed the now-invalid KEU-to-Procurement item conversion.
- PostgreSQL17 disposable test passes twice-applied migration and assertions.
  Local lint passes. Parent node_modules link has stale @sigap/shared outputs,
  causing unrelated local typecheck/Unit test failures; clean Linux gate is
  required before any rollout. One stale source-string assertion was updated
  to the existing four-argument file-link call (not a production code change).
- TOS impact: this enforces the existing purpose-based integration boundary,
  adds no new collection, recipient, consent or user obligation. No legal text
  change needed. PROJECT_CONTEXT is still unavailable.


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
