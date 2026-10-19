# OPS-10 Scheduled Maintenance and Edge Fallback

## Scope and Release

Issue #642. Initial target: staging only. Production requires the user's acceptance
of staging and explicit promotion together with the separately tracked DASH-03
dashboard. Do not promote all of staging. No application database migration,
worker rollout, outbound replay, office change or production change is included.

The admin page is `/admin/configuration/maintenance`. Only active, non-deleted
admin/super_admin profiles may read private history or change a schedule. Ordinary
users can read the public announcement, but not its administrator/audit records.

## Administrator Workflow

1. Choose Perbaikan, Pengembangan or Pembaruan; enter the message, start in WIB,
   and estimated duration in minutes/hours/days (1 minute to 30 days total).
2. Choose Potensi gangguan to keep SIGAP usable, or Maintenance penuh to block
   ordinary public access automatically at the scheduled start.
3. Preview and explicitly confirm publication. The reminder starts at 00:00 WIB
   on the preceding calendar day, not exactly 24 hours before the start.
4. Users may close the modal or select Jangan tampilkan lagi hari ini. That
   checkbox lasts for the current WIB day, account, browser and schedule revision.
   A banner remains available. An updated schedule reminds users again.
5. Full maintenance never reopens merely because the estimate has passed. Verify
   readiness, then select Selesai, buka layanan. A disruption-only notice expires
   at its scheduled end. A future schedule may be cancelled with confirmation.

Only one published schedule is supported. Concurrent editors must reload after
409 rather than overwriting another administrator's changes. Before/after state,
server time, actual administrator ID and revision are retained in edge audit
storage; the administration page returns the latest 20 entries.

## Independent Cloudflare Layer

The staging Worker `sigap-maintenance-staging` is scoped only to the proxied route
`sigap.marison-testing.biz.id/*`. Its workers.dev and preview URLs are disabled.
Its SQLite Durable Object holds state/audit; logo and animated/static illustration
are bundled into the Worker, not fetched from SIGAP storage or the application.
The reduced-motion illustration is used when requested by the browser.

With healthy origin and no full maintenance, requests, cookies, response streams
and SSE pass through unchanged. Writes are never automatically retried. Origin
connection failures and 502/503/504/52x/530 responses produce a branded HTTP 503;
API callers receive JSON 503 with Retry-After, not HTML or a misleading HTTP 200.
Unexpected outages do not invent a recovery estimate. HTML navigation has a
10-second origin-header deadline; this does not truncate an established SSE.

This survives an origin restart/power loss while Cloudflare, DNS and the user's
Internet remain available. It cannot guarantee availability during Cloudflare,
DNS, account/quota or client-network outages. The route fails closed at the
Worker request limit; monitor Worker/DO quotas and errors before production
promotion. No paid plan change is implied by this release.

## Keys and Authenticated Recovery

- Backend-only environment: `MAINTENANCE_EDGE_ORIGIN` and
  `MAINTENANCE_SIGNING_KEY_PKCS8` (base64 Ed25519 PKCS8 private key).
- Worker bindings: HOSTNAME, CONTROL_PUBLIC_KEY (SPKI base64 public key), and
  CONTROL (MaintenanceControl Durable Object). No Cloudflare API token belongs
  in the SIGAP app. Do not commit keys or include them in logs/screenshots.
- Control POSTs sign timestamp, exact hostname and exact JSON body. They expire
  after 60 seconds; mutations also require the current expectedRevision.
- The backend derives actorId from the live admin profile after same-origin CSRF
  checks. A client-supplied actor, cookie/query flag or ordinary role cannot bypass
  full maintenance. The edge verifies admin access with the origin.
- `/maintenance-admin` is the recovery login. After login it redirects to the
  configuration page; all control routes still require administrator authority.
- If the entire origin is offline, the web admin cannot log in. An already
  authorized operator may sign the same control command using the protected
  operator key, or recover the origin first. Do not grant new access or distribute
  keys to users. Production must have a separate key, hostname and Durable Object.

The staging operator key and original environment backup are protected under
`/home/marison/.sigap/rollouts/issue642/` (directory 0700, private files 0600).
The application receives only its own signing key through backend environment.

## Build, Rollout and Rollback

Run `node scripts/build-maintenance-edge.mjs`; upload the generated Worker as an
ES module using metadata.json, the environment's public key binding, and the
Cloudflare API. First deployment creates SQLite class MaintenanceControl with
migration v1. Subsequent uploads must retain the binding/state and must not replay
the new-class migration. Do not delete the Durable Object to upgrade code.

Deploy the staging application normally after its PR/CI. Edge-only state/assets
may be provisioned first with an empty schedule. Verify the actual hostname,
runtime SHA, admin controls, unsigned-control rejection, ordinary-user denial,
announcement dismissal, conflict handling, both schedule modes and origin-failure
fallback. Leave no published test maintenance after acceptance.

Rollback: complete/cancel an active schedule before removing the route or rolling
back application support. Revert the app through the existing release process,
retain the protected key/state/audit, and remove only this environment's route if
edge code must be bypassed. Bypassing the route removes the outage fallback and
must be an explicit operator decision. Never delete unrelated routes/workers.

## Maintenance Is Not a Migration Freeze

This feature controls public access through SIGAP's Cloudflare route. It does not
stop PDF/sync/outbound workers, external-API services, database connections or
private-origin operator traffic. A migration requiring a write freeze must use
the separately authorized operational runbook and verify each producer is stopped.
Do not claim a maintenance page alone provides a database consistency boundary.

## Verification Boundaries

Focused tests cover WIB boundaries, full/disruption transitions, indefinite full
maintenance, HTML escaping, Ed25519 authentication, replay/conflict protection,
audit snapshots, role/CSRF checks, request preservation, tunnel-error fallback,
daily per-account dismissal and the configuration confirmation flow. Actual edge
state and staging application/browser acceptance must be recorded separately from
these tests. Simulated origin shutdown is not a real building-wide power test.
