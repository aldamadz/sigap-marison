# SIGAP LAN and Availability Audit

Tracking: [Issue #583](https://github.com/aldamadz/frontend/issues/583).
Date: 2026-10-14. Scope: production guest LAN addresses and production/staging
monitoring diagnosis. No application code, business data, database schema,
credentials, public DNS or vendor submission was changed.

## Requested and Live Addresses

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
