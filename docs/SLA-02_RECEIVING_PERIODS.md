# SLA-02 Department Receiving Periods

- Stage intake and processing duration are separate. The admin configuration
  supports a regular monthly window and specific-month overrides. A blank SLA
  override uses the department default. Disabling a monthly window makes that
  month unrestricted; removing its exception restores the regular rule.
- At the exact cutoff, new stages wait for the next month opening. Month length,
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
- All rule writes require an active admin and record before/after, server time
  and actor. Ordinary users cannot query private rule/snapshot lookup helpers.
- Staging-only migration `20261105063000`; no automatic business decisions,
  outbound sends, mass policy configuration or production changes are included.
- Validation: `node scripts/test-actionable-dashboard-sql.mjs --receiving` plus
  focused DepartmentReceivingPolicy/actionable-dashboard Vitest, lint, typecheck
  and build. Rehearse against actual staging definitions before applying; any
  unknown guarded function shape or migration lineage drift must stop rollout.
