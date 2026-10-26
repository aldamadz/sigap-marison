# OPS-15: Public Probe RTO Diagnosis

2026-10-26 [Codex], Issue #750. Read-only observations around 08:18-08:30 WIB.
Source base: production main `ba813c92d7eaef0ea808a071f7f41597dd6bf6e2`.

## Findings

The application is responsive, but the monitoring source cannot consistently
reach one of the production hostname's Cloudflare IPv4 addresses. This is a real
transport failure from that source, not an HTTP error returned by SIGAP and not
evidence that all external users experienced the same availability.

Prometheus rolling 24-hour observations at approximately 08:18 WIB:

| Probe | Successful samples | Notes |
| --- | --- | --- |
| Production origin | 100% | Direct application readiness endpoint |
| Production public | About 63.4% | p95 approximately 5 seconds, the probe timeout |
| Staging origin | 100% | Direct application readiness endpoint |
| Staging public | About 99.86% | Eight failed samples in approximately 5,760 |

All SIGAP probe scrape targets themselves were up 100% in that window. A
successful scrape is not the same metric as `probe_success`. Production origin
probe p95 was approximately 3 ms. No resource saturation was established.

## Transport Evidence

- Production DNS returns `104.21.92.69` and `172.67.187.163`.
- From monitoring CT 102, pinned HTTPS to `104.21.92.69` returned HTTP 200 in
  approximately 0.20 seconds. Pinned HTTPS to `172.67.187.163` timed out while
  connecting to TCP 443, before TLS or an HTTP response.
- Blackbox debug independently reported `context deadline exceeded`, HTTP
  status 0, approximately 5 seconds, and no completed connect/TLS phase for
  `172.67.187.163`. DNS resolution completed in approximately 27 ms.
- Across the sampled 24-hour address-hash history, the failing address had about
  2,105 failures in 2,817 samples; the other address had three in 2,943. Windows
  also reproduced a pinned TCP connection timeout to the failing address.
- A separate repeated TCP check produced three failures out of three from CT 102
  and app CT 104, versus three successes out of three from Proxmox and proxy CT
  103. All four sources could reach `104.21.92.69` and staging's tested address
  `172.67.192.177`.
- TCP traceroute to the same failing address took different next-hop paths:
  Proxmox: `10.10.10.1 -> 192.168.88.1`; CT 102:
  `10.10.10.1 -> 192.168.18.1`. Later hops also differed. Each trace was bounded
  to eight hops and did not establish the exact failing upstream hop.
- Hourly production failures rose sharply around 25 October 14:00 WIB and
  remained frequent. Earlier isolated failures are a separate observation.

This narrows the incident to source-dependent network egress toward one
Cloudflare address. Multi-WAN policy/routing/NAT and the selected upstream path
require inspection. The router's configuration was not inspected, so a specific
firewall rule, ISP fault or globally broken Cloudflare address is not proven.

## Origin and Proxy Checks

The production application and relevant containers were running, with the app
healthy. The active Caddy SIGAP route points to `192.168.0.251:3010`, not the
retired Ubuntu app. No SIGAP proxy errors appeared in the sampled recent logs.
The old Caddy single-file bind-mount configuration drift remains a separate
known concern; do not reload the shared proxy from its stale container file.

## Recommended Follow-Up

1. Audit router policy routing, WAN selection, NAT and firewall for CT 102 and
   CT 104 against `172.67.187.163:443`; compare the working and failing WAN paths.
2. Correct or fail over the unhealthy egress path only after identifying the
   relevant rule and obtaining approval. Verify both Cloudflare addresses from
   affected sources after the change.
3. Add an independent off-site public probe, and label local public-path
   availability separately from origin availability. Retain failures as evidence.
4. Do not pin the domain to the currently working Cloudflare address, suppress
   failed samples, or simply increase timeouts to make availability look better.

No production/staging config, DNS, routing, app, database, worker, monitoring
threshold or business data was changed. No restart, deploy or external submission
was performed. Investigation is documented; network remediation remains open.
