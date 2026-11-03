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

Incident and scheduled-maintenance records are separate from probe evidence.
An unresolved incident gives the overall banner a warning only when all probes
have fresh results. The public Worker has no write route. An operator with D1
write access publishes records through `operator.mjs`; the timeline is never
inferred from HTTP failures alone.

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
2. Apply `migrations/20261103090000_history_events.sql` before deploying the
   new probe. On an existing database, take a D1 backup first. The migration
   backfills daily summaries from retained raw checks.
3. Upload `probe.mjs` and `dist/page.mjs` as module Workers with a D1 binding
   named `DB` pointing to that database.
4. Enable workers.dev only for the probe and install its one-minute cron.
5. Wait for real D1 samples, verify all four public/health probes, then attach
   the page Worker to `status.marisoncloud.com` as a custom domain.
6. Check `/`, `/api/status`, `/app.js`, `/logo.png` on desktop and mobile.

Staging uses a different D1 database and workers.dev Workers named
`marison-status-probe-staging` and `marison-status-page-staging`. Never attach
the production custom domain to staging. Do not deploy the new probe before
the migration: its daily-summary write requires `daily_checks`.

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

Do not add credentials or authenticated document URLs to probes. The status page
cannot survive a Cloudflare account or zone outage; for that, a second provider
and independent domain would be needed. It also does not send incident alerts.

Rollback: detach the custom domain, or redeploy the last verified page Worker.
Do not delete D1 during a rollback, or the incident history will be lost.
