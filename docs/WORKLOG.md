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
