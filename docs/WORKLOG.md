# Worklog

## 2026-11-03 [Codex] OPS-16 Group Privacy And Landing Navigation Live

- Source `aeb22ce` released to staging page Worker, then production after
  acceptance. Public `/privacy` is now group-wide v2.0; `/terms` v1.2 points
  to it. Both have Beranda/Privacy/TOS/Status navigation, theme controls,
  canonical metadata, dates and history. Original Absensi source stays intact.
- Production landing visibly has Ketentuan in its existing header and
  Privacy Policy/Terms of Service/Status layanan in its existing footer.
  Desktop and 390px browser acceptance: links navigate correctly, header nav
  remains visible on mobile, no horizontal overflow, light/dark work and no
  console errors. Staging uses an explicitly labeled navigation fixture.
- Added only `marisoncloud.com/*` route, id
  `b5c035fbb093469bb8ab8ec52173bb13`, to existing `marison-status-page`.
  All eight pre-existing zone routes were compared and unchanged. Cloudflare
  does not support query parameters in route patterns, so exact pathname
  guards in the handler limit HTML enhancement to root. Root including query,
  privacy/terms including trailing slash, assets and `/api/health` HTTP200;
  main landing CSP remains intact. Other methods/paths pass to origin.
- Thirty-nine focused tests, scoped ESLint, bundle build/syntax and diff checks
  pass. Existing parent dependency audit (1 high Zod, 5 moderate, 1 low) remains
  outside this dependency-free Worker; no parent app build or deploy was done.
  No DB, auth, business record, SIGAP app/worker, DNS or origin restart changes.
  Source PRs #762/#763 remain unmerged operations records, not a CI-success claim.
  Policy text should still receive responsible owner/legal review; no compliance
  certification is claimed. PROJECT_CONTEXT remains unavailable.

## 2026-11-03 [Codex] OPS-16 Group Privacy And Landing Navigation Candidate

- Owner explicitly requested group-wide Privacy and discoverable Terms on the
  main landing and related pages. Privacy v2.0 and TOS v1.2 share canonical
  links, version/history and light/dark controls. Previous Absensi source is
  preserved, not redeployed from the dirty Maris Drive checkout. This update
  supersedes earlier notes saying Privacy remains Absensi-only.
- Root HTML enhancement is limited to public main-host successful HTML GET;
  same-origin script adds header/footer links after React mounting, and a
  server-rendered footer remains when JS is unavailable. CSP is retained;
  body validators removed. API/assets/errors pass through. Staging fixture
  is explicitly not a complete landing clone. No auth/DB/business changes.
- 39 focused tests, scoped lint, bundle build/check and diff check pass.
  Root npm audit still reports unrelated existing dependencies (1 high Zod,
  5 moderate, 1 low); the deployed Worker has no third-party dependencies.
  Staging/production rollout and browser acceptance pending at this entry.
  Claim recorded in Issue #760; source PRs #762/#763 remain operations-only.

## 2026-11-03 [Codex] Terms scope wording corrected by owner

- Supersedes the earlier named-exclusion wording: the owner clarified that
  unaffiliated applications must not be mentioned at all. TOS v1.1 now applies
  only to services owned or officially operated by Marison Regency Group.
  Public body, metadata and rendered history contain no third-party app name.
  Initial public history summary was corrected explicitly at the owner's request;
  original source remains available through Git, not on the public page.
- Released `16ff1d0` to staging then production page Worker. Both canonical
  main-host and status-host Terms return HTTP200 with v1.1 and verified clean
  wording. Thirty-four tests, scoped lint/build/diff pass; no route, DB, service
  ownership or unrelated app change. Future TOS review policy updated to match.

## 2026-11-03 [Codex] OPS-16 themes and platform Terms published

- Released `f54022b` to staging then production page Worker. Light/dark/system
  controls apply before paint, persist locally, and tolerate unavailable storage.
  Status/modal/Terms follow theme; reload, mobile overflow and browser-console
  acceptance passed. Thirty-four focused tests, scoped lint/build/diff passed.
- Footer links to the user's Privacy Policy and new canonical
  `https://marisoncloud.com/terms`. TOS v1.0 covers all Marison Cloud services
  except XAU, including explicit service/data/AI/status/feed boundaries and
  dated history. Existing privacy page remains Absensi-specific, which the TOS
  states; no silent expansion or legal-review/compliance guarantee is claimed.
- Added only route `marisoncloud.com/terms*` to the existing status Worker;
  canonical Terms and local theme/logo assets serve without D1. Other matched
  main paths pass through. All old routes unchanged; main root/privacy HTTP200
  bodies have identical SHA-256 before/after. No app restart, DB migration,
  XAU change or modification to the dirty Maris Drive checkout.
- User explicitly requires future relevant changes to keep TOS updated:
  `docs/legal/TERMS_MAINTENANCE.md` is the required release-review checklist.
  Review every service change; version/date/history must change when terms do.
  Material legal/commercial changes require owner/legal review, not autonomous
  publication. Source PR #762/#763 remain unmerged operations records.

## 2026-11-03 [Codex] OPS-16 subscription dialog and Atom released

- Staging then production page Worker released from `d5745ec`. Berlangganan
  opens a native dialog matching the user's reference layout: RSS/Atom readonly
  URLs, Lucide copy/close icons, accessible copy feedback and manual fallback.
  Escape restores focus, close works, mobile dimensions remain within viewport;
  open dialog is not interrupted by timeline auto-refresh.
- Added real Atom 1.0 at `/feed.atom` (alias `/atom.xml`), and `/feed.rss`
  alongside the existing `/rss.xml`. All endpoints parse as valid XML and
  return 200 with their correct media type in staging/production. No email or
  push subscription system implied. Production copy action and browser console
  passed; 28 focused tests, scoped ESLint, Worker build and diff check passed.
- No D1 migration, probe/maintenance Worker or SIGAP app change. Source remains
  in selective main PR #762 and staging integration PR #763, not auto-merged.

## 2026-11-03 [Codex] OPS-16 current condition and RSS released

- Staging then production page Worker released from `dccc773`. Current condition
  uses latest probe: UP only when both checks pass, DOWN on any failure, and
  BELUM DIKETAHUI for missing/stale data. Historical four-color ratios unchanged.
- `/rss.xml` serves RSS 2.0 for observed UP/DOWN changes, incident handling,
  and maintenance; stable GUIDs, bounded queries, XML/HTML-safe content, and
  503 on database error. RSS reader subscription/polling is required; no email,
  WhatsApp, browser push or subscriber storage was added. Maintenance edits
  retain the same GUID; reader-specific update notification behavior applies.
- Twenty-six focused tests, scoped lint, Worker build/diff check pass. Live
  staging/production feeds parse as XML; production repeat fetch keeps GUIDs
  stable, page shows RSS link and four UP conditions, browser has no errors.
  No schema, probe/maintenance Worker or SIGAP application deployment.

## 2026-11-03 [Codex] OPS-16 four-color daily history released

- Staging acceptance then production page Worker uploaded from `af4879b`.
  Daily healthy-sample ratios now map to green 100%, yellow 99-<100%, orange
  95-<99%, red <95%; absent data remains gray. Current service condition and
  raw/daily observations are unchanged. Tooltip/selection show percentage and
  sample count. Maris Drive and Marison Cloud correctly render yellow today.
- Twenty-two focused tests including exact threshold boundaries, scoped lint,
  Worker build and diff check passed. Live production API/page and desktop/mobile
  legend/click acceptance passed without browser errors. No DB migration,
  probe/maintenance Worker upload, SIGAP app deploy or incident rewrite.

## 2026-11-03 [Codex] OPS-16 source PR conflict isolated / Issue #760

- Closed superseded PR #761. Replacement staging PR #763 starts from staging
  and contains byte-identical `ops/status-page` source from production candidate
  `1f0b081`, with additive staging documentation. Selective main PR #762 remains
  separate. This corrects the earlier open/conflicted PR status without bringing
  unrelated staging application changes into the production candidate.
- Runtime remains live as verified below. Source PRs are deliberately unmerged
  pending coordinated app-workflow handling; do not claim CI success or merge.

## 2026-11-03 [Codex] OPS-16 production status integration live / Issue #760

- Production D1 export was saved locally and SHA-256 verified before change;
  Time Travel bookmark captured. Applied status history/events migration, then
  SIGAP maintenance source migration. Backfilled raw/daily counts match for all
  four services. The production probe is bound only to
  `sigap-maintenance-production` and recorded production revision 0. No active
  schedule exists; no test incident or maintenance remains in production D1.
- Production `https://status.marisoncloud.com/`, `/api/status`, `/app.js`, and
  `/logo.png` return 200. Four services report current observations; 30 daily
  bars, click interaction, desktop and mobile layout, and browser console
  passed. The public Worker remains read-only. SIGAP app, DB/Auth, outbound,
  and maintenance Worker were not redeployed or modified.
- Source PRs #761 to staging and #762 to main are open, not merged. A merge
  would start the repository's SIGAP app deployment workflows despite an
  ops-only diff. The root npm audit reports one pre-existing high `zod`
  advisory; the status Workers have no npm dependencies. Twenty-one focused
  tests, scoped ESLint, syntax check, build and diff check passed. Coordinate
  source merges with a normal app release window or a reviewed path filter.
- Postrelease verification: production maintenance revision still matches 0;
  all four services have 296 raw and daily samples. PR #761 reports a merge
  conflict against staging; #762 is clean but quality-check is still running.
  Resolve source integration without merging unrelated staging into the
  production feature branch. Neither PR is claimed merged or CI-successful.

## 2026-11-03 [Codex] OPS-16 SIGAP maintenance integration staging / Issue #760

- Added forward-only D1 source/revision migration and Service binding to the
  existing SIGAP maintenance Worker. Staging cron read revision 17 from the
  staging edge state without changing it. An isolated D1 insert/upsert rehearsal
  passed and its disposable record was deleted. The staging status page has a
  visible preview banner; production domain still serves the earlier version.
- SIGAP outages remain probe-derived. Incident investigation, confirmed cause,
  monitoring and resolution are operator-authored D1 timeline entries; no
  public write route or fabricated incident cause was added.
- Next: final gates and source PRs, production D1 export/ordered migrations,
  production Worker rollout with internal binding, live smoke and postrelease
  revision check. Do not point production at the staging maintenance Worker.

## 2026-11-03 [Codex] OPS-16 staging history/timeline acceptance / Issue #760

- Staging page and probe Workers are live on the separate staging D1. Four
  public services are fresh/up; real raw and daily counts agree per service.
  History-bar click, desktop/mobile layout without overflow, status API and
  browser console passed. Simulated incident/maintenance records were removed.
- Seventeen focused tests and the status Worker build passed. Versioned,
  uncached `/app.js` prevents stale script behavior after page updates.
- Source branch `feature/status-marisoncloud-page` awaits a staging PR.
  Production domain, Workers and D1 remain unchanged for this follow-up.
  Next: selective production promotion only after explicit request, with D1
  backup and forward migration before uploading the probe.

## 2026-11-03 [Codex] OPS-16 status history and incident follow-up / Issue #760

- In progress on `feature/status-marisoncloud-page`: 30-day daily uptime bars,
  sampled availability plus coverage, planned maintenance, and incident
  timeline. Operator writes use validated D1 queries and a production flag;
  the public Worker remains read-only.
- New D1 `marison-status-staging` and separate staging probe/page Workers were
  created. `schema.sql` and forward migration applied there only. D1 duplicate
  insertion rehearsal confirmed `changes()` prevents double counting (1 then
  0 changes); test rows were removed. Fifteen focused tests pass. Staging
  preview serves all assets; simulated incident/maintenance are being used for
  visual acceptance and must be removed before handoff.
- Production status Worker, D1 schema and domain have not been changed for
  this follow-up. Remaining: cron evidence, final responsive acceptance,
  remove staging fixtures, source push/PR and explicit production request.

## 2026-11-03 [Codex] OPS-16 live Cloudflare rollout / Issue #760

- `https://status.marisoncloud.com` is live on the `marison-status-page`
  Cloudflare Worker. `marison-status-probe` runs every minute on workers.dev;
  D1 `marison-status-prod` records real checks. At release, all four services
  returned `up` across two scheduled rounds. Final domain returned HTTP 200
  for page, API, JavaScript and logo. Manual refresh advanced to the next
  sample with no browser error; desktop and 390px mobile were inspected.
- The page Worker serves from D1 and embeds its own logo. It has no origin
  dependency or production SIGAP app/data change. Probe's public fetch route
  returns 404; page workers.dev preview and temporary canary were removed.
  Cloudflare zone/account failure remains a shared dependency. Availability
  stays "Belum cukup data" until ten samples exist, then uses seven-day samples.
- Source commit `f9b680d` was pushed on the feature branch. GitHub MCP opened
  an interactive confirmation form for the staging PR but did not create it;
  CLI token cannot read pull requests. Do not claim a PR or merge yet. Because
  SIGAP's staging/main push workflows deploy the app even for ops-only changes,
  source merge requires coordination; the independent status service is live.

## 2026-11-03 [Codex] OPS-16 public status page / Issue #760

- Active branch `feature/status-marisoncloud-page` from main in an isolated
  worktree. Cloudflare D1 `marison-status-prod` and scheduled probe Worker were
  created outside SIGAP; the page Worker is built but not yet attached to the
  production custom domain. DNS/custom-domain audit found no prior `status`
  record or route. Four public endpoints and four health endpoints were
  established; first scheduled sample and public smoke are pending.
- Ten focused tests pass for healthy, degraded, down, stale, malformed and
  database-unavailable paths. No credentials, document URLs or business POSTs
  are used. Next: verify real cron samples, attach custom domain, inspect
  desktop/mobile layout, create PRs and record deployment result.

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
