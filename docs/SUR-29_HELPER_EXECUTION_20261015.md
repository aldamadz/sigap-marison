# SUR-29 Private Helper Execution Correction

Issue: https://github.com/aldamadz/frontend/issues/608

## Root Cause

The 20261014182000 office guard calls the task-bound recommendation helper even
for ordinary drafts. Staging's guard and helper are both owned by `postgres`.
Self-hosted production's existing guard is owned by non-superuser `postgres`,
but the newly created helper is owned by `supabase_admin`. Its owner-only EXECUTE
ACL therefore blocks the guard. Definitions are identical across environments;
the difference is ownership and effective privileges, not user office access.

Earlier staging claim/update acceptance did not reproduce the mixed-owner layout
or ordinary initial INSERT. This is a regression of the preceding lifecycle fix,
not an instruction to give users wider database privileges.

## Correction and Safety

Forward migration `20261015110000_registration_draft_helper_execution.sql` grants
only `postgres` EXECUTE on the private helper. It first verifies the expected
SECURITY DEFINER context and rejects unexpected API-role privileges/inheritance.
No function body/owner, RLS, API endpoint, document, number or task is changed.
`anon`, `authenticated`, and `service_role` retain no direct helper EXECUTE.

Operator preflight compares the three preceding affected migration ledger hashes,
the canonical create/claim/office/helper definitions, and the selected new version.
Existing unrelated imported ledger drift is not repaired or included in a push.
Apply the selected SQL and exact-source ledger entry atomically; verify hashes,
owners and unrelated ACLs afterwards. No blind `db push` or migration repair.

Staging SQL application was verified, followed by rollback-only real RPC/RLS tests:
ordinary draft initial creation, RPC upsert, direct owner save, canonical
recommendation claim/save on USED reservations, and rejection of forged task IDs.
No number allocation, submission, approval or outbound job was committed by QA.
Production promotion and final runtime evidence belong in the issue/PR release log.

## Regression Coverage

- `node scripts/test-letter-number-reuse-sql.mjs --draft-lifecycle
  --draft-helper-baseline`: expected failure with the exact production permission
  error before the grant; the pre-fix failure marker is checked explicitly.
- The same runner without `--draft-helper-baseline`: PASS, including the existing
  lifecycle/reuse/concurrency checks. A separate disposable bootstrap superuser
  allows `postgres` to be demoted to a true non-superuser for this regression.
  Private helper/lifecycle functions are owned by the separate fixture superuser.
- Apply the correction twice to test idempotency. Execute ordinary create/save
  under `authenticated`, valid USED-number recommendation updates, forged
  office/task/actor rejection, and API-role helper denial checks.
- `npm run test:changed -- 08a9cbae1b7fbfab911b90f493e4181f01660a43`:
  branch Fund numbering and draft lifecycle PostgreSQL suites PASS.
- Seven focused draft/office/recommendation Vitest files: 37/37 PASS.
- Lint, typecheck, frontend build PASS; production dependency audit: 0 vulnerabilities.
  Clean install reports two pre-existing moderate development vulnerabilities;
  no dependency or lockfile changes are part of this correction.

## Recovery

No business data rollback is required: the correction changes one EXECUTE grant
and migration tracking only. Revoking that grant in mixed-owner production would
restore the outage, so do not undo it as an automatic application rollback.
If a future privilege change is needed, audit the full definer call chain first
and use a separately reviewed forward migration. Never reopen historical USED or
CANCELLED reservations to test this fix in production.
