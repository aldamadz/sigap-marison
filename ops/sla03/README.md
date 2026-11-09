# SLA-03 Operator Proof

Use only with explicit environment authorization and the normal release guards.
These helpers do not deploy containers, approve documents or send outbound jobs.

## Migration Order

Production's audited active-breach function has a compact call layout. Apply
`20261109105900_signer_action_sla_clock_compat.sql` before the immutable
`20261109110000_signer_action_sla_clock.sql`, in one transaction. Compatibility
changes whitespace only; unknown layouts fail closed. Staging already applied
the clock, so the explicitly audited compatibility addition is a no-op there.
Do not use bulk replay, `--include-all` or migration-history repair.

The production helper pins both source digests. Copy both exact SQL files and
`production-operator.py` to `/root/sigap-sla03-20261109` on the Proxmox host. It
asserts CT110 identity and connects only to `sigap-supabase-db` locally. Run modes
in order: `preflight`, `rehearse`, `apply`, `verify`, `acceptance`. The preflight
compares the ledger to the protected prior MRN30 baseline and never overwrites
the original snapshot. Rehearsal always rolls back, including its second apply.
Apply additionally requires `ACK_SLA_APPLY=production:<clock-source-sha256>`.
This digest is not a credential; the exact value is pinned in the helper.

Business-table fingerprints, approval/verification function definitions and
owners/ACLs, existing public KPI caller grants and private-clock denial are
checked inside the transaction. Audit artifacts stay in the mode0700 operator
directory. Do not publish full snapshots or environment output.

## Staging Follow-up

The staging helper defaults to the original clock rollout. `--compat` uses a
separate proof directory and compares against the original successful clock
apply ledger. Run `preflight`, `rehearse`, `apply`, `verify` with `--compat` and
the exact staging acknowledgement. This retains the original clock evidence.

## Application Rollout

Select only the SLA03 feature into main; synchronize main to source AND live
staging. Use the official workflow with exact migration acknowledgement:
`20261109105900,20261109110000` for production, or only `20261109105900` for
staging that already runs the clock. No worker source changed in this release.
Verify public SHA, readiness, container health and unchanged worker identities.

Production acceptance uses an existing current paused signature, read-only SQL
under its assigned user's authenticated role, existing KPI/dashboard RPCs and
private-schema denial. A separate privileged read evaluates elapsed time one
hour forward without advancing any real clock. No business fixture, browser
session token, approval or notification is created. This is an operator SQL
role-context check, not a claim of browser approval acceptance.
