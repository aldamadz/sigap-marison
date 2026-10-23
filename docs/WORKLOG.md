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

## 2026-10-23 [Codex] OPS-14 / REC-04 / SUR-37 / SEC-01 Completed

- User explicitly approved CT104 production cleanup, then staging and production
  release for recommendation PDF history omission and decimal item quantities.
- OPS-14/#724: only unused build cache older24h pruned with2GB retained;
  observed10.8GiB recovered. Disk84% to65%, final70% after selected builds with
  about17GiB free. Cleanup container/image inventories unchanged; no data, logs,
  images, rollback releases or volumes removed. Record PR#728 remains Draft.
- REC-04/#725 source7221322; SUR-37/#726 sourcee64ebac plusf6437fd; SEC-01/#727
  sourcef70149a. Staging#730/#731/#732, production#733/#734/#735, sync#736;
  revision-total follow-up#737/#738/#739. No whole-staging promotion.
- Final live staging5fef5a38a09cf28ecdf79e23978bdb644de74dd7 contains main;
  productionb5bcb21f67781960ff93df412784b307dc524789 app/PDF sameimagea92556414c.
  Other production services unchanged. Public root/live/ready/version/session/
  maintenance200; Playwright1440/390 both domains passed without business writes.
- Migration20261023120000 applied to both DBs after exact catalog/ledger audit;
  same ACL/owner/flags, no business UPDATE. Exact selected tree matches clean
  Linux tested6fbc0f70fe;271 focused Vitest,88 native tests, real PostgreSQL,
  lint/typecheck/frontend+backend builds and audit high gate passed.30 additional
  revision Vitest and9 native revision checks passed. No full-suite claim.
- PDF recommendations omit printed revision history, not stored audit. Current
  005/011/013 rebuilt/reused with2/5/7pages; actual form/signatures/pagination/
  bounds verified. Prior objects and source/signature/audit/frozen dispatch
  guards passed; no vendor POST/resend/replacement generation. Initial operator
  preview attempts produced extra derived005 PDF jobs, all done; capabilities
  are single-use, so final archive comparison used scoped storage coordinates.
- Decimal item measurements accept positive values below1 with at most6 places.
  Exact line totals round once to whole Rupiah, including revision UI/PDF.
  Unit building counts/IDs unchanged. External Asset still requires integers:
  fail explicitly rather than omit or round a fractional item; vendor contract
  expansion remains separate. Fund serialization tested without vendor POST.
- Newly published DOMPurify high/critical advisories fixed with3.4.17 only;
  four moderate and one low baseline advisory remain. Hosted checks blocked
  before startup by billing, NOT CI success (check120234202725 evidence).
- Missing staging worker rollback image rebuilt from exactfc75b29b38 source;
  worker file/shared output/package-lock hashes matched live worker before
  coordinated cutover. Brief edge503 during replacement cleared at readiness.
- Durable findings: preview tokens are single-use; never poll by re-enqueueing.
  Preserve current/archived PDFs separately and use canonical guarded refresh,
  not a business resend, for presentation changes. Full evidence and remaining
  limits are in docs/releases/20261023-ct104-recommendation-decimals.md.
  PROJECT_CONTEXT remains absent; shared document structure unchanged.
