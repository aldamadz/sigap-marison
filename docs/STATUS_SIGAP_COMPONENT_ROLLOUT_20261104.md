# OPS-16 SIGAP Component Status Rollout

2026-11-04 [Codex], staging acceptance then authorized production publication
at approximately 09:55 WIB. Source: `ecda415`, Issue #760.

## Released Scope

Four active top-level components, retaining production identity `sigap`:
Production, Staging, Storage and Service SIGAP. The last has a native accessible
disclosure for PDF, sync, outbound and API external. Each has independent
observations/history; aggregate status cannot hide a down or stale child.

No SIGAP application, database/auth, worker, vendor integration, routing, DNS
or maintenance-control deployment. The public status Workers and their D1
observation schema change, with a new read-only operator collector on Proxmox.
No opening a storage port, rendering production PDFs, job claims, sync execution
or outbound replay. Storage readiness does not inspect customer file contents.

## Verification

-45 focused JavaScript tests and4 Python collector tests passed.
- Scoped ESLint, standalone Worker build, syntax and diff checks passed.
- Genuine signed collector reports accepted into staging, then production.
  Forged reports returned401 in both environments. Replaying one real report
  twice did not duplicate raw observations or daily-summary counts.
- Staging and production public APIs show all four top-level components and
  four children UP at acceptance. Raw/daily counts match. Periodic collector
  service reports Result=success, ExecMainStatus0.
- Public root/API, RSS/Atom, group Privacy/Terms and both SIGAP app version
  endpoints return200. Maintenance source revisions remain staging17/prod0;
  no fake incident or maintenance was published.
- Desktop, mobile390, dark/light, keyboard disclosure, refresh, no horizontal
  overflow and no browser error/warning verified. New component history has
  unknown days and warm-up sample counts; no fabricated30-day availability.
- All seven CT104 runtime container IDs remain identical to preflight.
  Production app SHA remains ed124b690cecea1e89a977b1dc09620e08f1c8aa;
  staging remains5c467fe51c7aecdc678e49d7a789d63afbf62052.
- Retired production domain counters remain1,498 each after publication while
  SIGAP production and new component counters continue. Their prior evidence
  is not repurposed or deleted by the additive migration.

The parent branch's inherited npm audit reports1 high,21 moderate and1 low.
Those dependencies are not imported or bundled into these standalone Workers
or Python collector. No SIGAP app image from this older branch was built or
deployed. Existing separately deployed Zod4/security work is retained.

## Runtime Versions And Rollback

| Worker | Previous version | Released version |
| --- | --- | --- |
| marison-status-probe-staging | 28b3a3fd-d538-453a-80ea-4d32efdda70b | 10ac37cf-ab4c-4068-8bdf-119132039597 |
| marison-status-page-staging | c4c1a49f-b1b1-4759-86cd-b556f4904f76 | ceaada31-e485-4773-93fe-a60d00526ded |
| marison-status-probe | e8cebeed-9407-4116-aee1-31b72e2b24a5 | fb62d2e0-5552-4792-b7bd-f3f26d4b956b |
| marison-status-page | f66e95e9-5528-45d0-8381-3e2f53f5a002 | 9a55653b-badd-4838-95b8-1fcce07a3e58 |

D1 pre-apply Time Travel bookmarks:

- Staging: `00000009-000000db-00005119-1c274602bad0e5f1472ecfcddf0b7df9`.
- Production: `00000009-000004f8-00005119-7dd4c534ceba1a3dca33a44d7e969358`.

Prefer additive rollback: disable only `sigap-status-collector.timer`, restore
the previous page/probe Worker versions, keep D1 tables/history. Do not restore
a full database snapshot or delete fresh observations merely to revert UI.
The old probe would resume the retired domains if restored; verify intended
scope. Never restart/revert SIGAP app containers for status-only rollback.

Collector source and owner-only configuration/signing key are under the private
operator directory `/opt/sigap-status` on Proxmox. Private key material is not
in Git or public status output. Existing service units are named
`sigap-status-collector.service` and `.timer`. The reporting receiver permits
only fresh signed allowlisted observations; no remote shell/control interface.

This release changes monitoring visibility, not the underlying availability
target. The four historical SIGAP timeouts remain evidence for OPS-15/#750;
their root cause and99.99% availability are not claimed resolved here.
