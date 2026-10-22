# Worklog

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
