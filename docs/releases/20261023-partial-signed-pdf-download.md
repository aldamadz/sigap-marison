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

## Released And Verified

- 2026-10-23 [Codex] Sourcef249e090; staging PR744/746, selected main745,
  ancestry747. Live staging3a27afac9eb498c7408ac18b40bd5d62a7f8dfac contains
  mainba813c92d7eaef0ea808a071f7f41597dd6bf6e2 before production rollout.
- Clean Linux lint/typecheck/frontend+backend build/audit high gate,33 focused
  Vitest and58 native renderer/worker tests passed. Hosted check120285607432
  did not start due account billing, NOT CI success. Scoped diff checks pass;
  unrelated staging-only baseline whitespace was not changed. Final staging
  tree equals tested1f8eadc; final main tree equals sourcef249e09.
- Real page fixture Chrome1440/390 partial/final: exact signature3 route,
  unsigned4/5 buttons hidden, no overflow/JS errors. Temporary QA server stopped.
- Both public roots/live/ready/version/session/maintenance200, phase none;
  new client asset verified, anonymous PDF401. Non-app container IDs/images/
  starts/restarts unchanged. No migration/worker restart. Previous images200.
- Actual authorized production014 stage3 PDF200/103124bytes, job
  7cb0d9c3-8dc8-4f47-b1dd-89fefd3741e4. Rendered page verified exactly3 approval
  marks; Director I/Director Utama approval areas blank. Document source/status/
  input, signature decisions/times/native snapshots and outbound bodies/status/
  references hashed unchanged. Only normal PDF job/cache/viewer token operations;
  no approval or vendor resend. Private proof/PDF retained in operator storage.
- This documentation update does not require another application deployment.
