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
shows the last 24 hours and a seven-day sampled availability rate. A sample older
than three minutes is unknown, not healthy. A single failed sample is degraded;
two consecutive failures are down. Health and public page are checked separately.

## Build and test

From `ops/status-page`:

```sh
node --test probe.test.mjs page.test.mjs
node build.mjs
```

The build embeds `public/logo-marison.png` into `dist/page.mjs` so an origin
outage cannot break the status page branding. Never commit `dist/`.

## Deploy

1. Create D1 database `marison-status-prod` in the Marison Cloudflare account.
2. Execute `schema.sql` against it.
3. Upload `probe.mjs` and `dist/page.mjs` as module Workers with a D1 binding
   named `DB` pointing to that database.
4. Enable workers.dev only for the probe and install its one-minute cron.
5. Wait for real D1 samples, verify all four public/health probes, then attach
   the page Worker to `status.marisoncloud.com` as a custom domain.
6. Check `/`, `/api/status`, `/app.js`, `/logo.png` on desktop and mobile.

Do not add credentials or authenticated document URLs to probes. The status page
cannot survive a Cloudflare account or zone outage; for that, a second provider
and independent domain would be needed. It also does not send incident alerts.

Rollback: detach the custom domain, or redeploy the last verified page Worker.
Do not delete D1 during a rollback, or the incident history will be lost.
