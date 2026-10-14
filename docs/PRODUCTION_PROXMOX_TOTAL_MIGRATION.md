# Production Proxmox Total Migration

Owner: Codex; tracking: Issue #573. Production migration explicitly requested.
Status on 2026-10-14: isolated Database/Auth rehearsal passed; no cutover.

## Boundary

- Production app remains LXC 104 `sigap-app-prod-01` (10.10.10.241:3010).
- New unprivileged CT 110 `sigap-db-auth-prod-01` is Database/Auth only.
  Its private address is 172.20.100.3, reachable from app 172.20.100.2.
  Internet/bootstrap NIC currently uses DHCP; do not depend on that lease for
  permanent service routing. No PostgreSQL or Auth port has been published.
- Production storage must use VM 100 `sigap-storage-prod-01` (10.10.10.240),
  existing MinIO and its XFS storage at `/srv/minio`. Do not format it.
- PDF, directory-sync, outbound, external API and the production tunnel still
  have Ubuntu instances. They are migration targets, not already migrated.
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

```sh
node --test ops/maintenance/server.test.mjs
node ops/maintenance/server.mjs
```

Bind only the intended private interface when deploying. Serve this on its
own instance, not behind the application process being shut down. Bundle the
existing local PNG logo with the same relative layout. Public API maintenance
and public web maintenance must cover all production writers during cutover.

## Remaining Acceptance Gates

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
