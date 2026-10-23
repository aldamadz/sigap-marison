# DOC-12 Signed Stage PDF Download / Issue #743

- Authorized: staging first, then production; no approval or external resend.
- Monitoring Admin used `openFile` on `file_path_snap` whenever no cached PDF
  existed. Native sources use document markers rather than storage coordinates,
  so the protected storage endpoint correctly rejected them as an invalid path.
- Download now calls `openPdf` with the exact signature ID, using the existing
  source-bound canonical renderer/cache and document authorization. Existing
  stored PDFs use that same signature-bound route. Main PDF and ordinary
  attachment actions remain separate and unchanged.
- Signed stage buttons are explicitly named by stage and independently disabled
  during loading. Unsigned stages are not offered as signed snapshots.
- Five real page-render regressions cover native stage3, historical stage3 after
  final completion, legacy PDF, unsigned/rejected and loading isolation.
- Target014/UAI/PBO.1/X/2026 is already DONE and all five signatures exist. Its
  stage3 download must show marks1-3 only, leaving4-5 blank; no signature is reset.
- Runtime/acceptance results will be appended after release. No database migration
  or worker source change is required; application-only selective release.

## Follow-Up Found By Actual API Acceptance

- Before production promotion, an authenticated historical PDF request returned
  422 even with an approved source. The authorized-document signature projection
  omitted `is_signed`, so the existing fail-closed signed-snapshot guard could
  never succeed. Include that column; do not remove or relax the guard.
- A backend harness now applies actual selected-column projection to signature
  fixtures. It reproduced422 before the fix and verifies successful signed-stage
  access plus denial when signed state is false/missing, without minting tokens.
- The initial failed acceptance made no PDF job, signature or outbound change.
