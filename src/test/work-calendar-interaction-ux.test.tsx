import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";

import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import { useWorkCalendarRouteBinding } from "@/features/work-calendar/hooks/use-work-calendar-route-state";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntry,
  createFixtureWorkEntryRepository,
  createFixtureWorkTeamOverviewRepository,
  workCalendarFixtureNow,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import type {
  WorkCalendarViewMode,
  WorkEntry,
  WorkEntryDraft,
} from "@/features/work-calendar/types/work-calendar";
import type { WorkTeamOverviewRepository } from "@/features/work-calendar/types/work-team-overview";

/**
 * CAL-03 F4B — kontrak interaksi detail dan Quick Add.
 *
 * Radix (Popover/Select) merender lewat Portal dan memakai pointer capture,
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

interface HarnessProps {
  repository: ReturnType<typeof createFixtureWorkEntryRepository>;
  teamOverviewRepository?: WorkTeamOverviewRepository;
}

/** Workspace dengan binding route nyata, sama seperti halaman produksi. */
function RouteWorkspaceHarness({ repository, teamOverviewRepository }: HarnessProps) {
  const route = useWorkCalendarRouteBinding();
  return (
    <>
      <WorkCalendarWorkspace
        currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
        repository={repository}
        teamMembers={WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
        teamOverviewRepository={teamOverviewRepository}
        initialView={route.initialView ?? "day"}
        initialAnchorDate={route.initialAnchorDate ?? undefined}
        now={workCalendarFixtureNow}
        routeAdapter={route.adapter}
      />
      <RouteProbe />
    </>
  );
}

function renderRouteWorkspace(options: {
  initialEntry?: string;
  entries?: readonly WorkEntry[];
  teamOverviewRepository?: WorkTeamOverviewRepository;
} = {}) {
  const repository = createFixtureWorkEntryRepository(options.entries ?? []);
  const utils = render(
    <MemoryRouter initialEntries={[options.initialEntry ?? "/calendar"]}>
      <Routes>
        <Route
          path="/calendar"
          element={
            <RouteWorkspaceHarness
              repository={repository}
              teamOverviewRepository={options.teamOverviewRepository}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, repository };
}

/** Workspace tanpa binding route (dipakai tertanam pada test/harness). */
function renderBareWorkspace(options: {
  view?: WorkCalendarViewMode;
  initialAnchorDate?: string;
  entries?: readonly WorkEntry[];
} = {}) {
  const repository = createFixtureWorkEntryRepository(options.entries ?? []);
  const utils = render(
    <WorkCalendarWorkspace
      currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
      repository={repository}
      teamMembers={WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
      initialView={options.view ?? "day"}
      initialAnchorDate={options.initialAnchorDate ?? WORK_CALENDAR_FIXTURE_TODAY}
      now={workCalendarFixtureNow}
    />,
  );
  return { ...utils, repository };
}

const quickInput = () => screen.getByLabelText("Apa yang akan dikerjakan?");

/** Menunggu callback `requestAnimationFrame` (pergeseran fokus) diproses. */
async function flushAnimationFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

/** Menunggu animasi keluar AnimatePresence selesai dan node dilepas. */
async function waitForRemoval(testId: string): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId(testId)).not.toBeInTheDocument());
}

type ViewportOverride = "compact" | "reduced-motion" | null;

/**
 * Menimpa `matchMedia` sementara untuk mensimulasikan viewport mobile atau
 * preferensi reduced motion. Nilai asli dipulihkan lewat `restore`.
 */
function overrideMatchMedia(kind: ViewportOverride): () => void {
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches:
        (kind === "compact" && query.includes("max-width: 767px")) ||
        (kind === "reduced-motion" && query.includes("prefers-reduced-motion")),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  return () => {
    Object.defineProperty(window, "matchMedia", { writable: true, value: original });
  };
}

function expectSheetContract(testId: string): void {
  const panel = screen.getByTestId(testId);
  expect(panel).toHaveAttribute("role", "dialog");
  expect(panel).toHaveAttribute("aria-modal", "true");
  const className = panel.className;
  // Side sheet desktop/tablet 480-560px dan dialog layar penuh mobile.
  expect(className).toContain("sm:min-w-[480px]");
  expect(className).toContain("sm:w-[min(560px,92vw)]");
  expect(className).toContain("w-full");
  expect(className).toContain("fixed right-0 top-0");
}

describe("WorkCalendarWorkspace — CAL-03 F4B detail di keempat tampilan", () => {
  it("klik judul pada tampilan Hari membuka side sheet detail", async () => {
    renderBareWorkspace({
      view: "day",
      entries: [createFixtureWorkEntry({ id: "d-day", title: "Pekerjaan hari" })],
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-d-day"));

    const detail = await screen.findByTestId("work-entry-detail-d-day");
    expectSheetContract("work-entry-detail-d-day");
    expect(within(detail).getByTestId("work-entry-detail-heading-d-day")).toHaveTextContent(
      "Pekerjaan hari",
    );
  });

  it("klik judul pada tampilan Minggu membuka detail yang sama polanya", async () => {
    renderBareWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-09",
      entries: [createFixtureWorkEntry({ id: "d-week", title: "Pekerjaan minggu" })],
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-d-week"));

    expect(await screen.findByTestId("work-entry-detail-d-week")).toBeInTheDocument();
    expectSheetContract("work-entry-detail-d-week");
  });

  it("preview judul pada tampilan Bulan membuka detail, bukan panel hari", async () => {
    renderBareWorkspace({
      view: "month",
      entries: [createFixtureWorkEntry({ id: "d-month", title: "Pekerjaan bulan" })],
    });

    fireEvent.click(await screen.findByTestId("work-month-preview-d-month"));

    expect(await screen.findByTestId("work-entry-detail-d-month")).toBeInTheDocument();
    expectSheetContract("work-entry-detail-d-month");
    expect(screen.queryByTestId("work-month-day-panel")).not.toBeInTheDocument();
  });

  it("pekerjaan bawahan pada tampilan Tim membuka detail read-only yang sama", async () => {
    const entries = [
      createFixtureWorkEntry({
        id: "d-team",
        ownerId: "user-bawahan-1",
        title: "Pekerjaan tim",
      }),
    ];
    renderRouteWorkspace({
      initialEntry: "/calendar?view=team&date=2026-03-10",
      entries,
      teamOverviewRepository: createFixtureWorkTeamOverviewRepository(entries),
    });

    fireEvent.click(await screen.findByTestId("team-member-toggle-user-bawahan-1"));
    fireEvent.click(await screen.findByTestId("work-entry-title-d-team"));

    const detail = await screen.findByTestId("work-entry-detail-d-team");
    expectSheetContract("work-entry-detail-d-team");
    expect(within(detail).getByText(/Hanya baca/)).toBeInTheDocument();
    expect(
      within(detail).queryByTestId("work-entry-detail-edit-title-d-team"),
    ).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /Ubah detail/i })).not.toBeInTheDocument();
  });

  it("editor detail dibuka di dalam sheet yang sama tanpa modal bertumpuk", async () => {
    renderBareWorkspace({
      entries: [createFixtureWorkEntry({ id: "d-edit", title: "Pekerjaan editor" })],
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-d-edit"));
    fireEvent.click(await screen.findByRole("button", { name: /Ubah detail/i }));

    const dialog = await screen.findByTestId("work-entry-detail-d-edit");
    expect(await within(dialog).findByText("Detail pekerjaan")).toBeInTheDocument();
    // Hanya satu permukaan dialog: editor tidak membuka dialog kedua.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByTestId("work-entry-detail-overlay-d-edit")).toBeInTheDocument();
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4B URL, deep link, Back/Forward", () => {
  const weekEntries = [
    createFixtureWorkEntry({ id: "url-1", title: "Pekerjaan URL", workDate: "2026-03-10" }),
  ];

  it("membuka detail menulis `entry` tanpa menghapus parameter route lain", async () => {
    renderRouteWorkspace({
      initialEntry: "/calendar?view=week&date=2026-03-09",
      entries: weekEntries,
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-url-1"));

    await waitFor(() => expect(routeProbe.search).toContain("entry=url-1"));
    expect(routeProbe.search).toContain("view=week");
    expect(routeProbe.search).toContain("date=2026-03-09");
  });

  it("deep link `entry` langsung membuka detail dari data yang terotorisasi", async () => {
    renderRouteWorkspace({
      initialEntry: "/calendar?view=day&date=2026-03-10&entry=url-1",
      entries: weekEntries,
    });

    expect(await screen.findByTestId("work-entry-detail-url-1")).toBeInTheDocument();
    expect(routeProbe.search).toContain("entry=url-1");
  });

  it("Browser Back menutup detail dan Forward membukanya kembali", async () => {
    renderRouteWorkspace({
      initialEntry: "/calendar?view=week&date=2026-03-09",
      entries: weekEntries,
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-url-1"));
    expect(await screen.findByTestId("work-entry-detail-url-1")).toBeInTheDocument();

    act(() => routeProbe.back());
    await waitForRemoval("work-entry-detail-url-1");
    expect(routeProbe.search).not.toContain("entry=");

    act(() => routeProbe.forward());
    expect(await screen.findByTestId("work-entry-detail-url-1")).toBeInTheDocument();
  });

  it("menutup detail mengganti history sehingga Forward tidak membukanya lagi", async () => {
    renderRouteWorkspace({
      initialEntry: "/calendar?view=day&date=2026-03-10",
      entries: weekEntries,
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-url-1"));
    expect(await screen.findByTestId("work-entry-detail-url-1")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("work-entry-detail-heading-url-1"), { key: "Escape" });
    await waitForRemoval("work-entry-detail-url-1");

    act(() => routeProbe.back());
    await waitFor(() => expect(routeProbe.search).not.toContain("entry="));
    act(() => routeProbe.forward());
    await waitFor(() => expect(routeProbe.search).not.toContain("entry="));
    expect(screen.queryByTestId("work-entry-detail-url-1")).not.toBeInTheDocument();
  });

  it("id `entry` yang tidak valid dibuang dari URL setelah data siap", async () => {
    renderRouteWorkspace({
      initialEntry: "/calendar?view=day&date=2026-03-10&entry=tidak-ada",
      entries: weekEntries,
    });

    await screen.findByTestId("work-entry-title-url-1");
    await waitFor(() => expect(routeProbe.search).not.toContain("entry="));
    expect(screen.queryByTestId(/^work-entry-detail-/)).not.toBeInTheDocument();
  });

  it("id entry milik orang lain tidak pernah muncul dari tebakan URL", async () => {
    renderRouteWorkspace({
      initialEntry: "/calendar?view=day&date=2026-03-10&entry=rahasia-1",
      entries: [
        createFixtureWorkEntry({
          id: "rahasia-1",
          ownerId: "user-bawahan-2",
          title: "Pekerjaan orang lain",
        }),
      ],
    });

    // Tampilan Hari hanya memuat entry milik pengguna sendiri.
    await waitFor(() => expect(routeProbe.search).not.toContain("entry="));
    expect(screen.queryByText("Pekerjaan orang lain")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^work-entry-detail-/)).not.toBeInTheDocument();
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4B fokus, Escape, overlay", () => {
  it("fokus awal pindah ke heading detail dan kembali ke pemicu saat ditutup", async () => {
    renderBareWorkspace({
      entries: [createFixtureWorkEntry({ id: "fx-1", title: "Pekerjaan fokus" })],
    });

    const trigger = await screen.findByTestId("work-entry-title-fx-1");
    trigger.focus();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);

    const heading = await screen.findByTestId("work-entry-detail-heading-fx-1");
    await waitFor(() => expect(heading).toHaveFocus());

    fireEvent.keyDown(heading, { key: "Escape" });
    await waitForRemoval("work-entry-detail-fx-1");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("tombol Tutup menutup panel dan memulihkan fokus", async () => {
    renderBareWorkspace({
      entries: [createFixtureWorkEntry({ id: "fx-2", title: "Pekerjaan tutup" })],
    });

    const trigger = await screen.findByTestId("work-entry-title-fx-2");
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByTestId("work-entry-detail-fx-2");

    fireEvent.click(screen.getByTestId("work-entry-detail-close-fx-2"));
    await waitForRemoval("work-entry-detail-fx-2");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("klik overlay menutup panel", async () => {
    renderBareWorkspace({
      entries: [createFixtureWorkEntry({ id: "fx-3", title: "Pekerjaan overlay" })],
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-fx-3"));
    const overlay = await screen.findByTestId("work-entry-detail-overlay-fx-3");

    fireEvent.click(overlay);
    await waitForRemoval("work-entry-detail-fx-3");
  });

  it("Tab berputar di dalam panel dan tidak keluar ke halaman", async () => {
    renderBareWorkspace({
      entries: [createFixtureWorkEntry({ id: "fx-4", title: "Pekerjaan trap" })],
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-fx-4"));
    const panel = await screen.findByTestId("work-entry-detail-fx-4");
    const close = screen.getByTestId("work-entry-detail-close-fx-4");

    close.focus();
    expect(close).toHaveFocus();
    // Tab dari elemen fokusable terakhir di panel harus berputar ke elemen
    // pertama di dalam panel, bukan berpindah ke dokumen di luar.
    fireEvent.keyDown(close, { key: "Tab" });
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
  });

  it("memilih entry lain mengganti isi panel tanpa menumpuk dialog", async () => {
    renderBareWorkspace({
      entries: [
        createFixtureWorkEntry({ id: "g-1", title: "Pekerjaan satu" }),
        createFixtureWorkEntry({ id: "g-2", title: "Pekerjaan dua" }),
      ],
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-g-1"));
    await screen.findByTestId("work-entry-detail-g-1");

    fireEvent.click(screen.getByTestId("work-entry-title-g-2"));

    expect(await screen.findByTestId("work-entry-detail-g-2")).toBeInTheDocument();
    // Panel lama menyelesaikan exit animation dulu; setelah itu hanya satu
    // dialog yang tersisa (tidak ada modal bertumpuk permanen).
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    // Baris terpilih ditandai agar keterkaitan panel dan baris jelas.
    await waitFor(() =>
      expect(screen.getByTestId("work-entry-row-g-2")).toHaveAttribute("data-selected", "true"),
    );
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4B reduced motion", () => {
  it("tetap membuka dan menutup detail saat prefers-reduced-motion aktif", async () => {
    const restore = overrideMatchMedia("reduced-motion");
    try {
      renderBareWorkspace({
        entries: [createFixtureWorkEntry({ id: "rm-1", title: "Pekerjaan reduced" })],
      });

      fireEvent.click(await screen.findByTestId("work-entry-title-rm-1"));
      const heading = await screen.findByTestId("work-entry-detail-heading-rm-1");
      await waitFor(() => expect(heading).toHaveFocus());

      fireEvent.keyDown(heading, { key: "Escape" });
      await waitForRemoval("work-entry-detail-rm-1");
    } finally {
      restore();
    }
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4B Quick Add Minggu/Bulan", () => {
  it("klik affordance tanggal pada Minggu membuka Quick Add dengan tanggal target jelas", async () => {
    renderBareWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries: [] });

    const button = await screen.findByTestId("work-week-quick-add-2026-03-11");
    expect(button).toHaveAccessibleName("Tambah pekerjaan pada 11 Mar 2026");
    fireEvent.click(button);

    const panel = await screen.findByTestId("work-calendar-quick-add-2026-03-11");
    expect(within(panel).getByTestId("work-calendar-quick-add-date")).toHaveTextContent(
      "Rabu, 11 Maret 2026",
    );
    await waitFor(() => expect(screen.getByLabelText(/Judul pekerjaan pada/)).toHaveFocus());
  });

  it("klik area kosong tanggal pada Minggu membuka Quick Add tanggal itu", async () => {
    renderBareWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries: [] });

    fireEvent.click(await screen.findByTestId("work-week-empty-2026-03-12"));

    expect(await screen.findByTestId("work-calendar-quick-add-2026-03-12")).toBeInTheDocument();
  });

  it("klik sel kosong pada Bulan membuka Quick Add tanggal sel", async () => {
    renderBareWorkspace({ view: "month", entries: [] });

    fireEvent.click(await screen.findByTestId("work-month-cell-2026-03-18"));

    const panel = await screen.findByTestId("work-calendar-quick-add-2026-03-18");
    expect(within(panel).getByTestId("work-calendar-quick-add-date")).toHaveTextContent(
      "Rabu, 18 Maret 2026",
    );
  });

  it("Quick Add tetap tersedia pada hari nonkerja", async () => {
    // 2026-03-14 adalah Sabtu; tidak ada penghalang hari libur/akhir pekan.
    renderBareWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries: [] });

    const button = await screen.findByTestId("work-week-quick-add-2026-03-14");
    expect(button).toHaveAccessibleName("Tambah pekerjaan pada 14 Mar 2026");
    fireEvent.click(button);

    expect(await screen.findByTestId("work-calendar-quick-add-2026-03-14")).toBeInTheDocument();
  });

  it("Enter menyimpan ke tanggal target dan entry langsung muncul tanpa reload", async () => {
    const { repository } = renderBareWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-09",
      entries: [],
    });

    const created: WorkEntryDraft[] = [];
    const originalCreate = repository.createEntry;
    repository.createEntry = async (draft) => {
      created.push(draft);
      return originalCreate(draft);
    };

    fireEvent.click(await screen.findByTestId("work-week-quick-add-2026-03-11"));
    const input = await screen.findByLabelText(/Judul pekerjaan pada/);
    fireEvent.change(input, { target: { value: "Rapat koordinasi unit" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].workDate).toBe("2026-03-11");
    expect(created[0].title).toBe("Rapat koordinasi unit");

    // Panel tertutup dan entry baru terlihat pada tanggal target.
    await waitForRemoval("work-calendar-quick-add-2026-03-11");
    expect(await screen.findByText("Rapat koordinasi unit")).toBeInTheDocument();
  });

  it("Escape membatalkan Quick Add tanpa membuat entry", async () => {
    const { repository } = renderBareWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-09",
      entries: [],
    });
    const created: WorkEntryDraft[] = [];
    repository.createEntry = async (draft) => {
      created.push(draft);
      return createFixtureWorkEntry({ id: "tidak-dipakai", title: draft.title });
    };

    fireEvent.click(await screen.findByTestId("work-week-quick-add-2026-03-11"));
    const input = await screen.findByLabelText(/Judul pekerjaan pada/);
    fireEvent.change(input, { target: { value: "Dibatalkan" } });
    fireEvent.keyDown(input, { key: "Escape" });

    await waitForRemoval("work-calendar-quick-add-2026-03-11");
    expect(created).toHaveLength(0);
  });

  it("Enter ganda tidak pernah membuat dua entry", async () => {
    const { repository } = renderBareWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-09",
      entries: [],
    });

    const calls: WorkEntryDraft[] = [];
    let resolveCreate: ((entry: WorkEntry) => void) | null = null;
    repository.createEntry = (draft) => {
      calls.push(draft);
      return new Promise<WorkEntry>((resolve) => {
        resolveCreate = resolve;
      });
    };

    fireEvent.click(await screen.findByTestId("work-week-quick-add-2026-03-11"));
    const input = await screen.findByLabelText(/Judul pekerjaan pada/);
    fireEvent.change(input, { target: { value: "Sekali saja" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(calls).toHaveLength(1);

    await act(async () => {
      resolveCreate?.(createFixtureWorkEntry({ id: "quick-1", title: "Sekali saja", workDate: "2026-03-11" }));
    });
    await waitForRemoval("work-calendar-quick-add-2026-03-11");
    expect(await screen.findByText("Sekali saja")).toBeInTheDocument();
  });

  it("error tetap tampil di dalam Quick Add dan panel tidak menutup", async () => {
    const { repository } = renderBareWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-09",
      entries: [],
    });
    repository.createEntry = async () => {
      throw new Error("Simpan gagal diuji.");
    };

    fireEvent.click(await screen.findByTestId("work-week-quick-add-2026-03-11"));
    const input = await screen.findByLabelText(/Judul pekerjaan pada/);
    fireEvent.change(input, { target: { value: "Akan gagal" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByTestId("work-calendar-quick-add-error")).toHaveTextContent(
      "Simpan gagal diuji.",
    );
    expect(screen.getByTestId("work-calendar-quick-add-2026-03-11")).toBeInTheDocument();
  });

  it("aksi 'Tambah detail' berpindah ke editor lengkap pada tanggal yang sama", async () => {
    const { repository } = renderBareWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-09",
      entries: [],
    });
    const created: WorkEntryDraft[] = [];
    repository.createEntry = async (draft) => {
      created.push(draft);
      return createFixtureWorkEntry({ id: "tidak-dipakai", title: draft.title });
    };

    fireEvent.click(await screen.findByTestId("work-week-quick-add-2026-03-12"));
    fireEvent.click(await screen.findByTestId("work-calendar-quick-add-detail-2026-03-12"));
    await flushAnimationFrame();

    await waitFor(() =>
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Kamis, 12 Maret 2026",
      ),
    );
    await waitFor(() => expect(quickInput()).toHaveFocus());
    await waitForRemoval("work-calendar-quick-add-2026-03-12");
    expect(created).toHaveLength(0);
  });

  it("klik pekerjaan existing dan '+N lainnya' tidak membuka Quick Add", async () => {
    const entries = Array.from({ length: 6 }, (_, index) =>
      createFixtureWorkEntry({
        id: `prop-${index}`,
        title: `Pekerjaan propagasi ${index}`,
        workDate: "2026-03-10",
      }),
    );
    renderBareWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries });

    const todayColumn = await screen.findByTestId("work-week-column-2026-03-10");
    fireEvent.click(within(todayColumn).getByTestId("work-entry-title-prop-0"));

    expect(await screen.findByTestId("work-entry-detail-prop-0")).toBeInTheDocument();
    expect(screen.queryByTestId(/^work-calendar-quick-add-/)).not.toBeInTheDocument();
  });

  it("'+N pekerjaan lainnya' pada Minggu membuka Hari, bukan Quick Add", async () => {
    const entries = Array.from({ length: 6 }, (_, index) =>
      createFixtureWorkEntry({
        id: `more-${index}`,
        title: `Pekerjaan lebih ${index}`,
        workDate: "2026-03-10",
      }),
    );
    renderBareWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries });

    fireEvent.click(await screen.findByTestId("work-week-more-2026-03-10"));

    await waitFor(() =>
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Hari Ini, Selasa, 10 Maret 2026",
      ),
    );
    expect(screen.queryByTestId(/^work-calendar-quick-add-/)).not.toBeInTheDocument();
  });

  it("tombol tanggal dan '+N lainnya' pada Bulan tidak membuka Quick Add", async () => {
    const entries = [
      createFixtureWorkEntry({ id: "m-prop-1", title: "Bulan satu", workDate: "2026-03-10" }),
      createFixtureWorkEntry({ id: "m-prop-2", title: "Bulan dua", workDate: "2026-03-10" }),
      createFixtureWorkEntry({ id: "m-prop-3", title: "Bulan tiga", workDate: "2026-03-10" }),
    ];
    renderBareWorkspace({ view: "month", entries });

    fireEvent.click(await screen.findByTestId("work-month-more-2026-03-10"));

    expect(await screen.findByTestId("work-month-day-panel")).toBeInTheDocument();
    expect(screen.queryByTestId(/^work-calendar-quick-add-/)).not.toBeInTheDocument();
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4B kontrak mobile/desktop", () => {
  it("desktop memakai popover yang menempel pada tanggal", async () => {
    renderBareWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries: [] });

    fireEvent.click(await screen.findByTestId("work-week-quick-add-2026-03-11"));

    const panel = await screen.findByTestId("work-calendar-quick-add-2026-03-11");
    expect(panel).toHaveAttribute("data-variant", "popover");
    expect(screen.getByTestId("work-calendar-quick-add-surface-2026-03-11")).toBeInTheDocument();
    expect(
      screen.queryByTestId("work-calendar-quick-add-overlay-2026-03-11"),
    ).not.toBeInTheDocument();
  });

  it("mobile memakai bottom sheet dengan overlay dan tanggal target tetap terbaca", async () => {
    const restore = overrideMatchMedia("compact");
    try {
      renderBareWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries: [] });

      fireEvent.click(await screen.findByTestId("work-week-quick-add-2026-03-11"));

      const panel = await screen.findByTestId("work-calendar-quick-add-2026-03-11");
      expect(panel).toHaveAttribute("data-variant", "bottom-sheet");

      const surface = screen.getByTestId("work-calendar-quick-add-surface-2026-03-11");
      expect(surface).toHaveAttribute("role", "dialog");
      expect(surface).toHaveAttribute("aria-modal", "true");
      expect(surface.className).toContain("max-h-[85dvh]");
      expect(screen.getByTestId("work-calendar-quick-add-overlay-2026-03-11")).toBeInTheDocument();
      expect(within(panel).getByTestId("work-calendar-quick-add-date")).toHaveTextContent(
        "Rabu, 11 Maret 2026",
      );
    } finally {
      restore();
    }
  });

  it("detail memakai dialog layar penuh pada mobile tanpa keluar viewport", async () => {
    const restore = overrideMatchMedia("compact");
    try {
      renderBareWorkspace({
        entries: [createFixtureWorkEntry({ id: "mob-1", title: "Pekerjaan mobile" })],
      });

      fireEvent.click(await screen.findByTestId("work-entry-title-mob-1"));
      const panel = await screen.findByTestId("work-entry-detail-mob-1");
      expect(panel.className).toContain("w-full");
      expect(panel.className).toContain("h-full");
      // Header lengket supaya aksi tetap terjangkau pada layar pendek.
      expect(panel.querySelector("header")?.className).toContain("sticky");
    } finally {
      restore();
    }
  });

  /**
   * Regresi layout yang ditemukan audit visual: `.sigap-page` memakai
   * `space-y-5`, sehingga anak kedua dan seterusnya mendapat `margin-top: 20px`.
   * Selama overlay/sheet `fixed` masih menjadi anak `.sigap-page`, sheet
   * bergeser 20px ke bawah (terpotong) dan overlay menyisakan celah 20px di
   * atas yang tidak menutup panel. Permukaan `fixed` karena itu dipindahkan ke
   * `document.body` lewat portal; test ini mengunci struktur tersebut.
   */
  it("permukaan fixed dirender lewat portal, bukan sebagai anak `.sigap-page`", async () => {
    renderBareWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-09",
      entries: [createFixtureWorkEntry({ id: "portal-1", title: "Pekerjaan portal" })],
    });

    fireEvent.click(await screen.findByTestId("work-entry-title-portal-1"));
    const panel = await screen.findByTestId("work-entry-detail-portal-1");
    const overlay = screen.getByTestId("work-entry-detail-overlay-portal-1");

    const page = document.querySelector(".sigap-page");
    expect(page).not.toBeNull();
    // Bukan keturunan pembungkus `space-y-5`, jadi tidak menerima margin 20px.
    expect(page?.contains(panel)).toBe(false);
    expect(page?.contains(overlay)).toBe(false);
    // Tetap terpasang di dokumen (portal ke body) dan sejajar tepi viewport.
    expect(document.body.contains(panel)).toBe(true);
    expect(panel.className).toContain("fixed right-0 top-0");
    expect(overlay.className).toContain("fixed inset-0");
  });

  it("bottom sheet mobile dan overlay Quick Add juga dipindahkan keluar `.sigap-page`", async () => {
    const restore = overrideMatchMedia("compact");
    try {
      renderBareWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries: [] });

      fireEvent.click(await screen.findByTestId("work-week-quick-add-2026-03-11"));

      const surface = await screen.findByTestId("work-calendar-quick-add-surface-2026-03-11");
      const overlay = screen.getByTestId("work-calendar-quick-add-overlay-2026-03-11");
      const page = document.querySelector(".sigap-page");
      expect(page?.contains(surface)).toBe(false);
      expect(page?.contains(overlay)).toBe(false);
      expect(document.body.contains(surface)).toBe(true);
      expect(surface.className).toContain("fixed inset-x-0 bottom-0");
    } finally {
      restore();
    }
  });
});
