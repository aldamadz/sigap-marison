# Production Proxmox Total Migration

Owner: Codex; tracking: Issue #573. Production migration explicitly requested.
Status on 2026-10-14: final cutover completed; public maintenance removed.

## Boundary

- Production app remains LXC 104 `sigap-app-prod-01` (10.10.10.241:3010).
- New unprivileged CT 110 `sigap-db-auth-prod-01` is Database/Auth only.
  Its private address is 172.20.100.3, reachable from app 172.20.100.2.
  Internet/bootstrap NIC currently uses DHCP; do not depend on that lease for
  permanent service routing. PostgreSQL 5432 and the API gateway 8000 bind only
  to the private address, not the LAN/public interface.
- Production storage must use VM 100 `sigap-storage-prod-01` (10.10.10.240),
  existing MinIO and its XFS storage at `/srv/minio`. Do not format it.
- PDF, directory-sync, outbound, external API and the production tunnel now run
  on CT 104. The old Ubuntu instances and the older CT 103 app replica are stopped
  with restart disabled. Retained source artifacts are rollback material only.
- Staging and other Ubuntu services are excluded. In particular, the existing
  Supabase Storage service/domain is shared with staging and cannot be moved or
  redirected wholesale as a production migration shortcut.

## Verified Rehearsal

The operator reset only the Cloud production PostgreSQL connection password,
as authorized. New credential is in an operator-only file (`0600`); application
user passwords are not reset. Export and imported database contain sensitive
data and must never be attached to GitHub or printed in diagnostic output.

Supabase CLI 2.120.0 was downloaded from the official release and checksum
verified. Official filtered roles/schema/COPY data exports and separate
`supabase_migrations` exports were transferred over SSH to Proxmox. This is an
initial rehearsal snapshot, not the final write-frozen cutover snapshot.

The target uses PostgreSQL 17.6 (`supabase/postgres:17.6.1.136`) and Auth
`supabase/gotrue:v2.197.0`. Auth 2.196.0 lacked tables present in the source;
2.197.0 initializes those tables without dropping any source data. Storage API
1.74.0 was used privately to initialize metadata only; its bootstrap container
is stopped. No storage objects have been transferred to MinIO yet.

Actual PostgreSQL verification after transactional import:

| Check | Result |
| --- | --- |
| Exported table row counts | All 105 tables match |
| Auth users / identities / employee profiles | 376 / 376 / 376 |
| Preserved nonempty password hashes | 376; source fingerprint matches |
| Application migration ledger | 225 rows; source fingerprint matches |
| Realtime publication table set | Source fingerprint matches |
| Public RLS policies | All 150 definitions and role lists match |
| Application functions | All 263 definitions, owners and effective ACL entries match |
| Application relations | All 78 owners and effective ACL entries match |
| Application Auth triggers | Both source triggers restored and match |
| Scheduled database execution | `cron.launch_active_jobs=off` on rehearsal |
| Public runtime | Still `02e80cc23345a4d216d49e3bccb6056a5aba712a`; HTTP 200 |

Two hazards were found and corrected before publishing any target service:

1. SQL bootstrap files must be readable inside the database container. Secret
   environment/config files stay `0600`; pinned non-secret SQL is `0644`.
   The interrupted empty candidate volume was retained. A separate new volume
   was bootstrapped successfully; no production database volume was removed.
2. Self-hosted default ACLs added privileges not in the source. Exact source
   ACLs were restored transactionally for 237 functions and 25 relations.
   Two application triggers on `auth.users`, omitted by the filtered CLI
   schema export, were restored separately from source catalog definitions.
   Compare normalized ACL entries, not textual array ordering. Compare policy
   definitions under the same `search_path`; raw deparsed hashes can differ.

Private proofs live under the authorized operator rollout directory for
Issue #573: export manifest, row counts, source/target catalogs, transactional
restore logs, catalog comparison and initial-import verification. These are
not release artifacts and must not be committed.

## Independent Maintenance Surface

`ops/maintenance/server.mjs` serves branded HTML independently of Auth, database,
application startup and external CDNs. Ordinary pages return HTTP 503;
application/Auth API paths return sanitized JSON 503. Responses have
`Retry-After`, `no-store`, CSP, framing and content-type protections.
GET/HEAD logo and private liveness remain available. No credentials or source
environment are loaded. Operator start timestamp is optional, validated and
formatted in local time; no fabricated completion estimate/progress is shown.
Use a second instance with `MAINTENANCE_SURFACE=api` for the external API:
all non-liveness routes return JSON 503, including paths outside `/api`.

Local preview (not a production activation):

The user-provided SVG animation is bundled locally, with a static illustration
selected by `prefers-reduced-motion`. The original SVG was checked for executable
elements/event attributes/external references; no remote assets/scripts are used.
Desktop/mobile screenshots verify asset loading and no horizontal overflow.

## Private API and File Compatibility

Auth 2.197.0, PostgREST 14.17, Realtime 2.134.10 and a Caddy 2.11.7 gateway
are running privately in CT 110. Realtime includes its required metrics JWT
configuration. This is rehearsal readiness, not proof of public cutover or
two-user authorization acceptance. SMTP/provider settings have been captured
privately; exact runtime comparison remains a cutover gate.

VM 100 has a separate private NIC for 172.20.100.5. Its existing MinIO service,
disk and public/LAN NIC are retained. Storage API provisioning and object-byte
verification are separate from the already verified database import.

Production deployment uses the dedicated `sigap-deploy-production` runner on
CT 104 and `/opt/sigap/secrets/.env.production`; staging retains `sigap-deploy`
on Ubuntu. `deploy-app.sh` rejects production execution outside the designated
guest. Exact paired Cloud or self-hosted identities are checked; self-hosted
production requires the private Database/Auth and Storage gateways plus the
production public URL. This runner was registered and reported online; this
does not replace migration, worker coordination or runtime acceptance gates.

Legacy file references are preserved in saved documents/revision snapshots.
`STORAGE_LEGACY_PRIMARY_ORIGINS` and `STORAGE_LEGACY_EXTERNAL_ORIGINS` accept
explicit bare HTTPS origins only; backend downloads resolve their canonical
coordinates through the destination storage client, not the historical host.
`VITE_LEGACY_STORAGE_ORIGINS` maps only allowlisted public image references to
the application's same-origin Storage gateway at display time. Signed/private
URLs and unrelated origins are not rewritten. A matching public gateway route
and copied objects are required before enabling these settings in production.

On 2026-10-14, Issue #572 was released separately: production runtime
`5828a40b1c07e3b01915e2a61aa2d3e860d5d498`, live staging
`fffa555912a1c5eddeb762db0d5bfc7196a9caae`; migration `20261014100000`
verified in both environments. This does not claim total migration completion.

```sh
node --test ops/maintenance/server.test.mjs
node ops/maintenance/server.mjs
```

Bind only the intended private interface when deploying. Serve this on its
own instance, not behind the application process being shut down. Bundle the
existing local PNG logo with the same relative layout. Public API maintenance
and public web maintenance must cover all production writers during cutover.

## Cutover Evidence

Production app/PDF/sync/outbound use image
`sha256:17a839cc702c1f179aded2cd165ef1983dc5f0acc3301dd2a9da073636ee2424`,
release SHA `91e6c3be05664f63c8481aa7b9d9c6166542f5f0`. The existing external
API and tunnel images were transferred intact; no new API credential was needed.
Live staging `da990cae26f8f6b051eb18e664bf04bafba75503` contains that release.

The write-frozen final snapshot was restored transactionally into the audited
schema. All 99 imported Auth/application/history tables matched their dump counts;
376 account hashes and 226 migration rows matched source fingerprints. The six
managed Storage tables belong to destination Storage API metadata, not Cloud's
unused storage. A scoped data refresh used replica mode without TRUNCATE CASCADE,
so it did not erase copied Storage metadata through Auth dependencies.

All 173 available referenced objects, totaling 51,452,583 bytes, matched after
download from destination. A post-freeze reread verified none had changed since
initial copy. All 35 current attachments and six canonical PDFs were present.
562 historical references were already missing at source. They remain in history;
their original binary content has not been reconstructed or silently replaced.

Both source-local database schedules were copied and activated on destination;
Cloud schedules remain disabled. Source workers/connectors are stopped and have
restart disabled. Destination app/workers/API/tunnel reported zero restart and
no recent authentication/connection errors. Subsequent legitimate PDF jobs can
increase destination object counts; that is not a source-copy mismatch.

Outbound retains its HTTPS requirement using
`https://sigap-db-auth.internal:8443`, resolved only inside its container to
172.20.100.3. An isolated Caddy TLS gateway uses a persistent internal CA; the
worker mounts the public CA certificate and sets NODE_EXTRA_CA_CERTS. Certificate
validation is enabled. Preserve this protected worker compose configuration for
future coordinated rollout; do not start a worker from an HTTP-only app config.

Read-only destination acceptance passed health/version/root, authorized session,
inbox, attention, dispatch list, monitoring and calendar RPCs; SSE reached ready
and profiles subscriptions were rejected. A previously issued Panusupan PDF link
still returned the original readable PDF from migrated storage. Existing external
client credentials generated a token; invalid credentials returned 401. No real
approval or submission-decision POST was used as acceptance. Actual password
login in a browser and a two-user mutation/reconnect test were not performed.

Public root/readiness/external API documentation return 200. Public REST/admin
and Storage bucket/upload paths are not exposed (404); only public object reads
and Auth verification/callback links are relayed. A verification request without
a token returns 400. The Realtime gateway rewrites directly to /socket/websocket;
combining ordered strip/rewrite directives previously produced an invalid path.

New production migrations/queries must target CT 110 through the authorized
Proxmox operator, with exact ledger/SQL/ACL checks. Legacy Cloud Management
helpers and the Cloud production MCP project are not the live database. Do not
use them for production business changes. Operator credentials, dumps, object
manifests, target compose, CA material and logs remain private, not Git artifacts.

## Execution Checklist

1. Preserve production Auth settings/SMTP/provider/redirect configuration;
   provision a stable TLS gateway and private service routing. New JWT keys
   mean current users must sign in again; hashes/IDs remain unchanged.
2. Audit schemas, default privileges, extensions, scheduler configuration,
   and any managed-schema customizations beyond the verified application
   catalogs. Do not blindly replay repository migrations or repair history.
3. Build a production reference manifest across current documents, revisions,
   drafts, PDF jobs, attachments and avatars. Copy only referenced/retained
   production objects and history through the compatible Storage API into
   MinIO; preserve paths, MIME types, visibility and limits. Verify bytes/hash
   and access for every object. Do not copy `staging/` or unrelated buckets.
4. Keep legacy production storage references resolvable without redirecting
   staging's storage domain. Test private downloads, PDF viewing and external
   bearer file links against the destination.
5. Pin exact app/worker/external-API images, arguments, mounts and intended
   environment keys. Protect transferred credentials. Prepare target
   containers stopped, without duplicate workers or production connectors.
6. Test maintenance on private target, backup Caddy routes, and establish a
   full rollback point before enabling public maintenance.
7. Enable maintenance for production web and external API, drain active PDF,
   sync and outbound leases, stop source production writers/connectors only,
   then take the final consistent database export and storage delta.
8. Restore final snapshot using the rehearsed transactional process and exact
   ACL/trigger checks. Verify data, leases, history, permissions, storage and
   images. Only one production writer/worker/tunnel instance may be active.
9. Test sign-in, directory, documents, recommendations, SSE isolation/reconnect,
   calendar, external token/auth, file links and internal worker routes before
   removing maintenance. Never use real approvals or speculative vendor POSTs
   as acceptance probes.
10. Recover Panusupan only through an audited new generation after fresh vendor
    unit references and submission flags are verified (Issue #572). Frozen
    already-POSTed payloads and vendor-rejected Marketing jobs remain intact.

## Rollback

Keep Ubuntu production instances and Cloud data available until acceptance,
but stopped/read-only after cutover, not concurrent writers. Returning proxy
routes alone is unsafe once destination business writes exist. If target has
accepted writes, maintain maintenance while a validated reverse delta/full
restore is prepared; never silently discard destination changes. Retain
source backups, image digests, Caddy backup and object manifests privately.

## Primary References

- [Supabase platform-to-self-hosted restore](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/self-hosting/restore-from-platform.mdx)
- [Supabase Auth 2.197.0](https://github.com/supabase/auth/releases/tag/v2.197.0)
- [Supabase self-hosted S3 backend](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/self-hosting/self-hosted-s3.mdx)
