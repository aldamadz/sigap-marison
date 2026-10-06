import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_WORK_CALENDAR_DASHBOARD_SUMMARY,
  buildWorkCalendarDashboardSummary,
} from "@/features/work-calendar/lib/work-calendar-dashboard";
import {
  countUnreadWorkCalendarNotifications,
  mapWorkCalendarNotificationRow,
  readWorkCalendarNotificationCategory,
  summarizeWorkCalendarNotifications,
  WORK_CALENDAR_NOTIFICATION_DEBOUNCE_HOURS,
  WORK_CALENDAR_NOTIFICATION_ESCALATION_WORK_DAYS,
  buildWorkCalendarNotificationDedupeKey,
  type WorkCalendarNotificationRow,
} from "@/features/work-calendar/lib/work-calendar-notifications";
import { WORK_CALENDAR_NOTIFICATION_CATEGORIES } from "@/features/work-calendar/types/work-calendar-notifications";
import {
  WORK_CALENDAR_ACTIVITY_MAX_ROWS,
  createSupabaseWorkCalendarDashboardRepository,
  type SupabaseWorkCalendarDashboardClient,
  type WorkCalendarActivityRow,
  type WorkCalendarDashboardRpcQuery,
} from "@/features/work-calendar/data/supabase-work-calendar-dashboard-repository";
import { WorkCalendarDashboardWidget } from "@/features/work-calendar/components/WorkCalendarDashboardWidget";
import type { WorkCalendarDashboardSummary } from "@/features/work-calendar/types/work-calendar-notifications";
import {
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntry,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import type { WorkCalendarEntryRow } from "@/features/work-calendar/data/work-entry-row-mapper";

const root = process.cwd();

function createRpcQuery<TResult>(
  result: { data: TResult; error: { message: string } | null },
): { query: WorkCalendarDashboardRpcQuery<TResult>; abortSignal: ReturnType<typeof vi.fn> } {
  const abortSignal = vi.fn();
  const query: WorkCalendarDashboardRpcQuery<TResult> = {
    abortSignal: (signal: AbortSignal) => {
      abortSignal(signal);
      return query;
    },
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return { query, abortSignal };
}

function createClient(handler: (fn: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const abortSignals: ReturnType<typeof vi.fn>[] = [];

  const client: SupabaseWorkCalendarDashboardClient = {
    rpc<TResult = unknown>(fn: string, args?: Record<string, unknown>) {
      calls.push({ fn, args });
      const { query, abortSignal } = createRpcQuery<TResult>({
        data: handler(fn, args) as TResult,
        error: null,
      });
      abortSignals.push(abortSignal);
      return query;
    },
  };

  return { client, calls, abortSignals };
}

function createEntryRow(overrides: Partial<WorkCalendarEntryRow> = {}): WorkCalendarEntryRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    owner_id: "22222222-2222-2222-2222-222222222222",
    work_date: WORK_CALENDAR_FIXTURE_TODAY,
    title: "Pekerjaan contoh",
    realization: null,
    notes: null,
    location: null,
    status: "planned",
    kind: "work",
    is_all_day: true,
    starts_at: null,
    ends_at: null,
    blocked_reason: null,
    completed_at: null,
    due_date: null,
    color_swatch: null,
    deleted_at: null,
    created_at: "2026-03-10T01:00:00.000Z",
    updated_at: "2026-03-10T01:00:00.000Z",
    ...overrides,
  };
}

describe("Work Calendar F7 — ringkasan dashboard murni", () => {
  it("hanya menghitung pekerjaan belum selesai pada hari ini", () => {
    const entries = [
      createFixtureWorkEntry({ id: "a", status: "planned", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
      createFixtureWorkEntry({ id: "b", status: "in_progress", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
      createFixtureWorkEntry({ id: "c", status: "blocked", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
      createFixtureWorkEntry({ id: "d", status: "completed", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
    ];

    const summary = buildWorkCalendarDashboardSummary(entries, WORK_CALENDAR_FIXTURE_TODAY);

    expect(summary.todayCount).toBe(3);
    expect(summary.plannedCount).toBe(1);
    expect(summary.inProgressCount).toBe(1);
    expect(summary.blockedCount).toBe(1);
    expect(summary.todayEntries.map((entry) => entry.id)).not.toContain("d");
  });

  it("menghitung pekerjaan tertunda dari tenggat efektif yang lewat", () => {
    const entries = [
      createFixtureWorkEntry({ id: "overdue-1", status: "planned", workDate: "2026-03-08", dueDate: "2026-03-08" }),
      createFixtureWorkEntry({ id: "overdue-2", status: "blocked", dueDate: "2026-03-09" }),
      createFixtureWorkEntry({ id: "done-late", status: "completed", workDate: "2026-03-01" }),
      createFixtureWorkEntry({ id: "future", status: "planned", workDate: "2026-03-20" }),
    ];

    const summary = buildWorkCalendarDashboardSummary(entries, WORK_CALENDAR_FIXTURE_TODAY);

    expect(summary.overdueCount).toBe(2);
    expect(summary.overdueEntries.map((entry) => entry.id)).toEqual(["overdue-1", "overdue-2"]);
    // The older unfinished task also remains visible today.
    expect(summary.todayCount).toBe(2);
  });

  it("includes older unfinished work without an implicit deadline and ignores deleted/completed work", () => {
    const carried = createFixtureWorkEntry({ id: "carried", status: "in_progress", workDate: "2026-03-09", dueDate: null });
    const entries = [
      carried,
      createFixtureWorkEntry({ id: "deleted", status: "blocked", workDate: "2026-03-09", dueDate: "2026-03-09", deletedAt: "2026-03-10T00:00:00Z" }),
      createFixtureWorkEntry({ id: "done", status: "completed", workDate: "2026-03-09", completedAt: "2026-03-10T01:00:00Z", dueDate: "2026-03-09" }),
      createFixtureWorkEntry({ id: "future", workDate: "2026-03-11" }),
      createFixtureWorkEntry({ id: "event", kind: "event", workDate: "2026-03-09" }),
      createFixtureWorkEntry({ id: "availability", kind: "availability", workDate: "2026-03-09" }),
    ];
    const summary = buildWorkCalendarDashboardSummary(entries, WORK_CALENDAR_FIXTURE_TODAY);
    expect(summary.todayEntries).toEqual([carried]);
    expect(summary.todayCount).toBe(1);
    expect(summary.inProgressCount).toBe(1);
    expect(summary.plannedCount).toBe(0);
    expect(summary.blockedCount).toBe(0);
    expect(summary.overdueEntries).toEqual([]);
    expect(summary.overdueCount).toBe(0);
    expect(carried.workDate).toBe("2026-03-09");
  });

  it("mengembalikan ringkasan kosong yang stabil", () => {
    expect(buildWorkCalendarDashboardSummary([], WORK_CALENDAR_FIXTURE_TODAY)).toEqual(
      EMPTY_WORK_CALENDAR_DASHBOARD_SUMMARY,
    );
  });
});

describe("Work Calendar F7 — notifikasi murni", () => {
  it("memetakan hanya notifikasi Work Calendar dan membaca entry_ids", () => {
    const row: WorkCalendarNotificationRow = {
      id: "notif-1",
      type: "warning",
      title: "Tenggat terlewati",
      message: "2 pekerjaan melewati tenggat",
      link: "/calendar",
      is_read: false,
      created_at: "2026-03-10T02:00:00.000Z",
      data: { category: "deadline_overdue", entry_ids: ["e-1", "e-2"], dedupe_key: "x" },
    };

    const mapped = mapWorkCalendarNotificationRow(row);
    expect(mapped).not.toBeNull();
    expect(mapped?.category).toBe("deadline_overdue");
    expect(mapped?.type).toBe("warning");
    expect(mapped?.entryIds).toEqual(["e-1", "e-2"]);
    expect(mapped?.isRead).toBe(false);

    expect(
      mapWorkCalendarNotificationRow({ ...row, data: { category: "surat_baru" } }),
    ).toBeNull();
    expect(mapWorkCalendarNotificationRow({ ...row, data: null })).toBeNull();
  });

  it("mengabaikan tipe tidak dikenal dan menyaring entry id non-string", () => {
    const mapped = mapWorkCalendarNotificationRow({
      id: "notif-2",
      type: "unknown-type",
      title: "Eskalasi",
      message: "Bawahan terhambat",
      link: null,
      is_read: true,
      created_at: "2026-03-10T02:00:00.000Z",
      data: { category: "blocked_escalation", entry_ids: ["e-1", 7, null] },
    });

    expect(mapped?.type).toBe("info");
    expect(mapped?.entryIds).toEqual(["e-1"]);
    expect(mapped?.link).toBeNull();
  });

  it("membaca kategori dari kolom data secara aman", () => {
    expect(readWorkCalendarNotificationCategory({ category: "follow_up_reminder" })).toBe(
      "follow_up_reminder",
    );
    expect(readWorkCalendarNotificationCategory({ category: "lain" })).toBeNull();
    expect(readWorkCalendarNotificationCategory("bukan-objek")).toBeNull();
    expect(readWorkCalendarNotificationCategory([1, 2])).toBeNull();
  });

  it("kunci dedupe identik dengan format yang ditulis generator SQL", () => {
    expect(
      buildWorkCalendarNotificationDedupeKey(
        "deadline_overdue",
        "22222222-2222-2222-2222-222222222222",
        "2026-03-10",
      ),
    ).toBe("work-calendar:deadline_overdue:22222222-2222-2222-2222-222222222222:2026-03-10");
  });

  it("menghitung unread dan rekap per kategori", () => {
    const notifications = [
      mapWorkCalendarNotificationRow({
        id: "n1",
        type: "warning",
        title: "a",
        message: "a",
        link: null,
        is_read: false,
        created_at: "2026-03-10T02:00:00.000Z",
        data: { category: "deadline_overdue" },
      }),
      mapWorkCalendarNotificationRow({
        id: "n2",
        type: "info",
        title: "b",
        message: "b",
        link: null,
        is_read: true,
        created_at: "2026-03-10T02:00:00.000Z",
        data: { category: "follow_up_reminder" },
      }),
      mapWorkCalendarNotificationRow({
        id: "n3",
        type: "error",
        title: "c",
        message: "c",
        link: null,
        is_read: false,
        created_at: "2026-03-10T02:00:00.000Z",
        data: { category: "blocked_escalation" },
      }),
    ].flatMap((item) => (item ? [item] : []));

    expect(countUnreadWorkCalendarNotifications(notifications)).toBe(2);
    const breakdown = summarizeWorkCalendarNotifications(notifications);
    expect(breakdown.total).toBe(3);
    expect(breakdown.unread).toBe(2);
    expect(breakdown.byCategory).toEqual({
      deadline_overdue: 1,
      follow_up_reminder: 1,
      blocked_escalation: 1,
    });
  });
});

describe("Work Calendar F7 — repository dashboard", () => {
  it("memanggil generator dengan argumen opsional dan mengembalikan jumlah", async () => {
    const { client, calls } = createClient((fn) => (fn === "generate_work_calendar_notifications" ? 2 : null));
    const repository = createSupabaseWorkCalendarDashboardRepository(client);

    const count = await repository.generateNotifications({
      today: WORK_CALENDAR_FIXTURE_TODAY,
      escalationWorkDays: 3,
      debounceHours: 12,
    });

    expect(count).toBe(2);
    expect(calls[0]).toEqual({
      fn: "generate_work_calendar_notifications",
      args: {
        p_today: WORK_CALENDAR_FIXTURE_TODAY,
        p_escalation_work_days: 3,
        p_debounce_hours: 12,
      },
    });
  });

  it("memetakan baris entry dashboard dengan urutan kolom RPC", async () => {
    const { client, calls } = createClient((fn) =>
      fn === "get_work_calendar_dashboard_entries" ? [createEntryRow()] : [],
    );
    const repository = createSupabaseWorkCalendarDashboardRepository(client);

    const entries = await repository.listDashboardEntries({
      ownerId: "22222222-2222-2222-2222-222222222222",
      today: WORK_CALENDAR_FIXTURE_TODAY,
    });

    expect(calls[0]?.args).toEqual({
      p_owner_id: "22222222-2222-2222-2222-222222222222",
      p_today: WORK_CALENDAR_FIXTURE_TODAY,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Pekerjaan contoh");
    expect(entries[0].status).toBe("planned");
  });

  it("memetakan aktivitas dan membuang event type tak dikenal", async () => {
    const rows: WorkCalendarActivityRow[] = [
      {
        id: "ev-1",
        entry_id: "e-1",
        owner_id: "u-1",
        event_type: "status_changed",
        from_status: "planned",
        to_status: "blocked",
        detail: "Menunggu vendor",
        created_at: "2026-03-10T02:00:00.000Z",
        entry_title: "Input berkas",
        owner_full_name: "Budi",
      },
      {
        id: "ev-2",
        entry_id: "e-2",
        owner_id: "u-1",
        event_type: "tidak_dikenal",
        from_status: null,
        to_status: null,
        detail: null,
        created_at: "2026-03-10T02:00:00.000Z",
        entry_title: "X",
        owner_full_name: null,
      },
    ];

    const { client, calls } = createClient((fn) =>
      fn === "get_my_recent_work_calendar_events" ? rows : [],
    );
    const repository = createSupabaseWorkCalendarDashboardRepository(client);

    const activity = await repository.listRecentActivity({ limit: 5 });

    expect(calls[0]?.args).toEqual({ p_limit: 5 });
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      id: "ev-1",
      entryId: "e-1",
      eventType: "status_changed",
      fromStatus: "planned",
      toStatus: "blocked",
      ownerFullName: "Budi",
    });
  });

  it("membatasi limit aktivitas dan meneruskan abort signal", async () => {
    const { client, calls, abortSignals } = createClient(() => []);
    const repository = createSupabaseWorkCalendarDashboardRepository(client);
    const controller = new AbortController();

    await repository.listRecentActivity({ limit: 999, signal: controller.signal });

    expect(calls[0]?.args).toEqual({ p_limit: WORK_CALENDAR_ACTIVITY_MAX_ROWS });
    expect(abortSignals[0]).toHaveBeenCalledWith(controller.signal);

    await repository.listRecentActivity({ limit: 0 });
    expect(calls[1]?.args).toEqual({ p_limit: 1 });
  });
});

describe("Work Calendar F7 — widget dashboard", () => {
  const renderWidget = (summary: WorkCalendarDashboardSummary) =>
  render(
    <MemoryRouter>
      <WorkCalendarDashboardWidget summary={summary} today={WORK_CALENDAR_FIXTURE_TODAY} />
    </MemoryRouter>,
  );

  it("menampilkan jumlah pekerjaan hari ini dan tertunda", () => {
    const summary = buildWorkCalendarDashboardSummary(
      [
        createFixtureWorkEntry({ id: "a", status: "in_progress", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
        createFixtureWorkEntry({ id: "b", status: "planned", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
        createFixtureWorkEntry({ id: "c", status: "planned", workDate: "2026-03-05" }),
      ],
      WORK_CALENDAR_FIXTURE_TODAY,
    );

    renderWidget(summary);

    expect(screen.getByTestId("work-calendar-dashboard-widget")).toBeInTheDocument();
    expect(screen.getByTestId("work-calendar-dashboard-today")).toHaveTextContent("Pekerjaan hari ini");
    expect(screen.getByTestId("work-calendar-dashboard-overdue")).toHaveTextContent("Tertunda");
    expect(screen.getByTestId("work-calendar-dashboard-overdue")).toHaveTextContent("Belum selesai dan tenggat sudah lewat");
    expect(screen.getByText("2 direncanakan · 1 berjalan")).toBeInTheDocument();
  });

  it("menampilkan pesan kosong ketika tidak ada pekerjaan", () => {
    renderWidget(EMPTY_WORK_CALENDAR_DASHBOARD_SUMMARY);
    expect(screen.getByTestId("work-calendar-dashboard-empty")).toBeInTheDocument();
  });

  it("menampilkan error tanpa merender daftar", () => {
    render(
      <MemoryRouter>
        <WorkCalendarDashboardWidget
          summary={EMPTY_WORK_CALENDAR_DASHBOARD_SUMMARY}
          today={WORK_CALENDAR_FIXTURE_TODAY}
          error="Gagal memuat"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Gagal memuat");
    expect(screen.queryByTestId("work-calendar-dashboard-empty")).toBeNull();
  });
});

describe("Work Calendar F7 — keselarasan migration dan UI", () => {
  const migration = readFileSync(
    join(root, "supabase", "migrations", "20260918120000_work_calendar_notifications.sql"),
    "utf8",
  );

  it("kategori, debounce, dan ambang eskalasi selaras dengan migration", () => {
    for (const category of WORK_CALENDAR_NOTIFICATION_CATEGORIES) {
      expect(migration).toContain(`'${category}'`);
    }
    expect(migration).toContain(`p_debounce_hours integer default ${WORK_CALENDAR_NOTIFICATION_DEBOUNCE_HOURS}`);
    expect(migration).toContain(
      `p_escalation_work_days integer default ${WORK_CALENDAR_NOTIFICATION_ESCALATION_WORK_DAYS}`,
    );
    expect(migration).toContain("'work-calendar:deadline_overdue:' || v_user::text || ':' || v_today::text");
    expect(migration).toContain("'work-calendar:blocked_escalation:' || v_user::text || ':' || v_today::text");
  });

  it("anti-spam memakai dedupe unik dan debounce jendela jam", () => {
    expect(migration).toContain("uq_notifications_work_calendar_dedupe");
    expect(migration).toContain("where data ? 'dedupe_key'");
    expect(migration).toContain("n.data->>'dedupe_key' = p_dedupe_key");
    expect(migration).toContain("n.data->>'category' = p_category");
    expect(migration).toContain("make_interval(hours => greatest(p_debounce_hours, 0))");
  });

  it("eskalasi memakai hari kerja dan mengabaikan weekend serta hari libur", () => {
    expect(migration).toContain("work_calendar_work_days_for_user");
    expect(migration).toContain("work_calendar_count_work_days");
    expect(migration).toContain("extract(isodow from day)::integer");
    expect(migration).toContain("from public.holidays h");
  });

  it("helper internal tidak diberikan ke authenticated", () => {
    expect(migration).toContain(
      "revoke all on function public.work_calendar_emit_notification(uuid, text, text, text, text, text, text, uuid[], integer) from public, anon, authenticated",
    );
    expect(migration).toContain("grant execute on function public.generate_work_calendar_notifications(date, integer, integer) to authenticated");
    expect(migration).toContain("grant execute on function public.get_work_calendar_dashboard_entries(uuid, date) to authenticated");
    expect(migration).toContain("grant execute on function public.get_my_recent_work_calendar_events(integer) to authenticated");
  });

  it("widget dan lonceng terpasang pada permukaan dashboard dan header", () => {
    const dashboard = readFileSync(
      join(root, "src", "components", "dashboard", "Dashboard.tsx"),
      "utf8",
    );
    expect(dashboard).toContain("WorkCalendarDashboardWidget");
    expect(dashboard).toContain("createSupabaseWorkCalendarDashboardRepository");
    expect(dashboard).toContain("listDashboardEntries");

    const header = readFileSync(join(root, "src", "components", "layout", "Header.tsx"), "utf8");
    expect(header).toContain("notification-unread-badge");
    expect(header).toContain("formatUnreadBadge(unreadCount)");
    expect(header).toContain("generateWorkCalendarNotifications");
    expect(header).toContain("getWorkCalendarNotificationMeta");

    const recent = readFileSync(
      join(root, "src", "components", "dashboard", "RecentActivity.tsx"),
      "utf8",
    );
    expect(recent).toContain("work_calendar_events");

    const service = readFileSync(
      join(root, "src", "services", "dashboard.service.ts"),
      "utf8",
    );
    expect(service).toContain("mapWorkCalendarEventToActivityItem");
    expect(service).toContain("listRecentActivity");

    const repository = readFileSync(
      join(
        root,
        "src",
        "features",
        "work-calendar",
        "data",
        "supabase-work-calendar-dashboard-repository.ts",
      ),
      "utf8",
    );
    expect(repository).toContain('"get_my_recent_work_calendar_events"');
    expect(repository).toContain('"get_work_calendar_dashboard_entries"');
    expect(repository).toContain('"generate_work_calendar_notifications"');
  });
});
