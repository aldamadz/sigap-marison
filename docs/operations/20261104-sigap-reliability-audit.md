# SIGAP Public Reliability: Read-Only Follow-Up

Date: 2026-11-04, approximately 09:22-09:30 WIB. Author: [Codex].
Feature: OPS-15. Tracking: Issue #750.

## Scope

The user requested SIGAP-only diagnosis. Other services may be removed from
monitoring later; no monitor was removed during this investigation. No app,
worker, database, network, DNS, probe threshold or production deployment changed.

## Recorded Failures

Production D1 `checks` contained 1,465 SIGAP samples when queried: 1,461 healthy
and four failed. Observations began on 2026-11-03, not a complete 30-day window.
All four failures reached the probe's eight-second timeout:

| Time (WIB) | Recorded outcome | Interpretation from the deployed probe |
| --- | --- | --- |
| 3 November 17:01:50 | degraded | Public root check failed; health check passed |
| 3 November 21:01:50 | degraded | Public root check failed; health check passed |
| 4 November 00:01:50 | degraded | Public root check failed; health check passed |
| 4 November 02:12:50 | down | Health check failed; root result not retained separately |

For each event, the immediately previous and next minute were healthy, with
reported latency between 742 and 929 ms. These are isolated failed samples,
not proof of four full minutes of downtime or a measured outage duration.

## Monitoring Defects And Visibility Gaps

1. The deployed `marison-status-probe` script was downloaded read-only and
   confirmed to contain `failed?.httpStatus ?? 200`. A timeout returns null
   HTTP status internally but this fallback stores 200. Historical 200 therefore
   does not establish that an HTTP response was received. The outcome remains
   failed, so this is a misleading diagnostic field, not a reason to erase the
   failure or increase availability.
2. Only one aggregate result is retained. Page versus health timing, response
   phases, correlation identifiers and the successful counterpart are missing.
   Timings on successful checks are measured before reading the response body;
   they are not full response-completion latency.
3. `backend/src/routes/health.routes.ts` returns `status: ready` without testing
   database/auth/storage dependencies. It establishes that the app handler can
   respond, not that login and document workflows are usable.
4. `backend/src/app.ts` disables request logging. The currently retained app
   container logs did not provide historical root/health request timing for
   these events. The current app container was created after all four events.

## Current Infrastructure And Bounded Checks

- CT104 is running. Current app reports healthy, restart count zero and no
  OOM flag; these describe the current container, not deleted older instances.
- CT104 root disk: 59 GiB total, 47 GiB used, approximately 9 GiB available,
  85% used. This warrants capacity management but is not a proven timeout cause.
- CT104 memory snapshot: 748 MiB used of 4,096 MiB, approximately 3,347 MiB
  available. No evidence of current memory exhaustion.
- Three sequential cycles tested root and ready locally and publicly from
  CT104: all 12 GET requests returned 200. Local response completion was
  1.2-1.9 ms; public completion was 154-244 ms. This is a small point-in-time
  sample from one network, not a public-user percentile or SLO guarantee.
- The active DATABASE-U24 tunnel is healthy with four established connections
  and no pending reconnect. Its SIGAP ingress still targets the configured
  HTTPS reverse proxy with matching host/SNI; TLS verification was not disabled.
- Narrow retained tunnel-log windows around the four failures do not establish
  a tunnel disconnect affecting SIGAP. The first window contained cancellation
  errors at 17:00:35 WIB, not at the failed sample; the other windows were empty.
  Neither observation proves that the public network was fault-free.

## Conclusions And Next Work

The evidence establishes occasional public-path timeouts, but does not locate
their cause in Cloudflare, the shared tunnel/reverse proxy, WAN routing or the
application. Do not label the prior multi-WAN fault as recurring without new
transport evidence. Do not blame deployment without retained timeline evidence.

Recommended staged work, not implemented by this audit:

1. Preserve real nullable HTTP status and both endpoint results, measuring
   headers and full completion separately. Record privacy-safe identifiers and
   failure phases without credentials, query strings or document content.
2. Add bounded slow/error request observations and correlate edge, proxy and
   origin timing; retain enough history across container replacements.
3. Define separate process liveness and bounded dependency readiness checks.
   Avoid expensive per-probe authentication queries or global dependency fanout.
4. Rehearse a readiness-gated rolling app deployment and connector failure
   scenarios in staging before proposing production changes. Redundant processes
   on one host do not protect against host/power/network failure.
5. Keep raw failed observations and unknown history. Any alert confirmation or
   retry policy must be explicit and must not rewrite original availability.

Production changes require a separate explicit release instruction. No promise
of 99.99% availability is made from this small observation window. Monitoring
only SIGAP will change service scope, not SIGAP's historical availability.

`docs/PROJECT_CONTEXT.md` was not present in the supplied checkout. Existing
shared instructions and unrelated working-tree changes were left intact.
