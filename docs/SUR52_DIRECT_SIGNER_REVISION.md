# SUR-52 Direct Signer Revision

Issue #972. Depends on SUR-51 readable audit history. Staging only; production
requires a separate explicit release authorization for both features.

## Behavior

An active assigned signer selects Revisi oleh Penandatangan, edits the form,
provides a reason, reviews the before/after summary and confirms Simpan revisi
dan setujui. One authenticated transaction validates, edits and invokes canonical
approval. It advances normally (or completes at the final stage). The requester
receives a document-specific notification, without a confirmation task.

Both immutable history and the PDF identify the signer as the author. Consecutive
edits are frozen into the new PDF version; old signed versions are not rewritten.
Existing return-to-requester and legacy proposal confirmation remain supported.

Examination data, Unit identities and allocated units remain protected. Changes
requiring fresh Unit allocation or item recommendations use Minta Perbaikan.
Required examination, intake holds, attachments, recommendation and KEU10
amount-dependent director eligibility remain enforced server-side. Only future
unsigned eligible KEU10 final candidates may change; the current final signer
cannot swap their own signature to another account.

## Validation

- Lint, typecheck and build; affected Vitest tests and PDF/worker regression gates.
- Disposable PostgreSQL: apply twice, unauthorized/repeated requests, decimals,
  protected allocation fields, prerequisite holds, final-stage completion, atomic
  rollback, KEU10 totals/director eligibility, old proposal compatibility.
- Two connections: one approval/history/requester notification. Existing revision
  contention and requester concurrency gates retained.
- Synthetic two-revision PDF rendered and visually reviewed; complete before/after
  values, names and no fabricated requester confirmation.
- Managed staging migration rehearsal and controlled test-document approval use
  a transaction rolled back in full; no external POST or permanent test approval.

## Rollout

Audit the managed staging ledger against origin/staging, not main's shorter
migration set. Apply only 20261116100000 after exact ledger and function-shape
preflight; do not replay historical migrations or repair imported history.
Verify protected business-table hashes are unchanged in the migration transaction.
Preserve function definitions privately for diagnosis.

Build one reviewed image and drain PDF processing before recreating only staging
app and PDF worker under the deployment lock. Preserve existing runtime settings
and record rollback images. External API, sync and outbound containers stay
unchanged. Verify public readiness/version, equal app/PDF image and UI after
rollout. Application rollback keeps the forward-compatible RPC and immutable audit.

Dependency audit currently reports four pre-existing moderate findings; no high
findings. Dependency upgrades are outside this workflow change.
