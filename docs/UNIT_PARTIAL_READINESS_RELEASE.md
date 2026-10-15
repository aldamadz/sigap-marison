# SUR-30 Partial Unit Readiness

Issue: https://github.com/aldamadz/frontend/issues/612

## Contract

The original requested count stays unchanged. A configured Planning examiner may
verify between one and the requested number of unique units. A partial selection
requires a reason of at least five characters. Approval and the existing outbound
mapper use only the selected units, never an array synthesized from the requested
count. Outstanding units do not create another submission automatically.

The canonical verification RPC owns authorization and the transaction. Immutable
participant-readable evidence snapshots the actual examiner ID/name, server time,
requested and ready counts, outstanding count, project/unit selection and reason.
Re-examinations append evidence instead of editing previous examinations.

Detail, approval and PDF use this evidence. PDF appends separate pages; it does not
replace the original request or expand the main form's signature table. Historical
signer PDFs retain their source and signed-time cutoff.

## Verification

- PostgreSQL baseline reproduces the old exact-count rejection for 3 of 30.
- Disposable PostgreSQL tests both staging's legacy wrappers and production's
  missing legacy guards, with a non-superuser canonical RPC owner distinct from
  the migration executor. Apply twice, authorization, notes, duplicate verification,
  immutable evidence, owner/foreign RLS, re-examination, completion, and stale
  selection rejection are covered.
- Focused changed tests: 50 Vitest files, 314 tests; native PDF worker 38 tests;
  revision appendices and existing Unit revision SQL regression pass.
- Lint, typecheck, frontend and backend builds pass. Audit has no high findings;
  two pre-existing moderate development-dependency findings remain unrelated.
- A two-page dummy native PDF was rendered and visually inspected: the original
  30-unit form remains intact and the appendix shows the named 3/30 examination.
- Staging canonical RPC acceptance uses real configured examiner access, checks
  30 requested / 3 ready / 27 outstanding, required reason, immutable history,
  requester visibility and duplicate rejection. Full rollback and before/after
  document/signature hashes are verified; no approval or outbound is performed.

## Rollout

Apply only migration `20261015130000`, hash
`af908e9dbad1c3d909af8d6df8a556148e88e28366eae5f04eb27330f14426dd`.
Compare current function ownership, ACL and bodies with the protected operator
baseline. Imported migration-history drift is not repaired and older migrations
are not replayed. Preserve unrelated canonical wrappers, office checks and RLS.

Deploy app and PDF worker from the reviewed feature source. The worker change is
not covered by app-only deployment. Drain active PDF work before worker rollout.
Verify runtime SHA, public health, authenticated detail/history and native PDF
generation on staging before selective production promotion. Production smoke
is read-only; never submit or replay a real outbound job as a test.

Rollback application and PDF-worker images to their recorded previous versions
if required. Keep the forward-compatible evidence table and audit rows; do not
delete evidence or restore the exact-count restriction over accepted partial work.
Any database correction uses a new reviewed forward migration.

The Asset replacement preflight screenshot belongs to Issue #604, not this Unit
allocation contract. No production Asset replay is authorized by this release.
