# SLA-02 Weekly UI Handoff

2026-11-06 [Codex UI worker], issue #825.

## Integration

- Branch `codex/sla-weekly-ui-20261106`, isolated worktree based exactly on
  `954a5dc73eed006364e69525eb39282ac2f07693` from
  `codex/department-receiving-periods-20261105`. No staging merge.
- Cherry-pick the UI commit onto the parent's selective release branch after
  the parent SQL contract. Do not deploy this frontend without migration
  `20261106060000_weekly_department_sla_management.sql` and its scope/RLS RPCs.
- Contract unchanged: settings keyed by `dept_id`, weekly rows keyed by
  `dept_id,week_start`, regular Monday `2000-01-03`; monthly API and sentinel
  `2000-01-01` retained. Scope returns `dept_id,name`; candidates return
  `user_id,full_name,selected`; assignment sends `p_dept_id,p_user_ids`.

## UI Behavior

- Explicit policy switch writes only `department_receiving_settings.enabled`.
  Missing settings default off. Turning it off never deletes or rewrites saved
  weekly/monthly rules, and never changes existing signer SLA config.
- Weekly editor supports regular and specific Monday-based ISO weeks, native
  weekday/time controls, ordered same-week windows, optional SLA and message.
  Specific disabled rows remain saveable as weekly bypasses; deleting an
  exception restores regular rules. Monthly limits remain independently editable
  and intersect weekly rules on the server. Intake times use department config's
  timezone. UI does not recompute reception dates or rewrite frozen stages.
- Auth-only `/settings/department-sla` uses current scope, own config read/save,
  and shared receiving editor. It never mounts the admin KPI page, fetches report
  summaries/details/filter options, or offers manager assignment.
- Settings link requires a freshly successful nonempty scope. Scope cache is
  user-keyed, refetched on mount/focus and every 30 seconds, and not reused to
  grant initial access. Empty/error results unmount the editor. Config save
  rechecks scope; server RLS/RPCs remain authoritative for immediate transfer,
  inactive membership and revocation denial, including receiving-rule writes.
- Admin KPI change is only the selected-department manager section. It lists
  names and checkboxes from the admin-only candidates RPC, supports assigning
  and revoking all managers, and never fetches or renders private emails.
- Existing signer configuration fields, including `is_active`, are preserved.
  Loading/read-error states disable writes; failures do not report success.

## Verification

- `npx vitest run src/test/department-receiving-policy.test.tsx
  src/test/department-sla-settings.test.tsx
  src/test/department-receiving-service.test.ts
  src/test/requester-follow-up-sla.test.tsx
  src/test/surat-navigation-sla-tone.test.ts
  src/test/actionable-dashboard.test.tsx`: 6 files, 82 tests passed.
- New/changed focused tests: 3 files, 31 tests passed. Includes exact SQL API
  shapes, off-by-default and no destructive disable, Monday/time validation,
  regular/specific separation, disabled weekly exception, monthly retention,
  confirmed deletion, read/write failures, cached/revoked scope, config field
  preservation, no report/manager fetches on delegate page, and updated manager
  assignments retaining save confirmation.
- `npm run lint`, `npx tsc -b --pretty false`, `npm run build`: passed.
  Build emits upstream Zod pure-annotation warnings, not build errors.
- Local Playwright/Chrome checks at 1440, 390 and 320 px: optional policy on/off,
  weekly save, specific disabled week save, monthly view and manager assignment;
  no page exceptions, clipped controls or horizontal overflow. Real App route
  with mocked anonymous session redirects to login. Screenshots inspected.
- Ignored local artifacts: `tmp/sla-ui-qa.json`,
  `tmp/sla-delegate-{1440,390,320}-{off,weekly,monthly}.png`,
  `tmp/sla-admin-{1440,390,320}.png`. Local preview uses in-memory synthetic
  fixtures; all API and external requests blocked during visual checks.
- Preview server: `http://127.0.0.1:5197/tmp/sla-ui-preview.html` (delegate),
  `http://127.0.0.1:5197/tmp/sla-ui-preview.html?admin` (manager section).

## Boundaries

- No SQL, migrations, scripts, secrets, remote business-data access, deployment,
  or edits to shared WORKLOG/FEATURE_RELEASE_MAP. Parent owns integration,
  release documentation, staging/production rollout and real RLS smoke tests.
- Parent reported repeated real PostgreSQL17 weekly/delegation/audit checks
  passing. This worker verified frontend with synthetic/mocked data only; it
  does not claim live authenticated acceptance or production readiness.
- `docs/PROJECT_CONTEXT.md` was absent; existing collaboration instructions and
  worklog were read, and issue #825 carries claim/contract/handoff coordination.
