# SLA-02 Department Receiving Periods

- Stage intake and processing duration are separate. Optional department policy
  defaults off; existing signer SLA remains unchanged. Enabling/disabling does
  not delete saved receiving rules or rewrite an already captured stage policy.
- Weekly reception supports a regular ISO-week window plus Monday-dated
  exceptions. For example, Monday08:00 through Thursday16:00 queues a new stage
  arriving exactly Thursday16:00 to the next valid week opening. Disabled week
  exceptions bypass the regular weekly window; deletion restores the default.
- Monthly rules and month exceptions remain available for closing periods;
  weekly and monthly windows intersect. A blank SLA override inherits signer
  configuration; a received stage freezes the policy of its receiving period.
- At the exact cutoff, new stages wait for the next valid opening. Month length,
  workdays, holidays, work start/end and breaks are respected. Invalid schedules
  fail closed with a bounded search, never an infinite loop.
- The rule and processing calendar are frozen when a new stage first receives
  availability. Ordinary edits, changed default settings, caller-supplied policy
  JSON or clearing future availability cannot bring that stage forward.
- Work already received continues. Legacy signatures are not backfilled; their
  previous clock semantics remain. The same assigned stage retains its captured
  policy through revision, while newly activated later stages use current rules.
- Future stages remain visible as waiting in dashboard/status, not actionable
  inbox. Server triggers reject premature signing/verification, the reminder RPC
  rejects premature reminders, and SLA clocks do not mark that waiting as late.
- Admin selects a department and assigns active department members in
  Configuration > SLA Departemen. Delegates use Settings > SLA departemen;
  they cannot appoint other managers or open admin KPI reports. Transfer,
  inactivity and revocation remove access immediately through server RLS.
- All rule/config/grant writes record persisted before/after, server time and
  actor. Conflict-ignore operations never create phantom audit events. Private
  clock/snapshot helpers remain unavailable to clients.
- Forward migrations20261105063000 and20261106060000; user authorized staging
  then production on2026-11-06. No automatic enablement, manager assignment,
  business decisions, approval, outbound send or historical backfill included.
- Validation: `node scripts/test-actionable-dashboard-sql.mjs --receiving` plus
  focused DepartmentReceivingPolicy/actionable-dashboard Vitest, lint, typecheck
  and build. Rehearse against actual staging definitions before applying; any
  unknown guarded function shape or migration lineage drift must stop rollout.
- Weekly/delegation gate: `node scripts/test-actionable-dashboard-sql.mjs
  --weekly --live-shape`, including impossible calendars failing closed,
  before/exact cutoff, year rollover, audit integrity and authorization.
