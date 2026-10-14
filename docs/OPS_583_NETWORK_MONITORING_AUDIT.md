# SIGAP LAN and Availability Audit

Tracking: [Issue #583](https://github.com/aldamadz/frontend/issues/583).
Date: 2026-10-14. Scope: production guest LAN addresses and production/staging
monitoring diagnosis. No application code, business data, database schema,
credentials, public DNS or vendor submission was changed.

## Final Storage and Database/Auth LAN Change

Explicit user request resumed the remaining LAN operation on 2026-10-14.
All three production guests now use the working `vmbr1` fibre path, not the
earlier failing `vmbr0` candidate. `/24` and gateway `192.168.0.1` are retained.

| Component | Final LAN | Unchanged private service address |
| --- | --- | --- |
| CT 104 application | 192.168.0.251/24 | 172.20.100.2/24 |
| VM 100 storage | 192.168.0.252/24 | 172.20.100.5/24 |
| CT 110 Database/Auth | 192.168.0.253/24 | 172.20.100.3/24 |

Gateway ARP and three bounded duplicate-address probes passed. A temporary
DB guest LAN interface verified gateway/SSH access before the persistent change;
it was removed. Proxmox net0 configuration and DB networkd configuration are
static; storage netplan is static, with its existing cloud-init network-disable
setting preserved. Old LAN addresses and old default routes are absent. MACs,
private net1 configurations, storage private netplan and data mount are retained.

During DB DHCP cleanup, restrictive operator umask propagated to PVE-generated
network files. Reloading networkd made its private interface unmanaged and
temporarily removed `.3`. The private address was restored immediately when
detected; non-secret network files were returned to mode 0644, and networkd
now reports both interfaces configured/routable. The operator helper was corrected
to use normal child-process umask for PVE operations while keeping protected
backups private. No database container or database data was reset or replaced.
The first storage attempt rolled back because that DB health check failed;
the corrected retry passed all private health gates.

MinIO console moved from the old LAN listener to `.252:9001`, requiring one
MinIO restart. Storage API/DB Docker container IDs remain unchanged. MinIO data
API remains loopback; Storage API/gateway and PostgreSQL/Auth remain bound to
private addresses, not the new LAN. Storage disk is mounted and MinIO active;
DNS resolves on both guests, public session/inbox/attention/monitoring/calendar
and allowed SSE checks pass. Disallowed profiles SSE still returns 400.
Grafana's final application/public/component probes all reported success.

Final proof is retained in `/root/sigap-rollouts/issue583/final-lan` on the
authorized operator host. Configuration persistence was inspected; no reboot
test was performed. Upstream Cloudflare path failures remain a separate risk.

The following restoration/preflight sections are historical evidence and do
not supersede the final address table above.

## Public Access Restoration

After the initial preflight below, CT 104 was observed with an externally updated
configuration: `net0` on `vmbr1`, `192.168.0.251/24`, gateway `192.168.0.1`.
The physical `ens4` fibre port reports 1000 Mb/s, full duplex, link detected.
The new gateway and CT 103/CT 102 connections to application port 3010 succeeded.
This existing configuration was preserved; no guest networking was rewritten.

Public SIGAP returned HTTP 502 because its proxy still addressed `10.10.10.241`.
Only the SIGAP application route (3010) and its two file/Auth-link relay routes
(3082) were switched to `192.168.0.251`. Current Caddy config was backed up,
the candidate validated and gracefully reloaded. The persistent bind-mounted
file was written in place; unrelated routes remained unchanged.

Exporter and independent maintenance service bindings were updated to `.251`,
and the existing singleton Prometheus component target became `.251:9105`.
Promtool validation passed before reload; other monitoring targets were retained.
No app/worker container restart, image deploy, business write or schema change.

Post-restoration acceptance:

- Operator computer public root/readiness: HTTP 200.
- Public authenticated session, inbox, attention and outbound list: HTTP 200.
- Read-only monitoring and calendar RPCs: HTTP 200, no RPC error.
- SSE emitted `event: ready`; disallowed profiles subscription still HTTP 400.
- Previously issued public PDF link: HTTP 200, valid PDF bytes, 98,021 bytes.
- External API health: HTTP 200; no vendor business request was made.
- Prometheus component target `.251:9105`: UP after reload.
- Independent maintenance listeners return their expected HTTP 503 on `.251`;
  maintenance is not enabled on the public application route.

Application SHA remains `8975d1fee6758d58adace26cfed4a6d159d56c37`. The gateway
recovery does not claim the earlier vantage-dependent Cloudflare TCP failure
has been fixed, nor that CT 110 and VM 100 LAN readdressing has been completed.
Authenticated acceptance used a short-lived operator identity, not an actual
password login or a two-user mutation test.

## Initial Preflight Snapshot

| Component | Requested LAN | Live LAN after preflight | Private service IP |
| --- | --- | --- | --- |
| CT 104 application | 192.168.0.251/24 | 10.10.10.241/24 | 172.20.100.2/24 |
| VM 100 storage | 192.168.0.252/24 | 10.10.10.240/24 | 172.20.100.5/24 |
| CT 110 Database/Auth | 192.168.0.253/24 | DHCP, observed 10.10.10.179 | 172.20.100.3/24 |

The user confirmed gateway `192.168.0.1`, bridge `vmbr0`, and `/24`. Gateway ARP
returned one MAC on that bridge; the three requested addresses returned no ARP
responses during three bounded requests each. No-response is not proof that a
DHCP pool/reservation cannot later assign an address.

The live temporary-address test failed before persistent changes:

- CT 104 received temporary `192.168.0.251/24` alongside its old LAN address.
- The gateway's MAC resolved, but ICMP from the new source received no reply.
- CT 102 could not connect to new application port 3010.
- HTTPS explicitly sourced from the new address timed out before connecting.
- A gateway ping explicitly sourced from the old `10.10.10.241` succeeded.

Temporary `.251` was removed. CT 110 and VM 100 were not readdressed. Persistent
Proxmox network configuration, default routes, guest netplan, Caddy, exporter
bindings and Prometheus targets remain unchanged. The application still answers
readiness HTTP 200 through its old address. Network routing/ACL/VLAN configuration
needs an authorized network operator before this rollout can proceed.

## Monitoring Evidence

### Applied Availability Dashboard Correction

After the network diagnosis, the authorized monitoring change was applied to
CT 102. The existing public DNS/TLS probes remain enabled without IP pinning,
relaxed TLS or synthetic success values. Independent origin probes now test
production `.251:3010/health/ready` and staging `.246:3011/health/ready` with
HTTP 200 plus the explicit ready response body.

Dashboard UID `sigap-availability`, version 4, now has 22 panels. Its first four
panels distinguish production/staging application readiness from their public
access paths. A failed public probe is labeled `Jalur bermasalah`, while a failed
origin probe is `Tidak siap`. Missing series are `Tidak ada data`, never healthy.
Component queries use `deployment_host="sigap-app-prod-01"` rather than the
removed `.241` IP; public HTTP codes and separate path latency are visible.

Prometheus and blackbox configuration validation passed before reload. All
stat/table query targets produced current data during verification. Grafana
13 file provisioning was verified through its dashboard resource database:
the live resource contained all 22 panels, not merely the mounted candidate.
Four focused Node tests cover the pure dashboard transformation, immutable
input, stable selectors, missing-data behavior and unique panel identities.

This corrects outage attribution, not the upstream route itself. An intermittent
Cloudflare timeout remains a real public-path failure when it occurs. No global
alerts or other applications' probes were silenced. Protected before/candidate
configuration and verification are retained under the Issue #583 operator audit.

The timestamps and application SHA below describe the earlier diagnostic
snapshot, not the subsequent PDF code release tracked by Issues #584/#585.

Actual Prometheus configuration is bind-mounted from
`/home/tactical/monitoring-stack/prometheus.yml` on CT 102, not the unrelated
`/etc/prometheus/prometheus.yml` visible in the host filesystem. Public SIGAP
probes use the `sigap_http_2xx` module, five-second module timeout, six-second
scrape timeout and 15-second scrape interval.

Bounded checks on 2026-10-14 around 07:15-07:25 UTC:

| Vantage/target | Observation |
| --- | --- |
| CT 102 production edge 104.21.92.69 | Four TCP connections succeeded; HTTPS readiness 200 |
| CT 102 production edge 172.67.187.163 | Four TCP attempts timed out; HTTPS timeout; repeated blackbox debug reproduced failure |
| Operator computer, production edge 104.21.92.69 | HTTPS readiness 200 |
| Operator computer, production edge 172.67.187.163 | TCP connection timeout |
| CT 104, both production edge addresses | HTTPS readiness 200 on both |
| CT 102 direct production application | Repeated readiness 200, approximately 1-2 ms |
| CT 102 staging edge 104.21.60.58 and 172.67.192.177 | TCP and HTTPS readiness succeeded at test time |
| Production component exporter | All six reported components up; restart counters zero |

Blackbox debug shows `probe_success 0`, `probe_http_status_code 0`, and duration
approximately five seconds for the failing public probe. DNS completed in about
0.03 seconds; the failure happened before a successful TCP/TLS/HTTP exchange.
This demonstrates a vantage-dependent network path failure. The exact upstream
router, ACL or ISP cause has not been isolated, and must not be asserted from
these observations alone.

Prometheus `up=1` for an exporter means a scrape succeeded, not that its target
is available. Availability must use `probe_success`; HTTP status zero is not a
vendor/application HTTP error response. Historic production origin probes also
contain 503 samples during authorized migration maintenance. Staging history
contains status-zero timeouts; no matching staging app outage was proven.
Historical queries sampled at 60-second steps are not exact scrape-failure counts
or an SLA calculation.

Current production application SHA remains
`8975d1fee6758d58adace26cfed4a6d159d56c37`. Containers were running at inspection;
workers without a healthcheck report lifecycle only, not end-to-end job success.

## Safe Resumption

1. Network owner confirms routing, VLAN, gateway policies and address reservations.
2. Repeat temporary-address tests: gateway, cross-subnet monitoring/proxy access,
   DNS, HTTPS, and private Database/Auth/Storage reachability.
3. Only after passing, update application proxy and exporter/maintenance bindings,
   persist each guest's LAN change, and verify after each component.
4. Retain private service network; never expose PostgreSQL or Storage admin APIs
   on the new LAN as a shortcut. Preserve current deployment images and secrets.
5. Update only SIGAP monitoring targets after service checks succeed. Separate
   public-path availability from origin readiness so their failures are distinguishable.
6. Keep public edge failures visible. Do not pin a Cloudflare IP, disable TLS
   verification, change global DNS, or suppress failures merely to make Grafana green.

Protected preflight/network backups are stored under the operator rollout directory
for Issue #583. Raw exporter debug and target history stay in the private monitoring
audit directory. Neither credential data nor raw business payloads belong in this report.
