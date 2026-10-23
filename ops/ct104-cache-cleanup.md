# OPS-14 CT104 Build Cache Cleanup

## 2026-10-23 [Codex] Completed / Issue #724

User explicitly authorized inspecting and removing unused disposable data in
production CT104 `sigap-app-prod-01`. Initial root filesystem: 59GiB capacity,
47GiB used, 84%, approximately9.3GiB free. Docker reported14.54GB build cache;
the main consumers were `/var/lib`34GiB and `/opt/sigap`12GiB, not application
document uploads or database growth.

Only unused Docker build cache older than24hours was pruned, retaining2GB:

```sh
docker builder prune --all --force --filter until=24h --keep-storage 2GB
```

Docker reported12.47GB reclaimed; observed filesystem used space decreased by
11,597,758,464bytes (10.8GiB). Final root:65%, approximately20.1GiB available.
Filesystem accounting differs from Docker logical cache accounting.

All8 containers (7 running, 1 already stopped) retained identical IDs, image IDs,
start times, states and restart counts. Full image inventory unchanged. No image,
rollback image, volume, source release, credential, application file, PDF, log or
database was removed. No service restart or deployment. Public production
readiness remained HTTP200. Private before/after proof is inside CT104 at
`/root/sigap-cache-cleanup-20261023`; never publish full environment/config dumps.

Do not use `docker system prune -a`, volume pruning or manual `/var/lib/docker`
deletion as a substitute. Existing release/rollback directories were deliberately
preserved; further retention changes need explicit policy and ownership review.

This operations-only record does not require application deployment. Keep its
documentation PR unmerged until an appropriate release window, because the
repository deploy workflows trigger on main/staging pushes.
