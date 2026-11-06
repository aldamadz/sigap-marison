# NTF-06 Notification Delivery

## Boundaries

- Candidate for staging only. No production rollout authorized for this package.
- No Ticketing integration or administrative news broadcast. Browser popups use
  existing Web Push credentials and an explicit user permission gesture.
- Notification delivery, notification read status and business approval are
  independent. The sender never signs, submits, takes a PDF job or sends outbound.
- Lock-screen payloads are generic. Only an owned notification UUID is linked;
  the authenticated landing page resolves current canonical access/task type.
- Team digest scope follows active organization membership. Peers may remind
  the current responsible person through the existing cooldown/audit RPC, but
  gain no attachment, full-document or approval rights.

## Operation

- Migration `20261105062000` creates self-service preferences and service-only
  push delivery leases. Existing notifications are not backfilled.
- App jobs are disabled by default. Staging requires both
  `SIGAP_NOTIFICATION_JOBS_ENABLED=true` and `SIGAP_NOTIFICATION_AUDIENCE`
  containing explicitly selected tester UUIDs. Never use all staff for tests.
- Planning runs once per minute; four parallel senders claim at most 20 rows.
  Each row has a 90-second lease and at most four attempts. Provider requests
  have a 10-second deadline, disallow redirects, and revalidate provider hosts.
  Acknowledgement failure waits for all senders before releasing single-flight.
- Endpoints returning 404/410 are disabled unless the subscription has since
  been refreshed. Subscription ownership is rechecked on every claim.
- Team in-app digests default on, browser team digests default off. Calendar
  reminders and calendar popups default on, subject to browser permission.
  Opt-out also cancels eligible queued deliveries; old notifications remain.
- Scheduled work reminders start 15 minutes before an explicit start. Explicit
  deadlines and missing results are reminded during the last 30 work minutes.
  Workdays, holidays and breaks are respected. Carryover is not an implicit
  deadline. Generation is idempotent and bounded to 200 new events per cycle.
- Browser delivery depends on browser/OS permission, connectivity and support;
  delivery acknowledgement is not a guarantee that the user saw a popup.

## Validation

- `node scripts/test-actionable-dashboard-sql.mjs --notifications` exercises
  baseline organization monitoring/reminder concurrency, applies this migration
  twice, checks authorization/preferences/work clocks/dedupe and uses two real
  PostgreSQL connections to prove a delivery can have only one lease winner.
- Targeted Vitest covers provider allowlists, encrypted transport, retry,
  single-flight failures, service worker clicks, owned landing/login return,
  explicit permissions and task selection outside the first compact page.
- Live staged migration rehearsal, actual browser delivery and smoke acceptance
  remain required before declaring this feature deployed.
