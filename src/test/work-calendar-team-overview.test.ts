import { describe, expect, it, vi } from "vitest";

import {
  applyWorkTeamOverviewFilterChange,
  clampWorkTeamOverviewPage,
  clampWorkTeamOverviewPageSize,
  countActiveWorkTeamOverviewFilters,
  createWorkTeamOverviewFilters,
  getWorkTeamOverviewPageCount,
  listWorkTeamOverviewDepartmentOptions,
  listWorkTeamOverviewMemberOptions,
  normalizeWorkTeamOverviewSearch,
  readWorkTeamOverviewUrlState,
  reconcileWorkTeamOverviewFilters,
  toWorkTeamOverviewDbStatus,
  writeWorkTeamOverviewUrlState,
} from "@/features/work-calendar/lib/work-team-overview";
import {
  createSupabaseWorkTeamOverviewRepository,
  WORK_TEAM_OVERVIEW_UNNAMED_LABEL,
  mapWorkTeamOverviewOptionRow,
  mapWorkTeamOverviewRow,
  type SupabaseWorkTeamOverviewClient,
  type WorkTeamOverviewOptionRow,
  type WorkTeamOverviewRow,
  type WorkTeamOverviewRpcQuery,
} from "@/features/work-calendar/data/supabase-work-team-overview-repository";
import type { WorkTeamOverviewOption } from "@/features/work-calendar/types/work-team-overview";

const DATE = "2026-09-15";

function createOverviewRow(overrides: Partial<WorkTeamOverviewRow> = {}): WorkTeamOverviewRow {
  return {
    member_id: "member-1",
    full_name: "Sinta Maharani",
    job_title: "Staf Operasional",
    office_id: "office-a",
    office_name: "Kantor Pusat",
    department_id: "dept-finance",
    department_name: "Keuangan",
    member_total: 4,
    member_completed: 1,
    member_in_progress: 1,
    member_planned: 1,
    member_blocked: 1,
    member_overdue: 0,
    total_count: 30,
    aggregate_total: 120,
    aggregate_completed: 40,
    aggregate_in_progress: 30,
    aggregate_planned: 40,
    aggregate_blocked: 10,
    aggregate_overdue: 8,
    ...overrides,
  };
}

describe("lib work-team-overview — filter murni", () => {
  it("membuat filter default tanpa filter aktif", () => {
    const filters = createWorkTeamOverviewFilters(DATE);
    expect(filters).toEqual({
      officeId: null,
      departmentId: null,
      memberId: null,
      search: "",
      status: "all",
      workDate: DATE,
    });
    expect(countActiveWorkTeamOverviewFilters(filters)).toBe(0);
  });

  it("menghitung filter aktif sesuai urutan Kantor -> Departemen -> Anggota", () => {
    const filters = {
      ...createWorkTeamOverviewFilters(DATE),
      officeId: "office-a",
      departmentId: "dept-finance",
      memberId: "member-1",
      status: "blocked" as const,
      search: " sinta ",
    };
    expect(countActiveWorkTeamOverviewFilters(filters)).toBe(5);
  });

  it("normalisasi pencarian memangkas spasi dan membatasi panjang", () => {
    expect(normalizeWorkTeamOverviewSearch("  sinta  ")).toBe("sinta");
    expect(normalizeWorkTeamOverviewSearch("x".repeat(200))).toHaveLength(120);
  });

  it("cascading: mengubah kantor membersihkan departemen dan anggota", () => {
    const current = {
      ...createWorkTeamOverviewFilters(DATE),
      officeId: "office-a",
      departmentId: "dept-finance",
      memberId: "member-1",
    };
    const next = applyWorkTeamOverviewFilterChange(current, {
      type: "office",
      value: "office-b",
    });
    expect(next.officeId).toBe("office-b");
    expect(next.departmentId).toBeNull();
    expect(next.memberId).toBeNull();
  });

  it("cascading: mengubah departemen membersihkan anggota tetapi bukan kantor", () => {
    const current = {
      ...createWorkTeamOverviewFilters(DATE),
      officeId: "office-a",
      departmentId: "dept-finance",
      memberId: "member-1",
    };
    const next = applyWorkTeamOverviewFilterChange(current, {
      type: "department",
      value: "dept-ops",
    });
    expect(next.officeId).toBe("office-a");
    expect(next.departmentId).toBe("dept-ops");
    expect(next.memberId).toBeNull();
  });

  it("mengubah anggota tidak menyentuh parent", () => {
    const current = {
      ...createWorkTeamOverviewFilters(DATE),
      officeId: "office-a",
      departmentId: "dept-finance",
    };
    const next = applyWorkTeamOverviewFilterChange(current, {
      type: "member",
      value: "member-1",
    });
    expect(next.officeId).toBe("office-a");
    expect(next.departmentId).toBe("dept-finance");
    expect(next.memberId).toBe("member-1");
  });

  it("status all tidak dikirim ke database", () => {
    expect(toWorkTeamOverviewDbStatus("all")).toBeNull();
    expect(toWorkTeamOverviewDbStatus("blocked")).toBe("blocked");
    expect(toWorkTeamOverviewDbStatus("overdue")).toBe("overdue");
  });

  it("membatasi ukuran halaman dan nomor halaman", () => {
    expect(clampWorkTeamOverviewPageSize(0)).toBe(25);
    expect(clampWorkTeamOverviewPageSize(10_000)).toBe(100);
    expect(clampWorkTeamOverviewPageSize(Number.NaN)).toBe(25);
    expect(clampWorkTeamOverviewPage(0)).toBe(1);
    expect(clampWorkTeamOverviewPage(Number.NaN)).toBe(1);
    expect(clampWorkTeamOverviewPage(4.7)).toBe(4);
  });

  it("menghitung jumlah halaman minimal satu", () => {
    expect(getWorkTeamOverviewPageCount(0, 25)).toBe(1);
    expect(getWorkTeamOverviewPageCount(25, 25)).toBe(1);
    expect(getWorkTeamOverviewPageCount(26, 25)).toBe(2);
    expect(getWorkTeamOverviewPageCount(220, 25)).toBe(9);
  });
});

const OPTIONS: readonly WorkTeamOverviewOption[] = [
  {
    kind: "office",
    id: "office-a",
    label: "Kantor Pusat",
    sublabel: null,
    officeId: "office-a",
    departmentId: null,
    memberCount: 2,
  },
  {
    kind: "office",
    id: "office-b",
    label: "Kantor Bandung",
    sublabel: null,
    officeId: "office-b",
    departmentId: null,
    memberCount: 1,
  },
  {
    kind: "department",
    id: "dept-finance",
    label: "Keuangan",
    sublabel: null,
    officeId: null,
    departmentId: "dept-finance",
    memberCount: 0,
  },
  {
    kind: "department",
    id: "dept-ops",
    label: "Operasional",
    sublabel: null,
    officeId: null,
    departmentId: "dept-ops",
    memberCount: 0,
  },
  {
    kind: "member",
    id: "member-1",
    label: "Sinta",
    sublabel: "Staf",
    officeId: "office-a",
    departmentId: "dept-finance",
    memberCount: 0,
  },
  {
    kind: "member",
    id: "member-2",
    label: "Bimo",
    sublabel: "Staf",
    officeId: "office-a",
    departmentId: "dept-ops",
    memberCount: 0,
  },
  {
    kind: "member",
    id: "member-3",
    label: "Dewi",
    sublabel: "Staf",
    officeId: "office-b",
    departmentId: "dept-finance",
    memberCount: 0,
  },
];

describe("lib work-team-overview — cascading dari opsi terotorisasi", () => {
  it("departemen dibatasi oleh kantor terpilih", () => {
    const officeA = listWorkTeamOverviewDepartmentOptions(OPTIONS, "office-a");
    expect(officeA.map((option) => option.id).sort()).toEqual(["dept-finance", "dept-ops"]);

    const officeB = listWorkTeamOverviewDepartmentOptions(OPTIONS, "office-b");
    expect(officeB.map((option) => option.id)).toEqual(["dept-finance"]);
  });

  it("anggota dibatasi kantor dan departemen", () => {
    const members = listWorkTeamOverviewMemberOptions(OPTIONS, {
      officeId: "office-a",
      departmentId: "dept-finance",
    });
    expect(members.map((option) => option.id)).toEqual(["member-1"]);
  });

  it("reconcile membuang departemen yang tidak valid untuk kantor baru", () => {
    const filters = {
      ...createWorkTeamOverviewFilters(DATE),
      officeId: "office-b",
      departmentId: "dept-ops",
      memberId: "member-2",
    };
    const reconciled = reconcileWorkTeamOverviewFilters(filters, OPTIONS);
    expect(reconciled.officeId).toBe("office-b");
    expect(reconciled.departmentId).toBeNull();
    expect(reconciled.memberId).toBeNull();
  });

  it("reconcile tidak mengubah filter yang masih valid", () => {
    const filters = {
      ...createWorkTeamOverviewFilters(DATE),
      officeId: "office-a",
      departmentId: "dept-finance",
      memberId: "member-1",
    };
    expect(reconcileWorkTeamOverviewFilters(filters, OPTIONS)).toBe(filters);
  });
});

describe("lib work-team-overview — sinkronisasi URL", () => {
  it("membaca state valid dari query", () => {
    const state = readWorkTeamOverviewUrlState({
      search: `?office=office-a&department=dept-finance&member=member-1&q=sinta&status=blocked&date=${DATE}&sort=name&page=3`,
      fallbackDate: "2026-01-01",
    });
    expect(state).toEqual({
      filters: {
        officeId: "office-a",
        departmentId: "dept-finance",
        memberId: "member-1",
        search: "sinta",
        status: "blocked",
        workDate: DATE,
      },
      sort: "name",
      page: 3,
    });
  });

  it("jatuh ke default untuk nilai tidak dikenal tanpa melempar", () => {
    const state = readWorkTeamOverviewUrlState({
      search: "?status=ngawur&sort=hack&page=-4&date=bukan-tanggal",
      fallbackDate: DATE,
    });
    expect(state.filters.status).toBe("all");
    expect(state.filters.workDate).toBe(DATE);
    expect(state.sort).toBe("priority");
    expect(state.page).toBe(1);
  });

  it("hanya menulis nilai non-default; tanggal acuan selalu ikut tersimpan", () => {
    const defaults = {
      filters: createWorkTeamOverviewFilters(DATE),
      sort: "priority" as const,
      page: 1,
    };
    // `date` sengaja selalu ditulis agar refresh/back mempertahankan tanggal
    // acuan; filter lain hanya ditulis bila non-default.
    expect(writeWorkTeamOverviewUrlState(defaults)).toBe(`date=${DATE}`);

    const withFilters = {
      filters: {
        ...createWorkTeamOverviewFilters(DATE),
        officeId: "office-a",
        status: "blocked" as const,
      },
      sort: "name" as const,
      page: 2,
    };
    const query = writeWorkTeamOverviewUrlState(withFilters);
    expect(query).toContain("office=office-a");
    expect(query).toContain("status=blocked");
    expect(query).toContain("sort=name");
    expect(query).toContain("page=2");
    expect(query).not.toContain("member=");
  });

  it("bolak-balik tulis lalu baca mempertahankan konteks", () => {
    const original = {
      filters: {
        ...createWorkTeamOverviewFilters(DATE),
        officeId: "office-a",
        departmentId: "dept-finance",
        search: "sinta",
        status: "overdue" as const,
      },
      sort: "progress_asc" as const,
      page: 4,
    };
    const query = writeWorkTeamOverviewUrlState(original);
    const parsed = readWorkTeamOverviewUrlState({ search: `?${query}`, fallbackDate: DATE });
    expect(parsed.filters).toEqual(original.filters);
    expect(parsed.sort).toBe("progress_asc");
    expect(parsed.page).toBe(4);
  });
});

describe("repository mapper Team Overview", () => {
  it("memetakan baris valid", () => {
    const member = mapWorkTeamOverviewRow(createOverviewRow());
    expect(member.owner).toEqual({
      id: "member-1",
      name: "Sinta Maharani",
      jobTitle: "Staf Operasional",
    });
    expect(member.progress).toEqual({
      total: 4,
      planned: 1,
      inProgress: 1,
      completed: 1,
      blocked: 1,
      overdue: 0,
    });
  });

  it("menerima angka dalam bentuk string (bigint PostgREST)", () => {
    const member = mapWorkTeamOverviewRow(
      createOverviewRow({ member_total: "12", member_completed: "3" }),
    );
    expect(member.progress.total).toBe(12);
    expect(member.progress.completed).toBe(3);
  });

  it("tidak pernah memakai UUID sebagai nama tampilan", () => {
    const member = mapWorkTeamOverviewRow(
      createOverviewRow({ full_name: null, job_title: null }),
    );
    expect(member.owner.name).toBe(WORK_TEAM_OVERVIEW_UNNAMED_LABEL);
    expect(member.owner.name).not.toContain("member-1");
    expect(member.owner.jobTitle).toBeNull();
  });

  it("melempar error terkontrol untuk anggota tanpa id", () => {
    expect(() => mapWorkTeamOverviewRow(createOverviewRow({ member_id: null }))).toThrow(
      /anggota tanpa id/i,
    );
  });

  it("melempar error terkontrol untuk hitungan tidak valid", () => {
    expect(() => mapWorkTeamOverviewRow(createOverviewRow({ member_total: "banyak" }))).toThrow(
      /bukan angka/i,
    );
  });

  it("memetakan opsi organisasi dan menolak jenis tak dikenal", () => {
    const option: WorkTeamOverviewOptionRow = {
      option_kind: "office",
      option_id: "office-a",
      option_label: "Kantor Pusat",
      option_sublabel: "",
      office_id: "office-a",
      department_id: null,
      member_count: "7",
    };
    expect(mapWorkTeamOverviewOptionRow(option)).toEqual({
      kind: "office",
      id: "office-a",
      label: "Kantor Pusat",
      sublabel: null,
      officeId: "office-a",
      departmentId: null,
      memberCount: 7,
    });

    expect(() =>
      mapWorkTeamOverviewOptionRow({ ...option, option_kind: "entitas" }),
    ).toThrow(/tidak dikenali/i);
  });
});

describe("repository Supabase Team Overview", () => {
  function createClient(handlers: {
    overview?: { data: unknown; error: { message: string } | null };
    options?: { data: unknown; error: { message: string } | null };
    entries?: { data: unknown; error: { message: string } | null };
  }) {
    const abortSignals: AbortSignal[] = [];
    const calls: { fn: string; args: Record<string, unknown> | undefined }[] = [];

    const client: SupabaseWorkTeamOverviewClient = {
      rpc<TResult = unknown>(
        fn: string,
        args?: Record<string, unknown>,
      ): WorkTeamOverviewRpcQuery<TResult> {
        calls.push({ fn, args });
        const source =
          fn === "list_work_calendar_team_overview"
            ? handlers.overview
            : fn === "list_work_calendar_team_overview_options"
              ? handlers.options
              : handlers.entries;
        const result = source as { data: TResult; error: { message: string } | null };

        const query: WorkTeamOverviewRpcQuery<TResult> = {
          abortSignal(signal: AbortSignal) {
            abortSignals.push(signal);
            return query;
          },
          then<TResult1 = { data: TResult; error: { message: string } | null }, TResult2 = never>(
            onfulfilled?:
              | ((value: { data: TResult; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
              | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ): Promise<TResult1 | TResult2> {
            return Promise.resolve(result).then(onfulfilled, onrejected);
          },
        };

        return query;
      },
    };

    return { client, abortSignals, calls };
  }

  it("mengirim parameter paginasi dan filter yang dipersempit", async () => {
    const { client, calls } = createClient({
      overview: { data: [createOverviewRow()], error: null },
    });
    const repository = createSupabaseWorkTeamOverviewRepository(client);

    const page = await repository.listTeamOverview({
      filters: {
        officeId: "office-a",
        departmentId: null,
        memberId: null,
        search: "  sinta ",
        status: "blocked",
        workDate: DATE,
      },
      page: 2,
      pageSize: 25,
      sort: "priority",
    });

    expect(calls[0].fn).toBe("list_work_calendar_team_overview");
    expect(calls[0].args).toMatchObject({
      p_office_id: "office-a",
      p_department_id: null,
      p_member_id: null,
      p_search: "sinta",
      p_status: "blocked",
      p_work_date: DATE,
      p_sort: "priority",
      p_limit: 25,
      p_offset: 25,
    });
    expect(page.totalCount).toBe(30);
    expect(page.aggregate.total).toBe(120);
    expect(page.page).toBe(2);
  });

  it("tidak mengirim status ketika filter all", async () => {
    const { client, calls } = createClient({
      overview: { data: [createOverviewRow()], error: null },
    });
    const repository = createSupabaseWorkTeamOverviewRepository(client);

    await repository.listTeamOverview({
      filters: { ...createWorkTeamOverviewFilters(DATE), search: "   " },
      page: 1,
      pageSize: 25,
      sort: "priority",
    });

    expect(calls[0].args).toMatchObject({ p_status: null, p_search: null });
  });

  it("mengembalikan halaman kosong yang aman ketika tidak ada baris", async () => {
    const { client } = createClient({ overview: { data: [], error: null } });
    const repository = createSupabaseWorkTeamOverviewRepository(client);

    const page = await repository.listTeamOverview({
      filters: createWorkTeamOverviewFilters(DATE),
      page: 1,
      pageSize: 25,
      sort: "priority",
    });

    expect(page.members).toEqual([]);
    expect(page.totalCount).toBe(0);
    expect(page.aggregate).toEqual({
      total: 0,
      planned: 0,
      inProgress: 0,
      completed: 0,
      blocked: 0,
      overdue: 0,
    });
  });

  it("melempar error terkontrol ketika query gagal", async () => {
    const { client } = createClient({
      overview: { data: null, error: { message: "boom" } },
    });
    const repository = createSupabaseWorkTeamOverviewRepository(client);

    await expect(
      repository.listTeamOverview({
        filters: createWorkTeamOverviewFilters(DATE),
        page: 1,
        pageSize: 25,
        sort: "priority",
      }),
    ).rejects.toThrow("Gagal memuat ringkasan tim.");
  });

  it("meneruskan AbortSignal ke query", async () => {
    const { client, abortSignals } = createClient({
      overview: { data: [createOverviewRow()], error: null },
    });
    const repository = createSupabaseWorkTeamOverviewRepository(client);
    const controller = new AbortController();

    await repository.listTeamOverview({
      filters: createWorkTeamOverviewFilters(DATE),
      page: 1,
      pageSize: 25,
      sort: "priority",
      signal: controller.signal,
    });

    expect(abortSignals).toContain(controller.signal);
  });

  it("memetakan entry anggota yang dimuat lazy", async () => {
    const { client, calls } = createClient({
      entries: {
        data: [
          {
            id: "entry-1",
            owner_id: "member-1",
            work_date: DATE,
            title: "Menyusun laporan",
            realization: null,
            notes: null,
            location: null,
            status: "in_progress",
            kind: "work",
            is_all_day: true,
            starts_at: null,
            ends_at: null,
            blocked_reason: null,
            completed_at: null,
            deleted_at: null,
            created_at: "2026-09-15T01:00:00.000Z",
            updated_at: "2026-09-15T01:00:00.000Z",
          },
        ],
        error: null,
      },
    });
    const repository = createSupabaseWorkTeamOverviewRepository(client);

    const entries = await repository.listTeamMemberEntries({
      memberId: "member-1",
      date: DATE,
    });

    expect(calls[0].fn).toBe("list_work_calendar_member_entries");
    expect(calls[0].args).toEqual({ p_member_id: "member-1", p_work_date: DATE });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Menyusun laporan");
    expect(entries[0].status).toBe("in_progress");
  });

  it("melempar error terkontrol ketika opsi gagal dimuat", async () => {
    const { client } = createClient({ options: { data: null, error: { message: "boom" } } });
    const repository = createSupabaseWorkTeamOverviewRepository(client);

    await expect(repository.listAuthorizedOrganizationOptions()).rejects.toThrow(
      "Gagal memuat pilihan organisasi.",
    );
  });
});
