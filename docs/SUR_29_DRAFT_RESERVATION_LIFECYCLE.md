# Draft and Reservation Lifecycle Repair

Tracking: Issue #596. Explicit scope: staging first, then production.

## Proven Cause

Production's `cancel-expired-surat-reservations` cron runs once a minute and
updates expired PENDING reservations to CANCELLED. Autosave extended only
`surat_registration_drafts.expires_at`; the reservation was not renewed.
The active draft reader checked DRAFT and its expiry, not its reservation.
The cancellation RPC rejected every reservation other than PENDING.

Read-only production audit: 12 ordinary DRAFT/CANCELLED rows, including three
unexpired draft records. One DRAFT/PENDING is valid. No owner mismatches were
found in those groups. Staging has one valid ordinary draft and no such legacy
cancelled records. Staging has no cron.job relation; do not claim a scheduler
was installed or tested there. Exercise the identical cron UPDATE in fixtures.

## Compatibility and Release Gates

Apply only `20261014180000_registration_draft_reservation_lifecycle.sql`.
The ordinary draft seven-day lease is server-controlled and renews its number.
Valid ordinary drafts protect their number from the existing expiry UPDATE.
Expired drafts close when their number expires; saved fields/files remain.
Existing DRAFT/CANCELLED records become EXPIRED, never a reopened number.
Owner/admin cancellation can close a stale record without changing CANCELLED
or historical VOID reservation metadata. USED and submitted documents fail
closed; revision drafts retain their existing event/number/authorization rules.
Private trigger helpers have no callable authenticated/anonymous grant.
Expiry uses SKIP LOCKED to avoid reverse-lock waits behind owner cancellation.

Pre-existing ledger drift is not repaired. Production preserves the imported
Cloud ledger, including legacy manual timestamps; staging has ten versions
not in selected main. This is not permission to db push --include-all, rename
old migrations or replay them. Audit the known before/after catalog of this
operation and archive existing function/trigger definitions. Both environments
currently have identical draft creation, cancellation and pending-extension
function hashes. The exact selected migration has a unique new version and
does not overwrite creation, number generation, reuse or submit RPCs.

Required evidence: changed UI tests, lint/typecheck/build, disposable Postgres
assertions, expiry/cancel race, affected CI, staging exact SQL/hash/ledger and
authenticated fixture acceptance, then selective production promotion with
live staging ancestry. Production acceptance is read-only; no real application
is submitted, approved or sent to Marison to test this change.

## Recovery

Keep original cancellation function/trigger definitions in protected operator
storage. Before apply, set bounded lock/statement timeouts and run transactionally
with exact migration ledger insertion. Abort on an unknown affected function,
existing conflicting version or incompatible table/trigger contract.
If a follow-up is required, restore only affected definitions or use a corrective
forward migration. Never restore a cancelled number, copy back a stale database,
delete attachments or reassign a number already used by another document.
