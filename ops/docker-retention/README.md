# CT104 Docker Retention

Policy: keep the active image and the three latest **distinct, successfully
deployed** rollback image IDs per registered service. A shared ID is retained
whenever any service needs it. Any running/stopped container, audited legacy
rollback reference, unknown image or foreign repository tag overrides deletion.
Fewer than three historic versions is reported, never invented.

## Deployment Boundary

Production `scripts/deploy-app.sh` re-executes through
`scripts/with-production-deploy-lock.sh`. One host `flock` covers build, recreation,
health checks, public smoke checks, failed-deployment rollback and post-success
retention. The previous image is pinned by full ID before the mutable production
tag can move. Check-only, same-SHA and failed deployment paths do not clean up.

The success hook independently checks the deployed image, container health,
public SHA and exact HTTP200 for live/ready/root. Only then is a release recorded.
A retention failure is reported as a failed operational step without rolling back
an otherwise healthy application. It never removes containers or business files.

Coordinated PDF/sync/outbound/external API/tunnel/relay releases must also run
inside this same wrapper. Their `success <service> <image-id> <revision>` hook
requires installed, trusted, service-specific health **and** smoke adapters in
`policy.json.serviceChecks`. There is no generic worker-health bypass and no
restart of workers by app deployment. Without adapters the service's new release
cannot be certified; existing retained versions/container references remain safe.
Historic root operator scripts are not new deployment entry points; do not invoke
them concurrently outside this lock. An unrelated root/Docker administrator can
always bypass cooperative locking; Docker non-forced removal remains a second guard.

## Installation

Install the root-owned reference-audit source under
`/usr/local/lib/sigap-image-retention` with its two imported inventory modules
at their repository-relative paths. The fixed executable
`/usr/local/sbin/sigap-retention-reference-audit` invokes that source using the
host Node binary, with no arguments. Give only `sigap-runner` passwordless sudo
access to that exact no-argument read-only command. Never run mutable PR source
as root and never grant arbitrary Node/shell or path arguments through sudo.

`/opt/sigap/image-retention` is the runner-owned private state directory:

- `policy.json`: immutable policy identity and trusted service checks.
- `state.json`: audited initial service histories and managed-image ownership,
  followed by successful deployment records. Bootstrap dates are explicitly image
  creation ordering; new records use actual verified completion times.
- `pending-plan.json`: full unique-ID retain/delete inventory and digest.
- `approval.json`: absent until explicit human approval; binds the policy digest.
- `rollback.json`: canonical full-ID/immutable-tag references, atomically published
  only after **all** retained tags verify.
- `audit.jsonl`: success, deletion intent/result, protection/race skips, errors,
  cache prune output, before/after filesystem free space.
- `deployment.lock`: the same file for every deployment and retention operation.

Initial histories must be audited against actual containers and existing rollback
tags. The bootstrap report is read-only and does not install state or delete.
Audit Proxmox-host rollback references separately; add their full IDs and source
coordinates to `state.externalReferences`. Preserve these extra pins until a
separately reviewed retirement; never rewrite an immutable historical snapshot.

The fixed CT audit scans known rollout/release/operator roots before planning and
again during removal. It returns only matching image IDs/tags/file coordinates,
not configuration bodies, environment variables or secrets. Checkout source and
secret paths are excluded, operational Compose/rollback files retained; read,
symlink, size/depth or enumeration failures abort cleanup.

## First Approval

Before any removal, run under the shared lock:

```bash
bash scripts/with-production-deploy-lock.sh node scripts/docker-image-retention.mjs plan
# Present pending-plan.json to the user. Do not approve on their behalf.
bash scripts/with-production-deploy-lock.sh node scripts/docker-image-retention.mjs approve <reviewed-plan-digest>
```

Approval is not a cleanup trigger. It authorizes the policy for future verified
success hooks. The first cleanup can remove only image IDs explicitly listed in
that approved report, even if a newer deployment makes another image old enough.
Further eligible versions wait until a subsequent successful deployment.
Changed inventory at approval requires a new reviewed plan.

No approval: future deployments only record success and save a dry-run plan.
To suspend future cleanup, archive/remove the approval marker through an explicit
operator change; no application/database secret is involved.

## Removal And Cache

Every candidate is rechecked against **all** containers and rollback references.
Remove exact audited tags with `docker image rm --no-prune`, **never --force**;
recheck tag-to-ID correspondence and log whether actual image deletion occurred.
No image-parent, container, volume, database, document or configuration cleanup.
Unknown images/build intermediates are not adopted into the managed set.

After verified success and human approval only, prune unused dangling build cache
with `docker builder prune --force --filter until=168h`. No `--all`, image prune
or system prune. Cache pruning may reclaim old build intermediates separately
from managed deployment versions. Docker's shared-layer image sizes are not a
prediction of bytes reclaimed: log actual filesystem before/after.

Legacy rollback references may retain more than four images. This is deliberate:
first migrate/retire the old executable rollback dependency explicitly; do not
delete its image and leave a broken or silently repointed historic rollback.
