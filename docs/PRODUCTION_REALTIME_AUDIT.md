# Production Realtime Audit (READ-ONLY) — 2026-09-28

Scope of this document: item 8 of the realtime fix task. Every statement below is
either an observation from a read-only check or an explicit `UNVERIFIED` flag.
Nothing was changed on production.

## 1. What was verified read-only

| Check | Method | Result |
| --- | --- | --- |
| Production runtime SHA | GET `https://sigap.marisoncloud.com/health/version` | `d1d066ecddd74bd35a071e6ae1d295f3d48a769d` |
| Runtime vs branch | `git rev-parse origin/main` | identical — production runtime is at current `main` tip |
| Migration presence in source | `git cat-file -e origin/main:<file>` | `20260721210000` present; `20260805083000` present |
| Staging publication (for contrast) | MCP SQL SELECT on staging project | 13 tables (after this fix) |

## 2. What could NOT be verified read-only

The Supabase MCP connection in this session resolves to the **staging** project
(`wrufczusfopgvwvxsmjk`). The production project is a different project
(`xuhyodtmgwteyslhrkfx`) and no production DB credential is available, so the
following are marked **UNVERIFIED**, not assumed:

- The exact membership list of production's `supabase_realtime` publication.
- Whether `20260721210000` and `20260805083000` are actually recorded in
  production's `supabase_migration_history` (presence in `main` source is not
  proof of application).
- The live definition of `can_read_surat` and
  `surat_revision_events_participants_select` on production.

The task's prior assertion (production publishes only `surat_registrasi`,
`surat_signatures`, `notifications`) is treated as a **claim to re-verify**, not
as fact. The promotion plan below depends on confirming it first.

## 3. Source-level inventory of what production code subscribes to

From `origin/main` (the exact source the production runtime reports):

| Table | Subscribed by | Expected published on production |
| --- | --- | --- |
| `surat_registrasi`, `surat_signatures` | `RealtimeSync`, `AttentionProvider`, `InboxPage` | assumed yes (unverified) |
| `notifications` | `AttentionProvider` | assumed yes (unverified) |
| `surat_attachments` | `RealtimeSync`, `InboxPage` | **assumed no** (6-table gap claim) |
| `surat_linked_documents` | `InboxPage` | **assumed no** |
| `agendas`, `activity_logs` | `RealtimeSync` | **assumed no** |
| `surat_revision_events`, `surat_recommendation_tasks`, `profiles`, `master_offices`, `master_projects`, `marison_sync_issues` | `AttentionProvider` | **assumed no** |

This is the six-table gap referenced in the task. It must be confirmed by a
read-only query against the production DB before any promotion.

## 4. Selective promotion plan (do NOT run yet)

Goal: bring production to parity for the realtime surfaces only, without
carrying unrelated staging work.

### Step 0 — obtain explicit production permission

Per `AGENTS.md`, production DB/config changes require an explicit production
request from the user. This plan is **blocked** until that is given. Staging
success is not production proof (see section 7).

### Step 1 — read-only confirmation (no writes)

Run on production, read-only:

```sql
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;

select version, name, statements
from supabase_migration_history.schema_migrations
where version in ('20260721210000','20260805083000');

select pg_get_expr(polqual, polrelid)
from pg_policy
where polname in ('surat_revision_events_participants_select');
```

Decision gate: if the actual publication differs from the claim above, STOP and
re-audit. Do not proceed on stale assumptions.

### Step 2 — schema promotion (only the two migrations from this PR)

Apply to production, in order, with verification between:

1. `20260928030948_realtime_publish_inbox_agenda_tables.sql`
2. `20260928031002_surat_revision_events_verifier_realtime_rls.sql`

Both are forward-only and idempotent (re-runnable), so a partial-apply retry is
safe. They do not depend on each other, but order keeps RLS last so that events
for `surat_revision_events` are only delivered after the verifier predicate is
Realtime-evaluable.

Do NOT use `supabase migration up --include-all` or any repair command. If the
local vs remote migration history diverges, stop and audit the difference.

### Step 3 — application promotion

Open a PR from `fix/realtime-batch-reconnect-01` to `main` (not staging). It must
contain only the realtime changes. Deploy production from `main` after review.

The application change is backward-compatible with a production DB that has not
yet received the publication migration: unpublished tables simply deliver no
events (as today), so app + DB can be promoted in either order. The recommended
order is DB first, then app, so that events are flowing the moment the new
client connects.

### Step 4 — post-promotion smoke test (read-only)

- GET `/health/version` → confirm new SHA.
- GET `/health/live`, `/health/ready` → confirm ok/ready.
- Confirm no new publication rows leaked: publication count must equal expected.

## 5. Rollback plan

### Staging rollback

1. Revert the app commit from `staging` (or deploy the previous image).
2. Drop the four tables from the publication (safe; the app falls back to the
   existing focus-refetch and window-focus revalidation):
   ```sql
   alter publication supabase_realtime drop table
     public.surat_attachments, public.surat_linked_documents,
     public.agendas, public.activity_logs;
   ```
3. Restore the previous RLS predicate from `20260706100000_surat_revision_flow.sql`
   if the containment form causes any issue. Note: the old form breaks Realtime
   delivery to verifiers, so this is a functional downgrade, not a security one.

### Production rollback

Same steps as staging, plus: after rollback, verify `/health/version` and confirm
the publication list returned to the pre-promotion baseline recorded in Step 1.

## 6. Migration history divergence (explicit)

`main` and `staging` migration sets have diverged by design: staging carries
fixture and staging-only migrations that production must never receive. The two
migrations in this PR are written to be safe on both. Nothing in this PR requires
running an old migration, `--include-all`, or a repair.

## 7. Non-claim

Staging E2E success does **not** establish that production is realtime-complete.
Production readiness requires Step 1's read-only confirmation plus the smoke test
in Step 4. Until then, production status for the six-table gap stays
`UNVERIFIED`.
