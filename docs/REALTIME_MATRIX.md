# SIGAP Realtime Surface Matrix (audit 2026-09-28)

Staging publication `supabase_realtime` (verified read-only via SQL, staging project only):

1. `surat_registrasi`
2. `surat_signatures`
3. `surat_revision_events`
4. `surat_recommendation_tasks`
5. `notifications`
6. `profiles`
7. `master_offices`
8. `master_projects`
9. `marison_sync_issues`

## 1. Surface matrix (subscriber → query key → trigger table → publication → receiver RLS → reconnect behavior)

| Surface | Data source / query key(s) | Trigger tables subscribed | Published (staging) | Receiver RLS path | Reconnect behavior (current) |
| --- | --- | --- | --- | --- | --- |
| Sidebar badge (attention count, tone) | `["attention-state"]` (`AttentionProvider`), `get_my_attention_state` RPC | `surat_registrasi`, `surat_signatures`, `surat_revision_events`, `surat_recommendation_tasks`, `notifications`, `master_offices`, `master_projects`, `profiles`, `marison_sync_issues` | Yes — all 9 | RPC is SECURITY DEFINER; per-user state computed server-side. Events are delivered only for rows the receiver's RLS can see on the base tables | No revalidation on reconnect. Debounce 350 ms keeps resetting on bursts; refresh may be postponed without cap |
| Notification bell (unread count, list) | `["notifications"]` (query key in `AttentionProvider` refresh covers it via RPC) | `notifications` | Yes | `notifications_select_own` (`user_id = auth.uid()`) | Same as above; bell depends on attention RPC refetch |
| Admin monitoring list | `["admin-monitoring-list"]` (`RealtimeSync` `suratKeys`); `["surat-monitoring-list"]` | `surat_registrasi`, `surat_signatures`, `surat_attachments`, `activity_logs` | `surat_registrasi`, `surat_signatures` yes; **`surat_attachments` NO**; **`activity_logs` NO** | `surat_registrasi`/`surat_signatures`: `can_read_surat`; `activity_logs`: admin-only | Single 1 s timer; a second event inside 1 s cancels the pending flush and replaces the key list → monitoring refresh lost |
| Inbox list | `["surat-inbox-compact"]`, `["surat-inbox-kpi"]` (compact RPC, server-side filter + keyset cursor) | `surat_signatures`, `surat_attachments`, `surat_registrasi`, `surat_linked_documents` | `surat_signatures`, `surat_registrasi` yes; **`surat_attachments` NO**; **`surat_linked_documents` NO** | `surat_signatures`/`surat_registrasi`: `can_read_surat`; attachments/linked via `can_access_surat` | Separate 700 ms debounce, same reset-on-burst flaw; pagination reset + invalidate, filters preserved via query-key state |
| Inbox detail (open document) | `["surat-inbox-detail"]`, `["surat-linked-documents"]`, `["surat-revision-history"]` | same channel as inbox list | same gaps as above | `can_read_surat` / `can_access_surat` | Detail updates only if the same event re-triggers the timer; opened-detail changes can be missed when a later event resets the timer |
| Attachments (draft + approval upload UI) | `SuratForm` usage detail: `master_forms`, `form_usages`, `form_usage_departments`, `form_usage_steps`, `form_usage_step_users`, `form_usage_attachment_requirements`, `master_penggunaan_detail`, `workflow_allowed_departments` | **none of these are in the publication** | No | master/form tables: authenticated read (`using (true)`) | Subscription silently receives nothing; UI falls back to manual reload only |
| Dashboard / agenda / activity | `["agendas"]`, `["kpi"]`, `["status-dist"]`, `["dept-activity"]`, `["recent-logs"]`, `["activity-logs"]`, `["users"]` | `agendas`, `activity_logs`, `profiles` | `profiles` yes; **`agendas` NO**; **`activity_logs` NO** | `agendas`: scope policy; `activity_logs`: admin-only | Same 1 s timer flaw; `agendas`/`activity_logs` events never arrive (unpublished) |

## 2. Root cause (proven by reading code, not assumed)

### RC-1 RealtimeSync: burst replaces keys instead of merging (event loss)

```ts
const handleSync = (keys: string[]) => {
  if (timerRef.current) clearTimeout(timerRef.current);   // cancels pending flush
  timerRef.current = setTimeout(async () => {
    const allowedKeys = new Set(keys);                    // ONLY the latest event's keys
    await queryClient.refetchQueries({ predicate: ..., type: "active" });
  }, 1000);
};
```

Two different table events inside 1 s: the second call clears the timer and
overwrites `keys`. The first event's query group is never refetched. That is a
lost refresh, deterministic and reproducible.

Secondary flaw: `type: "active"` alone. Inactive queries (e.g. detail view left
and returned to) are not invalidated, so a stale cache can be shown later.

### RC-2 AttentionProvider: unbounded debounce resets

```ts
const scheduleRefresh = () => {
  if (refreshTimerRef.current !== null) clearTimeout(...);
  refreshTimerRef.current = setTimeout(..., 350);   // every event resets the clock
};
```

A burst longer than 350 ms spacing keeps postponing the badge refresh with no
upper bound. There is no flush cap, so the sidebar badge can lag indefinitely
under sustained event streams.

### RC-3 InboxPage: same reset-on-burst at 700 ms

`scheduleInboxRefresh` clears and re-arms per event. Same lost-refresh class.
Detail keys (`surat-inbox-detail`, `surat-linked-documents`,
`surat-revision-history`) are invalidated, but a later event during the window
again discards the earlier pending flush.

### RC-4 SSE layer: no revalidation after reconnect

`src/lib/supabase.ts` `openRealtimeSource` handles `ready`, `postgres_change`,
`stream_error`, and `onerror` (fixed 3 s retry). But on reconnect it only
re-subscribes — it never tells React Query that events during the offline gap
were missed. `SUBSCRIBED` → `ready` is the moment to revalidate.

Additional gaps:
- `realtimeReconnectTimer` is not cleared on successful open; only on error/visibility.
- No auth-change handling tied to the stream: on `SIGNED_OUT` the EventSource
  keeps the old session's tables; on `SIGNED_IN` it does not re-open.
- BFF (`backend/src/modules/bff/bff-runtime.ts`) forces `res.end()` at
  `min(45 min, token expiry − 5 min)` and on `CHANNEL_ERROR`/`TIMED_OUT`.
  The client treats this as `onerror` and reconnects in 3 s — acceptable, but
  the client never revalidates after it, so data shown can be stale until a
  later natural event.

### RC-5 Subscriptions to unpublished tables (delivery silently no-op)

Supabase Realtime only delivers `postgres_changes` for tables added to the
`supabase_realtime` publication. Subscribing to an unpublished table returns
`SUBSCRIBED` but delivers zero events. Affected subscriptions (staging):

| Table | Subscriber(s) | Staging published? | Receiver RLS (SELECT) | Decision |
| --- | --- | --- | --- | --- |
| `surat_attachments` | `RealtimeSync` (suratKeys), `InboxPage` | No | `created_by = auth.uid() or can_read_surat(surat_id)` | **Add to publication** — needed by inbox detail + monitoring; RLS already restricts rows; no cross-user exposure |
| `surat_linked_documents` | `InboxPage` | No | `can_access_surat(parent) or can_access_surat(child)` | **Add to publication** — linked recommendation docs appear in inbox detail; RLS restricts rows |
| `agendas` | `RealtimeSync` (agendaKeys) | No | `agendas_select_scope` (office hierarchy scope) | **Add to publication** — dashboard/calendar surface; scope policy already filters rows |
| `activity_logs` | `RealtimeSync`, `AttentionProvider`-adjacent | No | admin-only | **Add to publication** — receiver RLS is admin-only, so delivery to non-admins is already blocked by RLS; no exposure |
| `surat_registrasi` | both | Yes | `can_read_surat` | already covered |
| `surat_signatures` | both | Yes | `can_read_surat` | already covered |
| `surat_revision_events` | `AttentionProvider` | Yes | participants policy | already covered; **RLS predicate uses `jsonb_array_elements(verifier_snapshot)` at line 44** — same pattern proven (migration `20260805083000`) to break Realtime delivery for the verifier path. Candidate follow-up migration |
| `notifications` | `AttentionProvider` | Yes | `notifications_select_own` | already covered |
| `profiles` | both | Yes | `profiles_select_authenticated` | already covered |
| `master_offices` / `master_projects` | `AttentionProvider` | Yes | authenticated read | already covered |
| `marison_sync_issues` | `AttentionProvider` | Yes | admin select/update | already covered |
| `surat_recommendation_tasks` | `AttentionProvider` | Yes | candidate/claimer/admin | already covered |
| `master_forms`, `form_usages`, `form_usage_departments`, `form_usage_steps`, `form_usage_step_users`, `form_usage_attachment_requirements`, `master_penggunaan_detail`, `workflow_allowed_departments` | `SuratForm` usage detail | No | authenticated read (`using (true)`) | **Do NOT add now** — `SuratForm` re-render on every config change is high-frequency and cross-tenant; the UI already reloads usage details on demand. Leave as explicit non-goal; document instead |

Rules honored: no table is added without confirming the receiver RLS restricts
rows to the recipient (no cross-user access), no service-role key in the browser
(BFF uses the user's own access token), no applied migration is edited.

## 3. Design of the fix

### 3.1 Shared batched-flush primitive

One small helper replaces the three independent debounce timers. Behavior:

- events accumulate keys into a `Set` (union, never replace);
- a debounce timer fires the flush after a short quiet window;
- a **flush cap** guarantees the flush happens even under a sustained burst;
- flush does two things: `invalidateQueries` for inactive keys (so returning
  views get fresh data) and `refetchQueries` for active keys (preserves
  filters/pagination because the query options are unchanged — only the data is
  refetched).

### 3.2 SSE lifecycle (src/lib/supabase.ts)

- expose an `onReconnect` hook the providers can register against;
- on `ready` after a reconnect (not first subscription), emit a reconnect
  signal → providers revalidate the union of their keys;
- backoff stays 3 s fixed per EventSource error, plus BFF `retry: 3000` for
  network-level reconnects; no exponential escalation needed because the BFF
  already caps stream lifetime;
- clear the reconnect timer when the source opens successfully;
- on `SIGNED_OUT`, close the source; on `SIGNED_IN`/`TOKEN_REFRESHED`, reopen
  with the new session's tables;
- on `visibilitychange` → visible, revalidate (existing behavior) AND reopen the
  source if it was closed while hidden;
- no polling loop while healthy: EventSource is the only long-lived connection.

### 3.3 Why no fetch loop

The flush uses `refetchQueries({ type: "active" })`. A query is active only
while a mounted observer exists. A refetch cannot schedule another event, so
the loop cannot self-perpetuate. Inactive keys are invalidated, not refetched,
which costs no network until the view is shown again.

ponytail: single in-memory reconnect registry, no persistence. Upgrade path:
if tab-level dedupe across windows is needed later, move the registry into a
SharedWorker or BroadcastChannel.

## 4. Security hardening addendum (2026-09-28, takeover)

### 4.1 `profiles` removed from the realtime surface

- Staging `profiles_select_authenticated` allows every authenticated user to
  read every profile with `deleted_at IS NULL`; the table carries `nik`,
  `email`, and `phone`. postgres_changes delivers full rows, so every profile
  change was broadcast (also via `/api/events?tables=profiles`) to all
  logged-in users.
- The app needs broad profiles QUERY access (user directory pickers, Team
  hierarchy, parent-user lookups, admin user management) — that is unchanged.
  Tightening the SELECT policy would break those features and needs an
  explicit product decision about who may read employee profiles.
- Fix (forward-only migration
  `20260928120000_realtime_drop_profiles_from_publication.sql`):
  `ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles`.
  Publication membership does not affect PostgREST queries.
- Frontend bindings removed: `AttentionProvider` (badge refresh falls back to
  5-minute session refresh, tab-focus refetch, reconnect revalidation),
  `RealtimeSync` (`userKeys` still revalidated on reconnect/focus),
  `OrganizationHierarchyPage` (admin; refetches `['users']` on window
  focus/visibilitychange).

### 4.2 `/api/events` table allowlist (server boundary)

- `backend/src/modules/bff/bff-runtime.ts` now enforces
  `REALTIME_ALLOWED_TABLES` (12 tables: the published set minus `profiles`).
  Any requested table outside the list fails the whole stream with 400
  (`Tabel realtime tidak diizinkan`), so a future `profiles` (or arbitrary
  table) subscription cannot re-open the broadcast. RLS stays the row-level
  guard; the allowlist is the table-level guard.

### 4.3 Dead `SuratForm` subscriptions removed

- The `surat-form-configuration-sync` channel subscribed to 8 tables
  (`master_forms`, `form_usages`, `form_usage_departments`, `form_usage_steps`,
  `form_usage_step_users`, `form_usage_attachment_requirements`,
  `master_penggunaan_detail`, `workflow_allowed_departments`) that are not in
  the publication: SUBSCRIBED but never delivered. They are also outside the
  new allowlist, so keeping them would 400 the stream. Removed; the form
  reloads usage details on mount. Re-adding a subscription requires adding
  the table to the publication AND the allowlist.
