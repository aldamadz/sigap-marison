# KEU 10 Readiness

Issue: #471. Feature: KEU-10. Target: staging first, selective production release.

## Contract

- KEU 10 uses a separate editor, confirmation/detail, native PDF and worker handler.
- Form identity supports FM-UAI.KEU-10-00 and matrix alias FM-MBN.KEU-10-00.
- Three grouped purposes: legal land, tactical land, village equipment.
- The related Branch Manager signs first. Finance is one formal signed verifier,
  not an extra examiner. Manager and director examiners follow the selected group.
- Tactical land totals at most Rp2 million use Director I; larger totals use
  Director Utama. Quantity times unit price is computed by the server.
- Finance corrections are proposals only. Requester confirmation creates a new
  generation, retains the document number, freezes history and restarts all signs.
- Ordinary returns permit requester item corrections. Ambiguous replacement
  directors require explicit selection from frozen eligible candidates.
- Fund type is explicit: operational, production_cost or marketing_cost. KEU 1
  remains operational. No default assumption maps land costs into production.

Vendor evidence: https://external.marisonregency.id/docs/ documents all three
Fund Submission types. No vendor POST is needed to validate mapping locally.

## Dependencies

- Existing form usages, route templates, related Branch Manager resolver,
  revision RPCs/history, native PDF jobs and lease-aware completion.
- Forward-only migrations 20261006170000 and 20261006171000, in that order.
- Active HQ managers for Legal Lahan, Business Development and Finance, plus
  Director I and Director Utama. Seed fails closed when candidates are missing.
- The seed contains no test-account identifiers, passwords or employee mutation.
  Isolated staging fixtures are provisioned separately and never promoted.

## Verification

- Disposable PostgreSQL executes canonical RPC bodies from tracked migrations,
  not a replacement implementation. It checks atomic registration/retries,
  invalid actors/counts/candidates, threshold boundaries, requester confirmation,
  immutable history, stale PDF publication, and concurrent approval.
- Actual PDF generation and Poppler checks cover 4/5/6 signers, form alias,
  previews, and 100 items over multiple pages.
- Frontend tests cover three fund types, context validation, purpose labels,
  form-specific detail/export, and Finance-only proposal editing.
- CI affected-file gates include the KEU 10 PDF and SQL runners.

## Rollout Gates

1. Pin reviewed head and successful CI. Audit live migration ledger/candidates.
2. Apply only the two new migrations; keep business-document fingerprints intact.
3. Deploy the staging merge SHA to app and PDF worker with no active PDF jobs.
4. Verify runtime/image identity, browser form flow and actual revision RPCs.
5. Release the same feature branch to main; synchronize and deploy staging first
   so production main remains an ancestor of live staging.
6. Apply production migrations and deploy app/PDF only. Preserve sync/outbound
   containers and perform read-only production acceptance. No fake live submission.

## Rollback

Record previous app/PDF image IDs and runtime SHA before deployment. Restore
those images if health/runtime checks fail. New schema is additive and wrappers
delegate non-KEU 10 workflows unchanged. Do not erase immutable revision history,
rerun historical migrations, repair the ledger blindly, or roll back business data.

Current document records implementation readiness, not proof of live deployment.
Runtime/migration acceptance must be posted separately against the merge SHA.
