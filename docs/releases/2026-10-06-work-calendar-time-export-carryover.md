# CAL-04: Calendar Timing, PDF And Carryover

Issue: #466. Feature branch: `feature/work-calendar-time-export-carryover-01`.
Base: production `9479821d4cf51bc21a9389c227bf245a2f5b340a`.

## Behavior

- PDF export uses the selected personal date range and status filter, one row per
  canonical task, with No., date, title, status, start, finish, duration and result.
  Team export is intentionally unavailable. History failures abort the whole
  export; changing date, view or account cancels an in-flight export.
- Automatic timing uses server lifecycle events, configured workdays/hours,
  holidays and automatic office breaks. Blocked/planned/completed-to-reopen gaps
  do not accrue work time. Explicit intervals retain manual overtime, excluding
  configured breaks and recorded pauses. Durations are clipped to the export
  range. Missing legacy evidence is reported as unknown, never inferred from
  creation time. Unfinished tasks have no fabricated completion timestamp.
- Unfinished work appears on subsequent dates through today while retaining its
  original ID and date. Completed work carries only through its actual Jakarta
  completion date. Events and availability entries do not carry over.
- Only an explicitly configured deadline produces overdue indicators or
  notifications. Calendar, team RPCs and dashboard use the same rule.
- The title menu waits for menu focus restoration before focusing its editor.
  Row icons align with the title control. The mobile filter shares a row with
  export instead of adding another toolbar row.

## Verification

Independent review initially found four defects: reopen-gap timing, dashboard
carryover, null-deadline detail copy and continuation of non-work kinds. All were
corrected and covered by regressions; the second review passed.

`node scripts/test-work-calendar-sql.mjs` runs historical baseline assertions
before the new contract, in separate disposable Postgres 17 instances. The new
contract checks populated-data preservation, replay, authorization, pagination,
completion dates, explicit deadlines, notifications and unchanged RPC ACLs.

Local browser checks covered rename, Monday/Tuesday visibility, day/week/month,
mobile 390px and desktop 1440px, light/dark and no horizontal mobile overflow.
The PDF generator's actual multipage bytes were rendered and inspected. Browser
download-path capture was unavailable in the in-app harness; do not count that
as a verified downloaded-file acceptance result.

## Migration And Environment Gates

`20261006080000_work_calendar_carryover_deadlines.sql` replaces five canonical
RPC definitions only; it does not rewrite stored tasks, histories or shared
notifications, change table policies or grant new privileges.

Staging read-only preflight found exactly this one pending migration, no ledger
drift, and all five baseline definitions matching their tracked source. The
preapply definitions and fingerprints are backed up privately on the operator
host. Staging apply must preserve function owners/ACLs and business data.

Production is **not ready for this migration**: the five calendar RPCs and the
seven CAL-03 migration ledger entries are absent, and the calendar feature flag
is disabled. Production also has historical migration version aliases. Do not
run old migrations, repair the ledger, acknowledge an unapplied migration, or
enable the feature implicitly. Audit a forward-only CAL-03 bootstrap separately
before production promotion; keep the existing flag until user confirmation.

Application rollback uses the previous runtime revision. A database rollback,
if required, restores the backed-up canonical function definitions through a
reviewed forward-only migration; applied files/history are never rewritten.

The test-only `@testing-library/user-event` dependency supports actual menu
pointer/keyboard regression tests. The lockfile also updates `source-map-js`
to 1.2.2 to remove a high-severity advisory; two moderate upstream advisories
remain and are not hidden by an unsafe force-upgrade.

No PDF, Marison sync or outbound worker restart is needed. No vendor call or
real production task is part of the acceptance procedure.
