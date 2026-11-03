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
assumed healthy. A sample older than three minutes is unknown, not healthy. A
single failed sample is degraded; two consecutive failures are down. Health and
public page are checked separately.

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
node --test probe.test.mjs page.test.mjs operator.test.mjs
node build.mjs
```

The build embeds `public/logo-marison.png` into `dist/page.mjs` so an origin
outage cannot break the status page branding. Never commit `dist/`.

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
6. Check `/`, `/api/status`, `/app.js`, `/logo.png` on desktop and mobile.

Staging uses a different D1 database and workers.dev Workers named
`marison-status-probe-staging` and `marison-status-page-staging`. Never attach
the production custom domain to staging. Do not deploy the new probe before
the migrations: its daily-summary write requires `daily_checks`, and schedule
sync requires `status_sources` plus the maintenance source fields. Verify the
SIGAP maintenance revision in D1 after at least one scheduled probe run.

## Operator records

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
