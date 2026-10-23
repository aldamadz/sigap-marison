# OPS-13 Production Proxy Recovery

## 2026-10-23 [Codex] Incident #722

Production displayed the Cloudflare outage maintenance fallback, not a scheduled
maintenance window (`phase=none`). The shared Caddy proxy in CT103 still sent the
SIGAP main route to retired Ubuntu `10.10.10.246:3010`, which refused connections.
The correct Proxmox application origin is `192.168.0.251:3010` (CT104).

At 03:22:44 UTC / 10:22:44 WIB, the operator changed exactly one active Caddy
reverse-proxy dial through its loopback-only admin API. Root configuration ETag
and `If-Match` guarded concurrent changes. Whole-config comparison proved no
other service or route changed. No application, database or worker deployment,
container restart, maintenance schedule change, DNS change or vendor POST.

The helper here is an incident-specific record, NOT a periodic health repair or
a generic deployment command. It deliberately rejects an already-recovered
route, unexpected origin, app SHA drift or ambiguous host ownership. Run tests
without contacting production:

```sh
python -m unittest discover -s ops/production-proxy -p test_recover.py -v
```

## Evidence

- Public root, live/ready/version, auth session and maintenance status: HTTP200.
- Production runtime unchanged: `aec4be43b3f0d7fe3839af6ad49a51b3dccebd82`.
- Browser acceptance desktop1440/mobile390: login visible, no maintenance
  fallback, horizontal overflow, page errors or same-origin5xx. No login submit.
- Full before/after configuration, source files and proof are stored privately
  inside CT103 under `/root/sigap-proxy-recovery-20261023/20261023T032244Z`.
  Do not publish configuration bodies or backup contents; they may contain secrets.

## Source / Mount Caveat

The host file `/opt/marisdrive-upload-proxy/Caddyfile` already had the correct
origin and intentional auth/storage relay routes. It was NOT edited or reloaded
wholesale. The existing single-file Docker bind mount points at an older inode,
so `/etc/caddy/Caddyfile` inside the running proxy remains stale.

Do NOT blindly reload that stale in-container file: it can revert this recovery.
Caddy saved the active API configuration; operators must select the intended
source explicitly for any later reload/restart. A fresh container recreation
remounts the current host file, but also publishes its other pending changes.
Directory-bind migration/container recreation therefore requires a separate
coordinated change with the owners of all services on this shared proxy. This
incident did not fix the bind-mount lifecycle or authorize that broader rollout.

App deploy workflows trigger on every push to main/staging. Keep this operational
record PR unmerged until an appropriate release window; recovering the route
does not require an application deploy.
