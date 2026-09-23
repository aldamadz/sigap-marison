import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";

import WorkCalendarPage from "@/pages/work-calendar/WorkCalendarPage";
import { supabase } from "@/lib/supabase";
import type { WorkCalendarProfileRow } from "@/features/work-calendar/data/work-calendar-profile-repository";
import type { WorkCalendarEntryRow } from "@/features/work-calendar/data/work-entry-row-mapper";
import type {
  WorkTeamOverviewMemberSearchRow,
  WorkTeamOverviewOptionRow,
  WorkTeamOverviewRow,
} from "@/features/work-calendar/data/supabase-work-team-overview-repository";

/**
 * Radix Select dirender lewat Portal dan memakai pointer capture,
 * ResizeObserver, serta scrollIntoView yang tidak disediakan jsdom.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

/** Probe React Router untuk mengamati URL dan mensimulasikan Back/Forward. */
const routeProbe: { search: string; back: () => void; forward: () => void } = {
  search: "",
  back: () => {},
  forward: () => {},
};

function RouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  routeProbe.search = location.search;
  routeProbe.back = () => navigate(-1);
  routeProbe.forward = () => navigate(1);
  return <output data-testid="route-search">{location.search}</output>;
}

/**
 * Route nyata `WorkCalendarPage` sekarang memakai React Router untuk state
 * mode Tim (`useSearchParams`/`useNavigate`), jadi setiap render dibungkus
 * router in-memory pada path `/calendar`.
 */
function renderPage(initialEntry = "/calendar") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/calendar"
          element={
            <>
              <WorkCalendarPage />
              <RouteProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

vi.mock("@/lib/supabase", () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

function createMockQueryBuilder<T>(result: { data: T; error: { message: string } | null }) {
  const builder = {
    eq: vi.fn().mockImplementation(() => builder),
    gte: vi.fn().mockImplementation(() => builder),
    lte: vi.fn().mockImplementation(() => builder),
    is: vi.fn().mockImplementation(() => builder),
    order: vi.fn().mockImplementation(() => builder),
    range: vi.fn().mockImplementation(() => builder),
    abortSignal: vi.fn().mockImplementation(() => builder),
    select: vi.fn().mockImplementation(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: <TResult1 = { data: T; error: { message: string } | null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: T; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return builder;
}

interface RpcCall {
  fn: string;
  args: Record<string, unknown> | undefined;
}

function setupDefaultMocks(options?: {
  authUser?: { id: string } | null;
  authError?: { message: string } | null;
  profile?: WorkCalendarProfileRow | null;
  profileError?: { message: string } | null;
  /** Hasil probe `has_work_calendar_team_members`. */
  isTeamAvailable?: boolean;
  probeError?: { message: string } | null;
  overviewRows?: WorkTeamOverviewRow[];
  optionRows?: WorkTeamOverviewOptionRow[];
  memberSearchRows?: WorkTeamOverviewMemberSearchRow[];
  entries?: WorkCalendarEntryRow[];
}) {
  const authUser = options && "authUser" in options ? options.authUser : { id: "u-valid-1" };
  const authError = options?.authError ?? null;
  const profile =
    options && "profile" in options
      ? options.profile
      : {
          id: "u-valid-1",
          full_name: "Budi Pratama",
          job_title: "Senior Developer",
        };
  const profileError = options?.profileError ?? null;
  const isTeamAvailable = options?.isTeamAvailable ?? true;
  const probeError = options?.probeError ?? null;
  const overviewRows = options?.overviewRows ?? [];
  const optionRows = options?.optionRows ?? [];
  const memberSearchRows = options?.memberSearchRows ?? [];
  const entries = options?.entries ?? [];

  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: authUser },
    error: authError,
  });

  const profileQuery = createMockQueryBuilder<WorkCalendarProfileRow | null>({
    data: profile,
    error: profileError,
  });

  const entriesQuery = createMockQueryBuilder<WorkCalendarEntryRow[]>({
    data: entries,
    error: null,
  });

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "profiles") {
      return { select: vi.fn().mockReturnValue(profileQuery) };
    }
    return {
      select: vi.fn().mockReturnValue(entriesQuery),
      insert: vi.fn().mockReturnValue(entriesQuery),
      update: vi.fn().mockReturnValue(entriesQuery),
    };
  });

  const calls: RpcCall[] = [];

  function createRpcQuery<TResult>(result: { data: TResult; error: { message: string } | null }) {
    const query = {
      range: vi.fn().mockImplementation(() => query),
      abortSignal: vi.fn().mockImplementation(() => query),
      then: <
        TResult1 = { data: TResult; error: { message: string } | null },
        TResult2 = never,
      >(
        onfulfilled?:
          | ((value: {
              data: TResult;
              error: { message: string } | null;
            }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    };
    return query;
  }

  vi.mocked(supabase.rpc).mockImplementation(((
    fn: string,
    args?: Record<string, unknown>,
  ) => {
    calls.push({ fn, args });
    if (fn === "has_work_calendar_team_members") {
      return createRpcQuery({ data: isTeamAvailable, error: probeError });
    }
    if (fn === "list_work_calendar_team_overview") {
      return createRpcQuery({ data: overviewRows, error: null });
    }
    if (fn === "list_work_calendar_team_overview_options") {
      return createRpcQuery({ data: optionRows, error: null });
    }
    if (fn === "search_work_calendar_team_members") {
      return createRpcQuery({ data: memberSearchRows, error: null });
    }
    return createRpcQuery({ data: [], error: null });
  }) as never);

  return { profileQuery, entriesQuery, calls };
}

describe("WorkCalendarPage (CAL-03 F3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. menampilkan status loading saat inisialisasi sesi dan profil", async () => {
    vi.mocked(supabase.auth.getUser).mockImplementation(() => new Promise(() => {}));

    renderPage();

    expect(screen.getByRole("status", { name: "Memuat Kalender Kerja" })).toBeInTheDocument();
    expect(screen.getByText("Menyiapkan Kalender Kerja...")).toBeInTheDocument();
  });

  it("2. profil tidak ada (sukses tapi null) -> menampilkan state missing_profile", async () => {
    setupDefaultMocks({
      authUser: { id: "u-none" },
      profile: null,
      profileError: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Profil Pengguna Tidak Ditemukan")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Akun Anda belum memiliki profil kerja aktif atau telah dinonaktifkan. Hubungi administrator sistem.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba Lagi/i })).toBeInTheDocument();
  });

  it("3. auth error -> menampilkan error state dan tombol coba lagi (bukan missing_profile)", async () => {
    setupDefaultMocks({
      authUser: null,
      authError: { message: "Invalid JWT token" },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Gagal Memuat Kalender Kerja")).toBeInTheDocument();
    });

    expect(screen.queryByText("Profil Pengguna Tidak Ditemukan")).not.toBeInTheDocument();
    expect(screen.getByText("Gagal memverifikasi sesi pengguna.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba Lagi/i })).toBeInTheDocument();
  });

  it("4. query profiles database error -> menampilkan error state (bukan missing_profile)", async () => {
    setupDefaultMocks({
      profile: null,
      profileError: { message: "connection timeout" },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Gagal Memuat Kalender Kerja")).toBeInTheDocument();
    });

    expect(screen.queryByText("Profil Pengguna Tidak Ditemukan")).not.toBeInTheDocument();
    expect(screen.getByText("Gagal memuat profil pengguna.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba Lagi/i })).toBeInTheDocument();
  });

  it("5. probe tim gagal -> kalender tetap tampil dan tab Tim disembunyikan", async () => {
    const { calls } = setupDefaultMocks({
      probeError: { message: "function does not exist" },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Pilih rentang tampilan" })).toBeInTheDocument();
    });

    // Kalender pribadi tidak diblokir oleh kegagalan probe.
    expect(screen.queryByText("Gagal Memuat Kalender Kerja")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tim" })).not.toBeInTheDocument();

    // Bootstrap tidak pernah memuat daftar anggota.
    expect(calls.some((call) => call.fn === "list_work_calendar_team_members")).toBe(false);
  });

  it("6. bootstrap tidak memuat seluruh anggota maupun team entries", async () => {
    const { calls } = setupDefaultMocks({ isTeamAvailable: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tim" })).toBeInTheDocument();
    });

    expect(calls.some((call) => call.fn === "has_work_calendar_team_members")).toBe(true);
    expect(calls.some((call) => call.fn === "list_work_calendar_team_members")).toBe(false);
    expect(calls.some((call) => call.fn === "list_work_calendar_team_overview")).toBe(false);
  });

  it("7. tab Tim pada route nyata memanggil RPC overview, bukan listTeamEntries lama", async () => {
    const { calls } = setupDefaultMocks({
      isTeamAvailable: true,
      overviewRows: [],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Tim" }));

    await waitFor(() => {
      expect(calls.some((call) => call.fn === "list_work_calendar_team_overview")).toBe(true);
    });

    const overviewCall = calls.find((call) => call.fn === "list_work_calendar_team_overview");
    expect(overviewCall?.args).toMatchObject({ p_work_date: expect.any(String) });
    // RPC anggota lama tidak pernah dipakai sebagai sumber daftar tim.
    expect(calls.some((call) => call.fn === "list_work_calendar_team_members")).toBe(false);
  });

  it("8. deep link view=team&date memulihkan tab dan tanggal", async () => {
    const { calls } = setupDefaultMocks({
      isTeamAvailable: true,
    });

    renderPage("/calendar?view=team&date=2026-09-15");

    await waitFor(() => {
      expect(calls.some((call) => call.fn === "list_work_calendar_team_overview")).toBe(true);
    });

    const overviewCall = calls.find((call) => call.fn === "list_work_calendar_team_overview");
    expect(overviewCall?.args).toMatchObject({ p_work_date: "2026-09-15" });
    expect(await screen.findByTestId("work-team-overview")).toBeInTheDocument();
  });

  it("9. retry dari error state dapat mencapai ready state", async () => {
    let attempt = 0;
    vi.mocked(supabase.auth.getUser).mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        return { data: { user: null }, error: { message: "Auth failed on first attempt" } };
      }
      return { data: { user: { id: "u-retry-1" } }, error: null };
    });

    const profileQuery = createMockQueryBuilder<WorkCalendarProfileRow | null>({
      data: {
        id: "u-retry-1",
        full_name: "Siti Rahma",
        job_title: "Product Manager",
      },
      error: null,
    });

    const entriesQuery = createMockQueryBuilder<WorkCalendarEntryRow[]>({
      data: [],
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "profiles") {
        return { select: vi.fn().mockReturnValue(profileQuery) };
      }
      return {
        select: vi.fn().mockReturnValue(entriesQuery),
        insert: vi.fn().mockReturnValue(entriesQuery),
        update: vi.fn().mockReturnValue(entriesQuery),
      };
    });

    vi.mocked(supabase.rpc).mockImplementation(((() => {
      const query = {
        range: vi.fn().mockImplementation(() => query),
        abortSignal: vi.fn().mockImplementation(() => query),
        then: (
          onfulfilled?: ((value: { data: unknown; error: null }) => unknown) | null,
        ) => Promise.resolve({ data: false, error: null }).then(onfulfilled),
      };
      return query;
    }) as never) as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Gagal Memuat Kalender Kerja")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /Coba Lagi/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Pilih rentang tampilan" })).toBeInTheDocument();
    });
  });

  it("10. request yang aborted saat unmount tidak mengubah state atau memicu error", async () => {
    let resolveAuthPromise!: (val: { data: { user: { id: string } }; error: null }) => void;
    vi.mocked(supabase.auth.getUser).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuthPromise = resolve;
        }),
    );

    const { unmount } = renderPage();
    expect(screen.getByRole("status", { name: "Memuat Kalender Kerja" })).toBeInTheDocument();

    unmount();

    // Selesaikan auth setelah unmount
    resolveAuthPromise({ data: { user: { id: "u-unmounted" } }, error: null });

    // Tidak boleh crash atau throw unhandled error
    expect(screen.queryByText("Gagal Memuat Kalender Kerja")).not.toBeInTheDocument();
  });

  it("11. memilih kantor menulis parameter ke URL dan Back memulihkannya", async () => {
    const optionRows: WorkTeamOverviewOptionRow[] = [
      {
        option_kind: "office",
        option_id: "office-a",
        option_label: "Kantor Pusat",
        option_sublabel: "",
        office_id: "office-a",
        department_id: null,
        member_count: 31,
      },
      {
        option_kind: "office",
        option_id: "office-b",
        option_label: "Kantor Bandung",
        option_sublabel: "",
        office_id: "office-b",
        department_id: null,
        member_count: 12,
      },
    ];

    const { calls } = setupDefaultMocks({
      isTeamAvailable: true,
      optionRows,
    });

    renderPage("/calendar?view=team&date=2026-09-15");
    await screen.findByTestId("work-team-overview");
    await waitFor(() =>
      expect(calls.some((call) => call.fn === "list_work_calendar_team_overview_options")).toBe(
        true,
      ),
    );

    const officeTrigger = screen.getByLabelText("Filter kantor");
    officeTrigger.focus();
    fireEvent.keyDown(officeTrigger, { key: "Enter" });
    const listbox = await screen.findByRole("listbox");
    const option = within(listbox).getByRole("option", { name: /Kantor Bandung/i });
    option.focus();
    fireEvent.keyDown(option, { key: "Enter" });

    await waitFor(() => {
      expect(routeProbe.search).toContain("office=office-b");
    });
    // Parameter lain milik route tidak boleh hilang.
    expect(routeProbe.search).toContain("view=team");
    expect(routeProbe.search).toContain("date=2026-09-15");

    await waitFor(() => {
      const last = [...calls]
        .reverse()
        .find((call) => call.fn === "list_work_calendar_team_overview");
      expect(last?.args).toMatchObject({
        p_office_id: "office-b",
        p_work_date: "2026-09-15",
      });
    });

    // Back mengembalikan filter ke keadaan tanpa kantor.
    routeProbe.back();

    await waitFor(() => {
      const last = [...calls]
        .reverse()
        .find((call) => call.fn === "list_work_calendar_team_overview");
      expect(last?.args).toMatchObject({ p_office_id: null });
    });
    expect(routeProbe.search).not.toContain("office=office-b");
  });

  it("12. tanggal dari URL menjadi tanggal tunggal untuk query, agregat, dan heading", async () => {
    const { calls } = setupDefaultMocks({
      isTeamAvailable: true,
      overviewRows: [],
    });

    renderPage("/calendar?view=team&date=2026-09-08");
    await screen.findByTestId("work-team-overview");

    await waitFor(() => {
      const overviewCall = calls.find((call) => call.fn === "list_work_calendar_team_overview");
      expect(overviewCall?.args).toMatchObject({ p_work_date: "2026-09-08" });
    });

    // URL tetap mempertahankan tanggal yang sama (bukan direset ke hari ini).
    expect(routeProbe.search).toContain("date=2026-09-08");
    expect(routeProbe.search).toContain("view=team");
  });

  it("13. pengguna tanpa bawahan tidak pernah melihat tab Tim", async () => {
    const { calls } = setupDefaultMocks({ isTeamAvailable: false });

    renderPage("/calendar?view=team&date=2026-09-15");

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Pilih rentang tampilan" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Tim" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-team-overview")).not.toBeInTheDocument();
    // Deep link `view=team` tidak memaksa mode Tim atau query overview.
    expect(calls.some((call) => call.fn === "list_work_calendar_team_overview")).toBe(false);
  });

  it("14. filter anggota terlarang dari URL dibuang tanpa permintaan tak terotorisasi", async () => {
    const { calls } = setupDefaultMocks({
      isTeamAvailable: true,
      memberSearchRows: [],
    });

    renderPage("/calendar?view=team&date=2026-09-15&member=00000000-0000-4000-8000-000000000999");
    await screen.findByTestId("work-team-overview");

    // Anggota di luar hierarki diresolusi lewat RPC tunggal dan dibuang.
    await waitFor(() => {
      expect(calls.some((call) => call.fn === "get_work_calendar_team_member")).toBe(true);
    });
    await waitFor(() => {
      const last = [...calls]
        .reverse()
        .find((call) => call.fn === "list_work_calendar_team_overview");
      expect(last?.args).toMatchObject({ p_member_id: null });
    });
    await waitFor(() => {
      expect(routeProbe.search).not.toContain("member=");
    });
  });

  it("15. bootstrap tidak pernah memuat pencarian anggota secara eager", async () => {
    const { calls } = setupDefaultMocks({ isTeamAvailable: true });

    renderPage("/calendar?view=team&date=2026-09-15");
    await screen.findByTestId("work-team-overview");

    expect(calls.some((call) => call.fn === "search_work_calendar_team_members")).toBe(false);
  });
});
