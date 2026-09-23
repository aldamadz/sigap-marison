import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntry,
  createFixtureWorkEntryRepository,
  createFixtureWorkTeamOverviewRepository,
  workCalendarFixtureNow,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import type { WorkEntry } from "@/features/work-calendar/types/work-calendar";
import type {
  WorkTeamOverviewEntryQuery,
  WorkTeamOverviewOption,
  WorkTeamOverviewRepository,
} from "@/features/work-calendar/types/work-team-overview";

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

function createTeamEntries(): WorkEntry[] {
  return [
    createFixtureWorkEntry({
      id: "team-1",
      ownerId: "user-bawahan-1",
      workDate: WORK_CALENDAR_FIXTURE_TODAY,
      title: "Rekap operasional harian",
      status: "in_progress",
    }),
    createFixtureWorkEntry({
      id: "team-2",
      ownerId: "user-bawahan-2",
      workDate: WORK_CALENDAR_FIXTURE_TODAY,
      title: "Verifikasi berkas",
      status: "blocked",
      blockedReason: "Menunggu tanda tangan",
    }),
    createFixtureWorkEntry({
      id: "team-3",
      ownerId: "user-bawahan-3",
      workDate: WORK_CALENDAR_FIXTURE_TODAY,
      title: "Tutup buku kas",
      status: "completed",
      realization: "Selesai tepat waktu",
      completedAt: "2026-03-10T02:00:00.000Z",
    }),
  ];
}

function renderWorkspace(overrides?: {
  teamOverviewRepository?: WorkTeamOverviewRepository;
  repository?: ReturnType<typeof createFixtureWorkEntryRepository>;
}) {
  const entries = createTeamEntries();
  const repository =
    overrides?.repository ?? createFixtureWorkEntryRepository(entries, { failOnList: true });
  const teamOverviewRepository =
    overrides?.teamOverviewRepository ?? createFixtureWorkTeamOverviewRepository(entries);

  return render(
    <WorkCalendarWorkspace
      currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
      repository={repository}
      teamMembers={WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
      teamOverviewRepository={teamOverviewRepository}
      initialView="team"
      now={workCalendarFixtureNow}
    />,
  );
}

/** Membuka Radix Select dengan keyboard lalu memilih satu opsi. */
async function selectOption(trigger: HTMLElement, optionName: RegExp | string): Promise<void> {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const listbox = await screen.findByRole("listbox");
  const option = within(listbox).getByRole("option", { name: optionName });
  option.focus();
  fireEvent.keyDown(option, { key: "Enter" });
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
}

const searchInput = () =>
  screen.getByLabelText("Cari anggota berdasarkan nama, NIK, atau jabatan");

describe("WorkCalendarWorkspace — Team Overview server-side (CAL-03 F4A)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tidak memuat seluruh pekerjaan organisasi lewat listTeamEntries", async () => {
    const listTeamEntries = vi.fn().mockRejectedValue(new Error("seharusnya tidak dipanggil"));
    const repository = {
      ...createFixtureWorkEntryRepository(createTeamEntries()),
      listTeamEntries,
    };

    renderWorkspace({ repository });

    await waitFor(() => {
      expect(screen.getByTestId("work-team-overview")).toBeInTheDocument();
    });

    expect(listTeamEntries).not.toHaveBeenCalled();
    expect(await screen.findByTestId("work-team-overview-summary")).toBeInTheDocument();
  });

  it("memuat pekerjaan anggota hanya setelah anggota dibuka (lazy)", async () => {
    const listTeamMemberEntries = vi.fn(async ({ memberId, date }: WorkTeamOverviewEntryQuery) =>
      createTeamEntries().filter(
        (entry) => entry.ownerId === memberId && entry.workDate === date,
      ),
    );
    const teamOverviewRepository: WorkTeamOverviewRepository = {
      ...createFixtureWorkTeamOverviewRepository(createTeamEntries()),
      listTeamMemberEntries,
    };

    renderWorkspace({ teamOverviewRepository });

    await screen.findByTestId("work-team-overview");
    expect(listTeamMemberEntries).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByTestId("team-member-toggle-user-bawahan-1"));

    await waitFor(() => {
      expect(listTeamMemberEntries).toHaveBeenCalledWith(
        expect.objectContaining({ memberId: "user-bawahan-1" }),
      );
    });
    expect(await screen.findByText("Rekap operasional harian")).toBeInTheDocument();
  });

  it("hanya satu detail anggota terbuka pada satu waktu", async () => {    renderWorkspace();

    await screen.findByTestId("work-team-overview");

    fireEvent.click(await screen.findByTestId("team-member-toggle-user-bawahan-1"));
    await screen.findByText("Rekap operasional harian");

    fireEvent.click(screen.getByTestId("team-member-toggle-user-bawahan-2"));
    await screen.findByText("Verifikasi berkas");

    await waitFor(() => {
      expect(screen.queryByText("Rekap operasional harian")).not.toBeInTheDocument();
    });
  });

  it("ringkasan memakai agregat seluruh hasil filter, bukan halaman ini", async () => {
    renderWorkspace();

    const summary = await screen.findByTestId("work-team-overview-summary");
    expect(within(summary).getByTestId("team-overview-summary-total")).toHaveTextContent("3");
    expect(within(summary).getByTestId("team-overview-summary-completed")).toHaveTextContent("1");
  });

  it("filter status mempersempit daftar dan menghitung filter aktif", async () => {
    renderWorkspace();
    await screen.findByTestId("work-team-overview");

    await selectOption(screen.getByLabelText("Filter status"), /Terhambat/i);

    await waitFor(() => {
      expect(screen.getByTestId("team-overview-filter-count")).toHaveTextContent(
        "1 filter aktif",
      );
    });
    expect(await screen.findByText("Bimo Nugroho")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Sinta Maharani")).not.toBeInTheDocument();
    });
  });

  it("reset filter mengembalikan seluruh anggota", async () => {
    renderWorkspace();
    await screen.findByTestId("work-team-overview");

    await selectOption(screen.getByLabelText("Filter status"), /Selesai/i);
    await waitFor(() =>
      expect(screen.getByTestId("team-overview-filter-count")).toHaveTextContent(
        "1 filter aktif",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Reset filter/i }));

    await waitFor(() => {
      expect(screen.getByTestId("team-overview-filter-count")).toHaveTextContent(
        "Belum ada filter aktif",
      );
    });
    expect(await screen.findByText("Sinta Maharani")).toBeInTheDocument();
  });

  it("mencari anggota berdasarkan nama", async () => {
    renderWorkspace();
    await screen.findByTestId("work-team-overview");

    fireEvent.change(searchInput(), { target: { value: "Dewi" } });

    await waitFor(() => {
      expect(screen.getByText("Dewi Lestari")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sinta Maharani")).not.toBeInTheDocument();
  });

  it("mencari anggota berdasarkan jabatan", async () => {
    renderWorkspace();
    await screen.findByTestId("work-team-overview");

    fireEvent.change(searchInput(), { target: { value: "Staf Keuangan" } });

    await waitFor(() => {
      expect(screen.getByText("Dewi Lestari")).toBeInTheDocument();
    });
    expect(screen.queryByText("Bimo Nugroho")).not.toBeInTheDocument();
  });

  it("pemilih anggota memakai pencarian terbatas server, bukan seluruh roster", async () => {
    renderWorkspace();
    await screen.findByTestId("work-team-overview");

    // Sebelum pemilih dibuka, tidak ada opsi anggota yang dimuat.
    expect(screen.queryByTestId("team-overview-member-results")).not.toBeInTheDocument();

    const picker = screen.getByLabelText("Cari dan pilih anggota");
    picker.focus();
    fireEvent.focus(picker);

    const results = await screen.findByTestId("team-overview-member-results");
    await waitFor(() =>
      expect(
        within(results).getByTestId("team-overview-member-option-user-bawahan-1"),
      ).toBeInTheDocument(),
    );

    fireEvent.change(picker, { target: { value: "Dewi" } });

    await waitFor(() => {
      expect(
        within(screen.getByTestId("team-overview-member-results")).queryByTestId(
          "team-overview-member-option-user-bawahan-1",
        ),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(
      within(screen.getByTestId("team-overview-member-results")).getByTestId(
        "team-overview-member-option-user-bawahan-3",
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId("team-overview-member-selected")).toHaveTextContent(
        "Dewi Lestari",
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("team-overview-filter-count")).toHaveTextContent(
        "1 filter aktif",
      );
    });
  });

  it("menampilkan state kosong ketika tidak ada anggota yang cocok", async () => {
    renderWorkspace();
    await screen.findByTestId("work-team-overview");

    fireEvent.change(searchInput(), { target: { value: "tidak-ada-nama-ini" } });

    expect(await screen.findByTestId("team-overview-empty")).toBeInTheDocument();
  });

  it("menampilkan error dan tombol coba lagi ketika overview gagal", async () => {
    renderWorkspace({
      teamOverviewRepository: createFixtureWorkTeamOverviewRepository(createTeamEntries(), {
        failOnOverview: true,
      }),
    });

    expect(await screen.findByTestId("team-overview-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba lagi/i })).toBeInTheDocument();
  });

  it("membatalkan permintaan lama saat filter berubah (tidak ada hasil basi)", async () => {
    const signalRef: { current: AbortSignal | null } = { current: null };
    const repository = createFixtureWorkTeamOverviewRepository(createTeamEntries(), {
      delayMs: 30,
      signalRef,
    });

    renderWorkspace({ teamOverviewRepository: repository });
    await screen.findByTestId("work-team-overview");

    await waitFor(() => expect(signalRef.current).not.toBeNull());
    const firstSignal = signalRef.current;

    fireEvent.change(searchInput(), { target: { value: "Dewi" } });

    await waitFor(() => expect(signalRef.current).not.toBe(firstSignal));
    expect(firstSignal?.aborted).toBe(true);

    await waitFor(() => {
      expect(screen.getByText("Dewi Lestari")).toBeInTheDocument();
    });
  });

  it("paginasi server: halaman 2 menampilkan anggota berbeda tanpa duplikasi", async () => {
    const directorEntries: WorkEntry[] = Array.from({ length: 30 }, (_, index) => {
      const member = WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[index % WORK_CALENDAR_FIXTURE_TEAM_MEMBERS.length];
      return createFixtureWorkEntry({
        id: `page-entry-${index}`,
        ownerId: member.id,
        workDate: WORK_CALENDAR_FIXTURE_TODAY,
        title: `Pekerjaan ${index}`,
        status: "planned",
      });
    });

    renderWorkspace({
      teamOverviewRepository: createFixtureWorkTeamOverviewRepository(directorEntries, {
        members: [
          {
            kind: "office",
            id: "office-a",
            label: "Kantor Pusat",
            sublabel: null,
            officeId: "office-a",
            departmentId: null,
            memberCount: 30,
          },
          ...[...Array(30)].map<WorkTeamOverviewOption>((_, index) => ({
            kind: "member",
            id: `paged-member-${index}`,
            label: `Anggota ${String(index + 1).padStart(2, "0")}`,
            sublabel: "Staf",
            officeId: "office-a",
            departmentId: null,
            memberCount: 0,
          })),
        ],
      }),
    });

    await screen.findByTestId("work-team-overview");
    await waitFor(() => expect(screen.getAllByText(/^Anggota \d\d$/)).toHaveLength(25));
    expect(await screen.findByTestId("team-overview-page-label")).toHaveTextContent(
      "Halaman 1 dari 2",
    );

    fireEvent.click(screen.getByTestId("team-overview-next-page"));

    await waitFor(() => {
      expect(screen.getByTestId("team-overview-page-label")).toHaveTextContent(
        "Halaman 2 dari 2",
      );
    });
    await waitFor(() => expect(screen.getAllByText(/^Anggota \d\d$/)).toHaveLength(5));
    // Halaman 2 tidak mengulang anggota halaman 1.
    expect(screen.queryByText("Anggota 01")).not.toBeInTheDocument();
    expect(screen.getByText("Anggota 26")).toBeInTheDocument();
  });

  it("pekerjaan bawahan read-only tetapi judul tetap membuka detail", async () => {
    renderWorkspace();
    await screen.findByTestId("work-team-overview");

    fireEvent.click(await screen.findByTestId("team-member-toggle-user-bawahan-1"));
    await screen.findByText("Rekap operasional harian");

    // Kontrol ubah status tidak ada pada entry bawahan.
    expect(screen.queryByTestId("work-entry-status-control-team-1")).toBeNull();

    // Menu tindakan tetap ada, tetapi hanya menyediakan "Lihat detail".
    fireEvent.keyDown(
      screen.getByRole("button", { name: /Menu tindakan untuk Rekap operasional harian/i }),
      { key: "Enter" },
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Entry bawahan")).toBeInTheDocument();
    expect(within(menu).getByText("Lihat detail")).toBeInTheDocument();
    expect(within(menu).queryByText("Hapus")).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });

    fireEvent.click(
      screen.getByRole("button", { name: /Buka detail pekerjaan: Rekap operasional harian/i }),
    );
    expect(await screen.findByTestId("work-entry-detail-team-1")).toBeInTheDocument();
  });
});
