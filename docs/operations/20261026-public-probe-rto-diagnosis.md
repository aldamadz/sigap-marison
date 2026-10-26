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

## Remediation Follow-Up, 26 October 08:41 WIB

- Maris explicitly authorized inspecting and repairing the failing multi-WAN
  path while preserving production access. Grafana timeouts must not be changed.
- Gateway `10.10.10.1` exposes TP-Link Omada Controller. The visible controller
  page requires login; an authenticated management session is not yet available.
  The router policy/NAT/WAN configuration therefore remains unverified. A browser
  tab was left for operator login; no credentials were requested in chat, guessed,
  extracted from another application, or reset.
- A new pinned HTTPS baseline reproduces the failure from CT 102 and CT 104.
  From proxy CT 103, both production addresses returned HTTP 200 in about
  0.18/0.40 seconds. Both tested staging addresses returned 200 from all three
  sources. The app was healthy/running/not restarting/not OOM-killed, and origin
  live/ready/version returned 200 from the proxy in 2-4 ms.
- Next action after login: inspect active policy ordering, WAN state, link-backup
  behavior, NAT/port forwarding and affected source groups; preserve a private
  configuration backup and an exact rollback for any narrowly scoped change.
  Verify both production addresses from CT 102/104/103, direct origin readiness,
  public access and subsequent Blackbox samples before declaring recovery.
- No router, OS route, NAT, DNS, Grafana, application, worker or database change
  has been made. The user-requested repair is still pending management access.

## Remediation Applied, 26 October 09:34 WIB

- After operator login, Omada site `maris` on ER7212PC v1.0 showed no prior
  policy routing or configured static route. Both WANs were active: WAN3 next
  hop `192.168.88.1`, SFP WAN/LAN1 next hop `192.168.18.1`; load balancing
  weights remained SFP 2, WAN3 1. The four existing inbound port-forwarding
  rules, including TCP 80/443 to proxy CT 103 on SFP WAN/LAN1, were recorded
  before the change and rechecked unchanged afterward.
- Created IP group `SIGAP_SERVERS_OPS15` containing only monitoring CT 102
  `10.10.10.102/32`, application CT 104 `192.168.0.251/32`, and proxy CT 103
  `10.10.10.253/32`. Created IP-port group `SIGAP_CF_HTTPS_OPS15` containing
  only `172.67.187.163/32` on port 443. Enabled policy
  `SIGAP_CF_WAN3_OPS15`: TCP, those source/destination groups, WAN3, with
  Omada's other-WAN fallback enabled. No general default route, WAN weights,
  NAT, firewall, VLAN, DNS, monitoring threshold or application config changed.
- Before the rule, the affected production address timed out 3/3 TCP attempts
  from CT 102 and CT 104. A later baseline also timed out 3/3 from CT 103;
  its earlier successes indicate source-dependent WAN selection varied over
  time. After adding all three exact source IPs, pinned HTTPS from each CT to
  both production Cloudflare addresses and both staging addresses returned
  HTTP 200. The affected address took approximately 0.36-0.39 seconds.
  Direct production origin live/ready/version from the proxy returned 200 in
  about 2-3 ms; application state remained healthy, with no restart or OOM.
- At approximately 09:34 WIB, Prometheus recorded production public-path
  `probe_success=1`, HTTP 200, duration 0.358 seconds. The most recent 60/60
  samples over 15 minutes succeeded; staging also had 60/60. The production
  30-minute range still contained 10 pre-remediation failures in 120 samples.
  Historical 24-hour availability will improve only as old failures age out.
- A scoped pre-change snapshot was saved outside the repository at
  `C:/Users/Aldama/Downloads/sigap-ops15-router-before-20261026.json`.
  A screenshot of the enabled final policy is at
  `C:/Users/Aldama/Downloads/SIGAP-OPS15-Omada-routing-20261026.jpg`.
  Omada Cloud disabled local full-controller export and offered file-server
  export only; these artifacts are not a full backup.
- Rollback: disable only `SIGAP_CF_WAN3_OPS15` in site `maris` > Network Config
  > Routing > Policy Routing, then repeat pinned HTTPS checks and public probe.
  The two OPS15 groups can remain unused. Do not restore the entire controller.
  This bypasses the observed failing path for one current Cloudflare IP and
  three production source IPs. A changing Cloudflare DNS address or other
  client source may require a separate investigation; the upstream fault on
  SFP WAN/LAN1 is not established or repaired by this policy.
