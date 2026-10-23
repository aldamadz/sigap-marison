# 2026-10-23 [Codex] Selected Production Release

## Live Versions

- Staging: `5fef5a38a09cf28ecdf79e23978bdb644de74dd7`.
- Production: `b5bcb21f67781960ff93df412784b307dc524789`.
- Production app and PDF worker share image
  `sha256:a92556414cb8e7382cab7639d6e8da7e4efbe314dfbe61ce6ca7e32339a96c60`.
- Production main is an ancestor of the live staging source. Staging-only
  desktop/auth features were not promoted. Other production services unchanged.

## Results

- OPS-14 / #724: removed only unused Docker build cache older24h, retaining2GB.
  Disk84% to65% immediately after cleanup; after selected app/PDF builds,70%
  with about17GiB available. Filesystem recovery at cleanup10.8GiB; Docker's
  logical cache report12.47GB. Running/rollback images, files, logs and volumes
  were not deleted. Cleanup container/image inventories stayed identical.
- REC-04 / #725: recommendation PDF no longer prints revision history or reads
  actors/history just for printing. Current form, signatures, descriptions and
  photos remain. App audit history is retained. Current005/011/013 recommendation
  main PDFs were regenerated/reused under the new worker:2/5/7pages, respectively.
- SUR-37 / #726: positive item measurements up to6 decimal places, including
  below1, survive input/draft/confirmation/recommendation/KEU PDF processing.
  Building counts/IDs remain integral. Exact extended prices round once to whole
  Rupiah; revision UI/PDF use the same rule. Example1.5 x1001 produces1502.
- SEC-01 / #727: DOMPurify3.4.16 to3.4.17 fixes newly reported high/critical
  advisories. No unrelated package version changes. Four moderate and one low
  existing advisory remain; audit high/critical gate passed.

## Verification And Boundaries

- Forward migration20261023120000 applied selectively to both databases after
  exact old-function/catalog/ledger preflight. Repeat apply and real PostgreSQL
  assertions passed; function ACL/owner/flags unchanged. No business UPDATE.
- Exact selected production tree matches tested source `6fbc0f70fe` byte-for-byte.
  Clean Linux lint/typecheck/frontend+backend builds passed;271 focused Vitest
  tests,88 native renderer/worker/asset tests, and real disposable PostgreSQL.
  Additional focused revision checks:30 Vitest and9 native tests passed.
- Public root/live/ready/version/session/maintenance HTTP200; phase none.
  Playwright anonymous desktop1440/mobile390 for both domains: login visible,
  no horizontal overflow, page errors or same-origin5xx. No login submitted.
- PDF fixture and actual production PDFs passed text bounds, page totals and
  signature/form checks; actual recommendations omit the revision appendix.
- Canonical refresh proof compares prior PDF object bytes, source/signature
  hashes, requester audit and immutable outbound payload/generation inventory.
  No source/approval/audit rewrite, vendor POST, resend or replacement generation.
  Historical signer files and prior physical PDF objects remain unchanged.
- Internal preview capabilities are single-use. Initial operator API acceptance
  retried derived005 PDF preparation before switching to guarded canonical RPC
  and direct document-owned storage reads; all derived jobs completed. Do not
  replay business submissions or reuse a consumed viewer token to verify archives.
- Staging rollback preflight found a missing old worker image. Rebuilt exact
  sourcefc75b29b38 and compared worker files/shared output/package lock against
  the running worker before replacing it. This was separate from CT104 cleanup.
- Hosted GitHub checks did not start because account billing/spending is blocked
  (evidence check120234202725). This is NOT CI success; manual clean Linux gates
  above are the release evidence. Brief edge503 during app replacement cleared;
  final public acceptance passed.
- External Asset docs still specify integer quantities. Fractional Asset outbound
  fails explicitly instead of dropping/rounding quantities/items. Vendor support
  needs a separate contract change; no speculative vendor POST was performed.

## Traceability

- Staging PRs#730/#731/#732; selective production#733/#734/#735; ancestry#736.
- Revision total follow-up staging#737, production#738, ancestry#739.
- Cleanup operations-only record PR#728 remains Draft to avoid an extra app deploy.
- This release-proof PR is documentation only; keep it unmerged until the next
  coordinated release because main/staging pushes trigger app deployment.
- Private catalog, rollback and refresh proofs are under operator issue726
  directories. No credentials/configuration bodies belong in Git. Shared
  PROJECT_CONTEXT is absent; no shared document structure was changed.
