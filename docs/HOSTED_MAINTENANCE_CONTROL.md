# Hosted maintenance control (OPS-20 / Issue 987)

The private cPanel SQLite control store is the schedule/audit authority. Existing
SIGAP Ed25519 signing keys stay on their application hosts. Hosting stores only
their public keys, accepts bounded signed commands, serializes writes and checks
expectedRevision. Anonymous reads expose only an allowlisted public schedule and
released notes; private audit and unpublished notes never appear there.

The status database remains separate. Its three legacy maintenance records and
original Cloudflare archives are not replaced. The daily status cycle also backs
up the control database and continues syncing public schedule lifecycle into
status history. Operator maintenance-complete closes a real work record without
mislabeling it as cancelled. Incident updates must remain factual and must not be
marked resolved before public recovery is actually verified.

## Request paths

- The edge Worker keeps offline maintenance HTML and origin-outage fallback.
- Hosting mode never invokes Durable Objects; the old namespace remains intact.
- A five-second bounded, single-flight cache reduces hosting reads. Publishing a
  new schedule requires at least thirty seconds of lead time. Known schedules
  change phase against the current clock, not against a cached phase. Active
  full maintenance stays closed beyond its ETA until explicitly completed.
- An origin onRequest guard enforces the same API hold before raw/hijacked
  business handlers. Existing session, profile and service-token checks remain.
- Public readiness returns503 during full maintenance; loopback process readiness
  stays available to the container health check. Internal worker APIs retain
  their normal token checks and can drain without an admin browser session.
- ONLY after this origin guard is deployed and verified may API, assets, health
  and named static-file routes be excluded from the catch-all Worker route.
  Exclusions do not remove Cloudflare proxying/TLS or application authorization.
- Keep the signed /.sigap-maintenance/control and HTML fallback routes on the
  Worker. Do not exclude the catch-all before the origin guard is live.

## Bootstrap and rollout

Keep the hosting configuration, control database, event history and backups
outside document roots, mode0600 beneath a mode0700 directory. The public status
gateway includes the private maintenance gateway. GET state uses readonly SQLite;
only valid signatures may start a Node control process. Verify the actual hosting
PHP SQLite3/Sodium modules and verified HTTPS, without disabling certificates.

The quota-exhausted Durable Object cannot currently export its audit. Bootstrap
is therefore an EXPLICIT operator reopening, authorized by the user, recorded as
a new operator event with its reason; it is not fabricated legacy audit. Preserve
the old namespace and reconcile its archive after access returns. Available
legacy schedules remain unchanged in the status database. Do not silently import
an unverified future schedule or claim an unavailable audit was migrated.

Test synthetic SQLite/PHP signatures, cross-host isolation, replay/optimistic
conflicts, API hold before hijack, administrator recovery, offline fallback,
cache expiry and original POST/cookie/stream preservation. Apply hosting first,
then staging edge/application, then exact-main staging parity, then production.
Save the exact existing Worker deployment/bindings/routes and all hosting gateway
and private configuration bytes before cutover. Rollback never deletes state.

The Workers Free request allowance still exists. Moving storage alone is not a
complete budget fix: apply the guarded API/static route exclusions and verify
that routine API/asset requests no longer invoke the Worker. Origin failure must
still produce the branded page on an HTML navigation.
