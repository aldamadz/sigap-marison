# Selected release: KEU 1 project, PDF opening, outbound date

Status: candidate, not deployed. Owner authorized staging followed by production,
and the dependency remediation needed to pass the release audit gate.

## Scope and source

Base main: `d91d468f16517bd4477e80d67d6f3263026c9f5d`.
Integration branch: `release/keu1-project-pdf-outbound-20261005`.
This branch combines only the selected feature branches; it does not merge staging
into main. Retain the source branches for follow-up fixes.

| Source branch | Included head | Effect |
| --- | --- | --- |
| `feature/keu1-optional-project-01` | `7cf06474b9dd861f11067ab1ad68171cfafbc92d` | Branch KEU 1 optionally uses a ready own-office project; no-project numbers omit `-000`; headquarters remains project-free |
| `fix/pdf-preview-wait-latency-01` | `48f89121e61844b27dc405c71a55fc11fdd11328` | Lean authorized PDF preview lookup, concurrent job reads, earlier browser polling and immediate failed-job reporting |
| `fix/production-code-outbound-date-01` | `5da6bb0dcdd2c1316cfe012c541425d66738f802` | Outbound production-code date becomes `dd/mm/yyyy`, without changing stored ISO dates |
| `fix/release-dependency-gate-01` | `0d823bbefa16cbfb152a3414af7170642a899c71` | Tailwind 4 compatibility, DOMPurify update and removal of the obsolete tagging dependency chain; dependency audit returns zero vulnerabilities |

PDF authorization, fingerprint/source cache, file tokens and worker backoff are
preserved. Worker sources/renderers are unchanged; no worker restart is required
by this delta. Historical documents, numbering and outbound generations are not
rewritten or replayed. Staging fixtures are not promoted.

## Verification actually performed

- Combined `npm run quality:ci` passed at integration head
  `7c28265238d2dd249d45b9be7b0dceec34b15f4f`: 196 files / 1,879 Vitest tests,
  lint, frontend/shared/backend typecheck, document/PDF/storage suites and build.
- The later SQL-only corrective commit normalizes LF/CRLF patch literals. The
  real disposable PostgreSQL canonical integration runner passed after applying
  the optional-project migration repeatedly with both newline encodings.
- Final backend build passed at `c30f08bcbea4867a26c4e06ec0045aeaa51227f2`.
- Clean workspace installation and dependency audit: zero vulnerabilities.
- Headless Chrome CSS/control fixture comparison: 1440/768/390px, light/dark;
  identical measured dimensions, no horizontal overflow. This is not a logged-in
  application acceptance test. Actual PDF click-to-open timing remains untested.
- Merge-tree rehearsal with `origin/staging` at
  `e761fceb55cb65042fc7e74a41a5388b32fdce21` reported no conflicts. This does not
  replace CI or tests against the eventual staging integration commit.

## Database preflight (read-only)

Only new migration: `20261005090000_keu1_optional_branch_project.sql`.
It narrowly patches `enforce_surat_registration_branch_project()`, preserving
reservation/owner/office/entity/scope checks and failing closed on unknown bodies.
No new migration has been applied by this release task.

Staging history, compared with the staging tree plus this migration: no remote-only
versions; the only pending local version is `20261005090000`. Latest remote version
is `20261001130000`.

Production has pre-existing migration-ledger drift. Against the selected main
tree: 191 local versions, 198 remote records, 55 matching versions, 77 different
versions with matching normalized names, 59 unmatched local and 66 unmatched
remote records. Matching names alone do not prove SQL equivalence. Seven of the
unmatched local names have remote name variants; others may be superseded by
later recovery migrations, but this has not been proven for the full history.
Do not replay those historical migrations, bulk-repair history or use
`--include-all`. Production migration rollout remains held until the discrepancy
audit supplies a reviewed, exact execution plan.

Both environments currently have the expected old KEU 1 guard and reservation
type guard. Their function-definition MD5 is identical:
`46942c4ddad311e5b7a511224d7d788a`. This is prerequisite evidence for the narrow
patch, not proof that the complete migration histories are equivalent.

Live runtime baseline read through the authorized operator path:
staging `e761fceb55cb65042fc7e74a41a5388b32fdce21`, production
`d91d468f16517bd4477e80d67d6f3263026c9f5d`.

## Rollout gates

1. PR the selected integration branch to staging. Verify exact head, CI and
   integration content; merge through PR, not direct branch push.
2. Recheck staging ledger and function body, save recoverable schema/function
   evidence, apply only the new migration with exact ledger tracking, and verify
   the new guard and unchanged business records.
3. Deploy only the staging app using the merged SHA and acknowledge only the
   actually applied migration. Verify image/runtime SHA, health, static assets,
   authenticated KEU 1 project/no-project flows and PDF opening from detail/signer.
4. Resolve the production migration audit before production DB operations. After
   staging acceptance, promote the same selected source branch by PR to main.
5. Sync the resulting main SHA back into staging by PR and deploy staging first.
   Production's target must be an ancestor of the live staging build.
6. Apply only the reviewed production migration, then app-only deploy and smoke.
   Record exact SHAs and timing; no automatic outbound recovery or document replay.

If app deployment fails, retain/redeploy the previous image through the existing
deployment rollback procedure. The new guard is backward-compatible with prior
no-project KEU 1 requests. Do not revert migration history or existing business
records as an application rollback.
