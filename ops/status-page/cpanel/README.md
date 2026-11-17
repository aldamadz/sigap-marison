# Independent cPanel status runtime (OPS-16 / #962)

Production status now uses this runtime. The old Cloudflare status databases are
archives/rollback inputs, not the live status store. Do not re-enable their probe
cron schedules or restore old collector destinations during an ordinary release.

This runtime removes D1 from status reads and writes, not just from its frontend.
It does not deploy SIGAP or access business records. The existing probe,
maintenance validator, Ed25519 report verifier, incident validator, status UI and
feed builders are reused without replacing their domain rules.

## Layout and prerequisites

- Node 24 with built-in `node:sqlite`, PHP 8.4 with Sodium, proc_open and flock.
- A dedicated status virtual host with a valid HTTPS origin certificate.
- Public files: `status.marisoncloud.com/public/index.php` and managed rewrite
  rules. Preserve provider-generated PHP directives in the existing `.htaccess`.
- Outside every document root: `status-private/config.json`, SQLite database,
  releases, snapshots, exports, backups and operator logs. Use mode 0700 for the
  private directory and 0600 for its files. Never put an SQL dump in public_html.
- The gateway derives its private directory from the dedicated virtual-host
  layout. Do not install it in the main site's public_html directory.

Private configuration (absolute paths, no private signing key):

```json
{
  "environment": "preview",
  "origin": "https://status.marisoncloud.com",
  "database": "/home/ACCOUNT/status-private/preview.sqlite",
  "snapshots": "/home/ACCOUNT/status-private/snapshots",
  "backups": "/home/ACCOUNT/status-private/backups",
  "node": "/opt/alt/alt-nodejs24/root/usr/bin/node",
  "runtime": "/home/ACCOUNT/status-private/releases/RELEASE/ops/status-page/cpanel/runtime.mjs",
  "collectorPublicKey": "BASE64_ED25519_SPKI_PUBLIC_KEY"
}
```

Retain the `ops/status-page/` and `public/logo-marison.png` repository layout in
the private release directory. There are no new npm runtime dependencies.

## Import and preview

1. Export the live production D1 database using the official remote export.
   Preserve the original SQL, its SHA256 and the Cloudflare database unchanged.
2. Run `node runtime.mjs import CONFIG EXPORT.sql`. It refuses an existing
   database, imports in a transaction and checks integrity, foreign keys and the
   exact eight-table schema. Unexpected tables, triggers and views fail the audit.
3. Compare each imported table's count and content SHA256 with a second import
   of the same SQL on a separate machine; compare the schema too. Do not compare
   a moving live database to an earlier export as if they were one snapshot.
4. Run `php cron.php CONFIG cycle` privately. It only reads public SIGAP/CCTV
   readiness endpoints and public SIGAP maintenance. Inspect real observations;
   do not substitute healthy fixture values into the imported production copy.
5. Run the tests below and test the actual virtual host over verified HTTPS
   before changing public DNS. Origin CA verification needs the official
   Cloudflare Origin CA trust anchor; never use curl `-k` or Flexible SSL.

GET/HEAD requests use immutable generated files, never SQLite or a live probe.
`current.json` switches atomically after all assets/status/feeds are complete.
The gateway returns unknown/503 after three minutes without a new snapshot,
including expired feeds, rather than serving a stale healthy dashboard.
Private paths return 404; public writes other than `/report` return 405.

POST `/report` verifies host, age, content type, bounded body and exact-byte
Ed25519 signature in PHP before starting Node. Node verifies the signature and
the strict report schema again before one atomic SQLite batch. Minute keys make
retries idempotent. The collector private key remains on the Proxmox host.

## Cutover gate and rollback

Do not change routing until verified HTTPS, preview acceptance, history parity,
collector signatures and the source release are ready.

1. Save the exact existing DNS record, Worker custom domain/routes, probe cron,
   public-key configuration and collector configuration privately. Save the
   account's complete existing crontab; preserve unrelated jobs byte-for-byte.
2. Take a final D1 export and import into a NEW production database path. Keep the
   tested preview copy, original exports and all historical D1 data.
3. Enable exactly one one-minute cron calling `php cron.php CONFIG cycle`.
   `flock` covers the complete cycle; a second cycle exits without running.
   Children have a 50-second deadline and SQLite transactions roll back if killed.
4. Add only `https://status.marisoncloud.com/report` to the collector allowlist;
   validate an authentic report on the new origin. Preserve the old destination
   for a brief controlled overlap until public cutover succeeds.
5. Route ONLY the status hostname to cPanel using proxied DNS and Full (strict).
   Remove its old Worker custom-domain interception. Do not remove the main
   site's landing/privacy/terms Worker routes or change SIGAP DNS records.
6. Check public root, API, logo/scripts, RSS, Atom, incident/maintenance history,
   browser light/dark modes and expandable components on desktop and mobile.
   Confirm multiple independent cron cycles and authentic collector updates.
7. Only then disable the old status production and obsolete status staging
   probe cron schedules and remove their collector destinations. Leave D1 and
   Worker source intact for rollback. Log their final write counters separately.

Rollback: restore the saved status custom-domain/DNS routing, collector
destinations and status probe schedules, and remove only the managed cPanel
status cron entry. Keep the cPanel database/snapshots for reconciliation. D1 may
still hit its free quota; rollback is not proof that the old quota problem is
fixed. Never erase history or fabricate samples to make a rollback look healthy.

The cron creates checked daily SQLite backups with bounded retention, while the
original D1 exports are never deleted. Snapshot cleanup removes only explicitly
named old snapshot directories within the configured private snapshot root.

## Operator events

Use the existing `buildCommand` schema in a private JSON file containing
`{"command":"incident-create","input":{...}}` (or incident-update,
maintenance-create, maintenance-cancel). Invoke
`php cron.php CONFIG event INPUT.json --production` for production. The same
cycle lock serializes publication. There is no public incident-admin API.

## Verification

```sh
node --test ops/status-page/*.test.mjs ops/status-page/cpanel/*.test.mjs
STATUS_PHP_TEST=1 node --test ops/status-page/cpanel/gateway.test.mjs
php -l ops/status-page/cpanel/public/index.php
php -l ops/status-page/cpanel/cron.php
```

The PHP integration test starts only a loopback fixture server with a synthetic
Ed25519 key and synthetic SQLite data. It never sends reports to production.
It covers actual PHP/Node ingestion, forged/replayed requests, stale snapshots,
method/path/host restrictions, and public reads with the database removed.

## Initial migration evidence, 16 November 2026

- Source baseline copied only from `ops/status-page/` at status feature commit
  `bff101860492266f64493623e75c641507716600`; no unrelated branch commits included.
- cPanel Node v24.22.3, PHP 8.4.27; Sodium activated for this hosting account's
  selected PHP 8.4 (per-domain selector is unavailable). PDO MySQL remains loaded.
- Original D1 export: SHA256
  `be3a46a894dc7d552d1cda2c6ed03232ede89f355b1b824ba1c90078be3441c2`.
- Import: 21,525 legacy checks; 110,815 component checks; 20 legacy daily rows;
  103 component daily rows; 3 maintenance records; 1 source; no incident rows.
- All eight table digests/counts and full schema match independent Windows and
  hosting imports. Hosted Node/PHP test suite: 61 passed, zero skipped/failed.
- Preview cycle and checked daily backup succeeded privately. This evidence does
  not mean public cutover, live collector migration or old cron shutdown occurred.
- Public cutover remains gated on SSL installation/verification and the remaining
  cutover acceptance steps above. Do not mark OPS-16 complete from source alone.

## Public cutover evidence, 16 November 2026

The initial preview gates above were subsequently passed:

- PR #963 staged the feature, #964 selectively released it to main (`a4606fea`),
  and #965 synchronized main ancestry to staging (`e2280e2a`). Hosted quality,
  dependency audit and dedicated status gates passed. SIGAP deployment jobs were
  intentionally skipped by the narrow status-only guard, not bypassed manually.
- The independent cPanel release is artifact `46ceacd`. Actual hosted Node/PHP
  suite: 62/62 passed, zero skipped; collector tests: 5/5 passed. Tests include
  preservation/idempotency of provider web rules and existing unrelated cron jobs.
- Final pre-cutover SQL SHA256:
  `3c2e7fb5bbc8ca25eb677c7b6d2b8eaa6ac437b4f7bbe78ebb146dee4078d4be`.
  Import preserved 21,571 legacy and 111,177 component checks, 123 daily rows,
  three maintenance records and the source revision. All eight table digests and
  schema match a separate local import of that same export.
- `status.marisoncloud.com` is proxied A -> `210.16.64.51`. Nameservers remain
  Cloudflare. Configuration rule `c42fc06de87c4788b2ab94fa0b653de6` applies Strict
  TLS only to that exact hostname. Its Origin CA certificate matches the hostname
  and expires 16 November 2027; direct origin checks use the official CA root.
- The old page Worker's status custom domain was detached; its
  `marisoncloud.com/*` and `marisoncloud.com/terms*` routes remain unchanged.
  Main landing, privacy and terms all returned HTTP200 after cutover.
- Live files reside under `/home/wurdgtgl/status-private`; public gateway only
  under `/home/wurdgtgl/status.marisoncloud.com/public`. Existing provider PHP
  directives were preserved. Private files are mode0600 under a mode0700 parent.
- Cron installation preserved the original three-line crontab SHA256
  `0a0a9e869c397f85b38825f4e9f34a252c905cb210df09669239b98ac7cd18b1`.
  The managed new crontab is
  `01586acf37c65aa28dd0b03fbec7269bcd3f64651c8c18349bd7018a6669e452`;
  private exact backups exist before any change. Multiple automatic minute cycles
  and a checked daily SQLite backup succeeded.
- Proxmox collector now sends only to `https://status.marisoncloud.com/report`.
  Original configuration/source were backed up; its private signing key is
  unchanged. Authentic origin and public ingestion returned204; the unchanged
  systemd timer repeatedly published successfully after cutover.
- Public root/API/logo/scripts/RSS/Atom returned200, feeds parsed as XML,
  private configuration/database paths returned404, and signature/method/stale
  behavior passed actual PHP/Node fixture tests. Browser checks passed theme
  toggles, subscription dialog URLs, service expansion and all three maintenance
  histories. Existing percentages/history were preserved, never reset to100%.
- Both legacy status probe cron schedules were removed and saved, then confirmed
  absent after reloading their Cloudflare settings. Changes may take up to
  15 minutes to reach all schedulers; final settled D1 checkpoints/tail exports
  are recorded in Issue #962. D1 data and Worker source are NOT deleted.
- Post-cutover exports are also archived privately on both machines. A checked
  append-only reconciliation restored 18 missing cutover-window observations
  (2 legacy, 16 component), without replacing overlapping new-origin samples;
  repeating the merge did not change raw rows or daily counters. A pre-merge
  SQLite backup and per-table audit manifest remain private.
- SIGAP runtime remains production `53994df14f0b3501d43bf1a302f9121aee414f0e`
  and staging `debdf3c82c10f2e063b49d72ea4310bbb674e584`; both readiness checks
  returned200. No SIGAP restart, business data change or vendor resend occurred.

For this independent release, Git main/staging include status-only source newer
than the SIGAP runtime SHAs by design. The status artifact is separately tested
and deployed; this does not assert that SIGAP runtimes contain the status commit.
# Hosted Maintenance Synchronization (OPS-20)

With hosting control configured, the minute status cycle reads its private
control database read-only instead of contacting the SIGAP origin. It replays
up to100 changed events in revision order, preserving short successive schedules
and their actual completion timestamps. Checkpoints advance only after each
status update succeeds; no-event cycles refresh source freshness without
rewriting the control audit. Origin restarts therefore cannot hide a newly
published schedule or prevent its completion from reaching status history.

