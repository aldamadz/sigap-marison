# Approval Document Consistency

Issue #563 covers recommendation readiness, revised PGD signature pagination,
and compact approval queue metadata. Target staging, then selective production.

## Confirmed Causes

- Production uses an older recommendation comparator: a completed canonical job
  becomes stale when only `parent_workbook_source` rotates. Four completed linked
  recommendations exhibit that exact mismatch; child source/PDF/storage/fingerprint
  match. Staging already excludes the parent pointer. Forward migration aligns
  comparison only, preserving each environment's other render fields.
- Inbox cards read `surat_registrasi`, which the compact RPC does not include.
  Its flat number/title/requester/department/category fields are populated.
- A revised PGD PDF splits its second signature group across pages. The header
  remains on page one while signer names appear on page two.

## Acceptance

- Disposable PostgreSQL: reproduce old blocked parent advance; apply the new
  migration twice; advance without opening/rebuilding PDF. Reject changed content,
  fingerprint/storage tampering; publish after pointer-only rotation. Existing
  recommendation integration remains green; anonymous/authenticated execution
  privileges are not widened.
- Queue UI: real flat compact DTO shows number/title/requester/department/category
  and attachment indicator, independent of selected-detail hydration.
- Native PDF: render the read-only affected document snapshot and long fixtures;
  inspect pages for intact signature groups, retained revisions and all items.
- Run changed tests, lint, typecheck, build and high audit gate; document existing
  moderate advisories separately. No production approvals or content mutations.

## Operations

- Audit exact live function definitions and selected migration ledger before DDL.
  Dry-run in a rolled-back transaction; preserve business rows, ACL/RLS/publication.
- Apply only `20261013150000` to staging, coordinate app/PDF worker with zero active
  PDF jobs, and accept staging. Only then apply/promote to production.
- Production main must be ancestor of staging source AND live staging runtime.
  Production app runs on Proxmox LXC104; PDF worker remains on Ubuntu. Preserve
  rollback images and do not restart sync/outbound workers or the Ubuntu fallback.
- Rebuild only the reported primary PDF after renderer rollout; retain historic
  signature snapshots and files. This is not permission to approve the document
  or send a vendor request. Record SHA, CI URLs, smoke, gates and limits on #563.
