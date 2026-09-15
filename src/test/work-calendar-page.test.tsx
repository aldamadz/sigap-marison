import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import WorkCalendarPage from "@/pages/work-calendar/WorkCalendarPage";
import { supabase } from "@/lib/supabase";
import type {
  WorkCalendarProfileRow,
  WorkCalendarTeamMemberRow,
} from "@/features/work-calendar/data/work-calendar-profile-repository";
import type { WorkCalendarEntryRow } from "@/features/work-calendar/data/work-entry-row-mapper";

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
      onfulfilled?: ((value: { data: T; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return builder;
}

function createMockRpcBuilder<T>(result: { data: T; error: { message: string } | null }) {
  const builder = {
    range: vi.fn().mockImplementation(() => builder),
    abortSignal: vi.fn().mockImplementation(() => builder),
    then: <TResult1 = { data: T; error: { message: string } | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: T; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return builder;
}

function setupDefaultMocks(options?: {
  authUser?: { id: string } | null;
  authError?: { message: string } | null;
  profile?: WorkCalendarProfileRow | null;
  profileError?: { message: string } | null;
  teamMembers?: WorkCalendarTeamMemberRow[] | null;
  teamError?: { message: string } | null;
  entries?: WorkCalendarEntryRow[];
}) {
  const authUser = options && "authUser" in options ? options.authUser : { id: "u-valid-1" };
  const authError = options?.authError ?? null;
  const profile = options && "profile" in options ? options.profile : {
    id: "u-valid-1",
    full_name: "Budi Pratama",
    job_title: "Senior Developer",
  };
  const profileError = options?.profileError ?? null;
  const teamMembers = options?.teamMembers ?? [
    {
      id: "u-sub-1",
      full_name: "Alice Subordinate",
      job_title: "Junior Dev",
    },
  ];
  const teamError = options?.teamError ?? null;
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

  const teamRpc = createMockRpcBuilder<WorkCalendarTeamMemberRow[] | null>({
    data: teamMembers,
    error: teamError,
  });

  vi.mocked(supabase.rpc).mockReturnValue(teamRpc);

  return { profileQuery, entriesQuery, teamRpc };
}

describe("WorkCalendarPage (CAL-03 F3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. menampilkan status loading saat inisialisasi sesi dan profil", async () => {
    vi.mocked(supabase.auth.getUser).mockImplementation(
      () => new Promise(() => {}),
    );

    render(<WorkCalendarPage />);

    expect(screen.getByRole("status", { name: "Memuat Kalender Kerja" })).toBeInTheDocument();
    expect(screen.getByText("Menyiapkan Kalender Kerja...")).toBeInTheDocument();
  });

  it("2. profil tidak ada (sukses tapi null) -> menampilkan state missing_profile", async () => {
    setupDefaultMocks({
      authUser: { id: "u-none" },
      profile: null,
      profileError: null,
    });

    render(<WorkCalendarPage />);

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

    render(<WorkCalendarPage />);

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

    render(<WorkCalendarPage />);

    await waitFor(() => {
      expect(screen.getByText("Gagal Memuat Kalender Kerja")).toBeInTheDocument();
    });

    expect(screen.queryByText("Profil Pengguna Tidak Ditemukan")).not.toBeInTheDocument();
    expect(screen.getByText("Gagal memuat profil pengguna.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba Lagi/i })).toBeInTheDocument();
  });

  it("5. RPC team members error -> menampilkan error state", async () => {
    setupDefaultMocks({
      teamMembers: null,
      teamError: { message: "function does not exist" },
    });

    render(<WorkCalendarPage />);

    await waitFor(() => {
      expect(screen.getByText("Gagal Memuat Kalender Kerja")).toBeInTheDocument();
    });

    expect(screen.queryByText("Profil Pengguna Tidak Ditemukan")).not.toBeInTheDocument();
    expect(screen.getByText("Gagal memuat daftar anggota tim.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba Lagi/i })).toBeInTheDocument();
  });

  it("6. merender WorkCalendarWorkspace saat profil dan tim valid (ready state)", async () => {
    setupDefaultMocks();

    render(<WorkCalendarPage />);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Pilih rentang tampilan" })).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("Apa yang akan dikerjakan?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tim" })).toBeInTheDocument();
  });

  it("7. retry dari error state dapat mencapai ready state", async () => {
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

    const teamRpc = createMockRpcBuilder<WorkCalendarTeamMemberRow[] | null>({
      data: [],
      error: null,
    });
    vi.mocked(supabase.rpc).mockReturnValue(teamRpc);

    render(<WorkCalendarPage />);

    await waitFor(() => {
      expect(screen.getByText("Gagal Memuat Kalender Kerja")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /Coba Lagi/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Pilih rentang tampilan" })).toBeInTheDocument();
    });
  });

  it("8. request yang aborted saat unmount tidak mengubah state atau memicu error", async () => {
    let resolveAuthPromise!: (val: { data: { user: { id: string } }; error: null }) => void;
    vi.mocked(supabase.auth.getUser).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuthPromise = resolve;
        }),
    );

    const { unmount } = render(<WorkCalendarPage />);
    expect(screen.getByRole("status", { name: "Memuat Kalender Kerja" })).toBeInTheDocument();

    unmount();

    // Selesaikan auth setelah unmount
    resolveAuthPromise({ data: { user: { id: "u-unmounted" } }, error: null });

    // Tidak boleh crash atau throw unhandled error
    expect(screen.queryByText("Gagal Memuat Kalender Kerja")).not.toBeInTheDocument();
  });
});
