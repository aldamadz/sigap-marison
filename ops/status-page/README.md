# Marison Cloud public status

This deployment is independent of all four monitored origins. Two Cloudflare
Workers share one D1 database:

- `marison-status-probe`: workers.dev only, cron `* * * * *`; fetches the public
  home page and health endpoint for each service. Its public fetch handler is 404.
- `marison-status-page`: custom domain `status.marisoncloud.com`; reads D1 and
  serves the page, assets and `/api/status`. It never probes the origins directly.

The probe is intentionally hosted on workers.dev, a different zone from
`marisoncloud.com`, so it tests the public SIGAP route and its maintenance Worker
instead of bypassing it via a same-zone service binding. The probe records one
sample per minute per service and keeps 30 days of raw samples. The public page
shows 30 daily bars and a 30-day sampled availability rate, with measurement
coverage displayed separately. Days before monitoring began are unknown, never
assumed healthy. A sample older than three minutes is unknown, not healthy.
Current condition is UP only when the latest public-page and health checks both
pass; either failing is DOWN immediately. Missing/stale data is BELUM DIKETAHUI.
Health and public page are checked separately.

Daily history uses healthy-sample ratios: green at 100%, yellow from 99% to
below 100%, orange from 95% to below 99%, and red below 95%. No data is gray.
These bands do not override the current condition. Each day's tooltip includes
its exact sampled percentage and count; historical probe records are unchanged.

Incident and scheduled-maintenance records are separate from probe evidence.
An unresolved incident gives the overall banner a warning only when all probes
have fresh results. The public Worker has no write route. An operator with D1
write access publishes records through `operator.mjs`; the timeline is never
inferred from HTTP failures alone.

The scheduled probe also reads SIGAP's public maintenance state through an
internal Cloudflare Service binding to `sigap-maintenance-{environment}`. Only
the published schedule's public message, impact, and times are copied to D1.
The revision prevents an older poll from restoring a cancelled schedule. If
the binding is unavailable, the last schedule remains visible with a stale-sync
warning; it is never silently cancelled. A full maintenance that exceeds its
estimate remains visible until SIGAP marks it complete or cancelled.

## Build and test

From `ops/status-page`:

```sh
node --test probe.test.mjs page.test.mjs operator.test.mjs feed.test.mjs theme-legal.test.mjs
node build.mjs
```

The build embeds `public/logo-marison.png` into `dist/page.mjs` so an origin
outage cannot break the status page branding. Never commit `dist/`.
It also inlines the versioned `terms.mjs`; the deployed Worker has no relative
module import or origin dependency for Terms rendering.

The header theme control supports light, dark, and system preferences. A
same-origin prepaint `/theme.js` bootstrap applies the saved local preference;
storage denial falls back to in-memory/system behavior without blocking the
page. No account data or cross-origin preference sharing is used.

## Terms And Policy Links

Footer links point to `https://marisoncloud.com/privacy` and `/terms`.
The privacy page is not rewritten: its present scope is Absensi. Terms cover
only services owned or officially operated by Marison Regency Group, without
naming unaffiliated applications or implying ownership from a shared domain.
Follow `docs/legal/TERMS_MAINTENANCE.md` on every relevant service change.

The same Worker renders `/terms` without D1. Production route
`marisoncloud.com/terms*` selects only the Terms page/assets; other matched
paths are forwarded to the existing origin unchanged. This avoids deploying
the main application's unrelated dirty checkout. Route ID at release:
`a91f95d36a6349a5b04715d3a1dc8d17`. Theme/logo assets for the main host are under
`/terms/`. Do not expose status API routes through the main host. Before rolling
back to an older Worker without Terms support, coordinate this route as well.

## Deploy

1. For a new environment, create a D1 database and execute `schema.sql`.
2. Apply `migrations/20261103090000_history_events.sql` and then
   `migrations/20261103110000_sigap_maintenance_sync.sql` before deploying the
   new probe. On an existing database, take a D1 backup first. The first
   migration backfills daily summaries from retained raw checks.
3. Upload `probe.mjs` and `dist/page.mjs` as module Workers with a D1 binding
   named `DB` pointing to that database. The probe also needs a Service binding
   `SIGAP_EDGE` to `sigap-maintenance-staging` or
   `sigap-maintenance-production`, and a plain-text binding
   `SIGAP_MAINTENANCE_HOSTNAME` set to the matching SIGAP hostname. Staging's
   page Worker additionally sets `STATUS_ENVIRONMENT=staging` for a visible
   preview banner. Production has no preview banner.
4. Enable workers.dev only for the probe and install its one-minute cron.
5. Wait for real D1 samples, verify all four public/health probes, then attach
   the page Worker to `status.marisoncloud.com` as a custom domain.
6. Check `/`, `/api/status`, `/app.js`, `/logo.png`, and `/rss.xml` on desktop and mobile.

## RSS subscriptions

The Berlangganan button opens a native modal with readonly RSS and Atom URLs,
copy buttons and accessible feedback. Escape/close restore focus; clipboard
denial selects the URL for manual copy. The modal uses bundled Lucide icons
under `LUCIDE_LICENSE.txt`, without remote assets.

RSS 2.0 is available at `https://status.marisoncloud.com/feed.rss` and the
existing `/rss.xml`. Atom 1.0 is at `/feed.atom` (alias `/atom.xml`). Both are
advertised through feed autodiscovery and use the same event source. Users subscribe with
their own RSS reader; no email address, device permission, or subscriber data
is collected, and this does not itself send email/WhatsApp/push notifications.
Notifications depend on the reader's polling/notification settings.

The feed contains incident openings/handling updates, maintenance publication
and closure, and observed UP/DOWN transitions from the last 24 hours (including
single-sample failures). Incident/maintenance records cover 90 days, with at most
80 newest combined items. IDs stay stable across polling to avoid duplicates;
maintenance edits update the existing item, so reader alerts for edits depend
on the reader. Monitoring gaps are not invented as service-state transitions.
Database errors return 503 instead of a misleading empty feed.

Staging uses a different D1 database and workers.dev Workers named
`marison-status-probe-staging` and `marison-status-page-staging`. Never attach
the production custom domain to staging. Do not deploy the new probe before
the migrations: its daily-summary write requires `daily_checks`, and schedule
sync requires `status_sources` plus the maintenance source fields. Verify the
SIGAP maintenance revision in D1 after at least one scheduled probe run.

## Operator records

Public legal pages are served independently at `/terms` (v1.2) and `/privacy`
(group notice v2.0). Both share themes, version/history and cross-navigation.
The main-host successful HTML root is progressively enhanced with header/footer
links using `/terms/landing.js` and `/terms/landing.css`; original application
scripts, CSP, assets and errors are retained. A server-rendered fallback footer
keeps links available if the enhancement cannot run. The explicit staging-only
`/_preview/landing` fixture exercises the enhancement, not the entire live app.
See `docs/legal/TERMS_MAINTENANCE.md` and `docs/legal/PRIVACY_REVIEW.md`.

Set `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, and `CF_ENVIRONMENT`
in the operator's private environment. Use a narrowly scoped D1 write token.
Never commit or paste the token into an incident description. Create a JSON
file containing the intended public text, for example:

```json
{
  "title": "Gangguan akses SIGAP",
  "summary": "Sebagian pengguna mengalami kendala saat membuka SIGAP.",
  "severity": "major",
  "services": ["sigap"]
}
```

Run `node operator.mjs incident-create incident.json`. The command prints the
generated incident UUID. Add a timeline update with
`node operator.mjs incident-update update.json`, using:

```json
{
  "incidentId": "<UUID dari incident-create>",
  "phase": "identified",
  "message": "Penyebab sudah diketahui dan sedang diperbaiki."
}
```

Later phases are `monitoring` and `resolved`; a resolved incident cannot be
updated further. For maintenance, use `maintenance-create` with `title`,
`description`, `services`, `startsAt`, and `endsAt`. Times must be ISO 8601 with
timezone, for example `2026-11-04T13:00:00+07:00`. Use
`maintenance-cancel` with `{ "maintenanceId": "<UUID>" }` to cancel before it
ends. Production commands require `CF_ENVIRONMENT=production` **and** the
`--production` argument. No record should be published without an operator
checking the service scope, timing, and public wording.

## Incident handling

Probe failures change the service indicator automatically, but do not invent
an incident narrative. The on-call operator confirms the impact, then creates
an incident with `incident-create` and the affected service IDs. Each material
step is a new `incident-update`: `identified` for the confirmed cause and
action, `monitoring` after access returns while stability is checked, then
`resolved` after verification. The page displays each message and timestamp
in reverse chronological order. Do not write guesses as confirmed causes,
include employee/document details, or publish credentials. Keep the D1 write
token outside SIGAP and outside the public Worker. During a SIGAP origin outage,
the operator CLI still writes directly to Cloudflare D1; the status page remains
available. Planned SIGAP maintenance is synchronized automatically, so do not
create a duplicate manual maintenance record for the same event.

Do not add credentials or authenticated document URLs to probes. The status page
cannot survive a Cloudflare account or zone outage; for that, a second provider
and independent domain would be needed. It also does not send incident alerts.

Rollback: detach the custom domain, or redeploy the last verified page Worker.
Do not delete D1 during a rollback, or the incident history will be lost.
