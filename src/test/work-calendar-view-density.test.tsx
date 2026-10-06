/**
 * Test kepadatan tampilan CAL-03 tahap 2.
 *
 * Cakupan yang spesifik untuk redesign ini:
 * - Minggu: batas preview 4 desktop / 3 mobile, dan `+N pekerjaan lainnya`
 *   membuka panel hari dalam konteks Minggu (popover desktop, bottom sheet
 *   mobile) alih-alih memindahkan pengguna ke tampilan Hari.
 * - Bulan mobile: satu preview judul prioritas tertinggi + ringkasan status,
 *   tanpa teks di bawah 11px.
 * - Tim: daftar risiko operasional (badge Terhambat/Terlambat terbaca
 *   pertama, anggota tanpa risiko lebih ringan) dengan pagination server-side.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import type { WorkCalendarViewMode } from "@/features/work-calendar/types/work-calendar";
import type { WorkTeamOverviewOption } from "@/features/work-calendar/types/work-team-overview";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_DEPARTMENT_FINANCE_ID,
  WORK_CALENDAR_FIXTURE_OFFICE_A_ID,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntry,
  createFixtureWorkEntryRepository,
  createFixtureWorkTeamOverviewRepository,
  workCalendarFixtureNow,
} from "@/features/work-calendar/testing/work-calendar-fixtures";

/**
 * Radix Select/Popover/Dialog memakai Portal, pointer capture, ResizeObserver,
 * dan scrollIntoView yang tidak disediakan jsdom.
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

function renderWorkspace(options: {
  view?: WorkCalendarViewMode;
  initialAnchorDate?: string;
  entries?: readonly ReturnType<typeof createFixtureWorkEntry>[];
  teamOverviewRepository?: ReturnType<typeof createFixtureWorkTeamOverviewRepository>;
} = {}) {
  const entries = options.entries ?? [];
  return render(
    <WorkCalendarWorkspace
      currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
      repository={createFixtureWorkEntryRepository(entries)}
      teamMembers={WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
      teamOverviewRepository={options.teamOverviewRepository}
      initialView={options.view ?? "day"}
      initialAnchorDate={options.initialAnchorDate ?? WORK_CALENDAR_FIXTURE_TODAY}
      now={workCalendarFixtureNow}
    />,
  );
}

/** Menimpa matchMedia ke viewport mobile (< md); dipulihkan setelah test. */
function useCompactViewport(): () => void {
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 767px"),
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

const TODAY = WORK_CALENDAR_FIXTURE_TODAY;

function denseWeekEntries(count: number) {
  return Array.from({ length: count }, (_, index) =>
    createFixtureWorkEntry({
      id: `dense-${index}`,
      title: `Pekerjaan padat ${index}`,
      workDate: TODAY,
      status: index === 0 ? "blocked" : "planned",
    }),
  );
}

describe("CAL-03 tahap 2 — kepadatan Minggu", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("membatasi dua preview pada desktop dan menyisakan +N", async () => {
    renderWorkspace({ view: "week", entries: denseWeekEntries(6) });

    const column = await screen.findByTestId(`work-week-column-${TODAY}`);
    expect(within(column).getAllByTestId(/^work-entry-row-/)).toHaveLength(2);
    expect(within(column).getByTestId(`work-week-more-${TODAY}`)).toHaveTextContent(
      "+4 pekerjaan lainnya",
    );
  });

  it("membatasi dua preview pada mobile", async () => {
    const restore = useCompactViewport();
    try {
      renderWorkspace({ view: "week", entries: denseWeekEntries(6) });

      const column = await screen.findByTestId(`work-week-column-${TODAY}`);
      await waitFor(() =>
        expect(within(column).getAllByTestId(/^work-entry-row-/)).toHaveLength(2),
      );
      expect(within(column).getByTestId(`work-week-more-${TODAY}`)).toHaveTextContent(
        "+4 pekerjaan lainnya",
      );
    } finally {
      restore();
    }
  });

  it("+N membuka panel hari dalam konteks Minggu dengan seluruh entry", async () => {
    renderWorkspace({ view: "week", entries: denseWeekEntries(6) });

    fireEvent.click(await screen.findByTestId(`work-week-more-${TODAY}`));

    // Konteks Minggu tetap: tujuh kolom masih dirender di bawah panel.
    const panel = await screen.findByTestId(`work-week-day-panel-${TODAY}`);
    expect(panel).toBeInTheDocument();
    expect(screen.getAllByTestId(/^work-week-column-/)).toHaveLength(7);
    // Seluruh entry termuat, termasuk yang dipotong preview (index 4 dan 5).
    expect(within(panel).getByTestId("work-entry-row-dense-4")).toBeInTheDocument();
    expect(within(panel).getByTestId("work-entry-row-dense-5")).toBeInTheDocument();
  });

  it("+N pada mobile membuka panel sebagai bottom sheet", async () => {
    const restore = useCompactViewport();
    try {
      renderWorkspace({ view: "week", entries: denseWeekEntries(6) });

      fireEvent.click(await screen.findByTestId(`work-week-more-${TODAY}`));

      expect(await screen.findByTestId(`work-week-day-panel-surface-${TODAY}`)).toBeInTheDocument();
      expect(screen.getByTestId(`work-week-day-panel-${TODAY}`)).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it("Escape menutup panel hari Minggu", async () => {
    renderWorkspace({ view: "week", entries: denseWeekEntries(6) });

    fireEvent.click(await screen.findByTestId(`work-week-more-${TODAY}`));
    const surface = await screen.findByTestId(`work-week-day-panel-surface-${TODAY}`);

    fireEvent.keyDown(surface, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId(`work-week-day-panel-${TODAY}`)).not.toBeInTheDocument(),
    );
  });

  it("membuka detail dari panel menutup panel agar tidak bertumpuk", async () => {
    renderWorkspace({ view: "week", entries: denseWeekEntries(6) });

    fireEvent.click(await screen.findByTestId(`work-week-more-${TODAY}`));
    const panel = await screen.findByTestId(`work-week-day-panel-${TODAY}`);

    fireEvent.click(within(panel).getByTestId("work-entry-title-dense-0"));

    await waitFor(() =>
      expect(screen.queryByTestId(`work-week-day-panel-surface-${TODAY}`)).not.toBeInTheDocument(),
    );
    expect(await screen.findByTestId("work-entry-detail-dense-0")).toBeInTheDocument();
  });
});

describe("CAL-03 tahap 2 — Bulan mobile", () => {
  it("menampilkan satu preview judul prioritas tertinggi plus ringkasan status", async () => {
    renderWorkspace({
      view: "month",
      entries: [
        createFixtureWorkEntry({
          id: "mrisk",
          title: "Selesaikan berkas tertunda",
          workDate: TODAY,
          status: "blocked",
          blockedReason: "Menunggu tanda tangan",
        }),
        createFixtureWorkEntry({
          id: "mnormal",
          title: "Rapat koordinasi rutin",
          workDate: TODAY,
          status: "planned",
        }),
      ],
    });

    const compact = await screen.findByTestId(`work-month-compact-${TODAY}`);
    // Entry terhambat dipilih sebagai preview tunggal (prioritas tertinggi).
    expect(within(compact).getByTestId("work-month-mobile-preview-mrisk")).toBeInTheDocument();
    expect(compact).toHaveTextContent("Selesaikan berkas tertunda");
    // Ringkasan jumlah per status tetap ada.
    expect(within(compact).getAllByText("1")).toHaveLength(2);
  });

  it("preview judul mobile membuka detail, tombol tanggal membuka panel hari", async () => {
    renderWorkspace({
      view: "month",
      entries: [
        createFixtureWorkEntry({
          id: "mdetail",
          title: "Rapat koordinasi mingguan",
          workDate: TODAY,
        }),
      ],
    });

    fireEvent.click(await screen.findByTestId(`work-month-mobile-preview-mdetail`));
    expect(await screen.findByTestId("work-entry-detail-mdetail")).toBeInTheDocument();

    fireEvent.click(await screen.findByTestId(`work-month-open-${TODAY}`));
    const panel = await screen.findByTestId("work-month-day-panel");
    expect(panel).toHaveTextContent("Rapat koordinasi mingguan");
  });
});

function teamRiskEntries() {
  return [
    createFixtureWorkEntry({
      id: "risk-blocked",
      ownerId: "user-bawahan-1",
      title: "Verifikasi berkas tertahan",
      workDate: TODAY,
      status: "blocked",
      blockedReason: "Menunggu tanda tangan",
    }),
    createFixtureWorkEntry({
      id: "risk-late",
      ownerId: "user-bawahan-1",
      title: "Laporan mingguan",
      workDate: "2026-03-04",
      status: "planned",
    }),
    createFixtureWorkEntry({
      id: "healthy-running",
      ownerId: "user-bawahan-2",
      title: "Input data harian",
      workDate: TODAY,
      status: "in_progress",
    }),
    createFixtureWorkEntry({
      id: "healthy-done",
      ownerId: "user-bawahan-3",
      title: "Tutup buku kas",
      workDate: TODAY,
      status: "completed",
    }),
  ];
}

describe("CAL-03 tahap 2 — daftar risiko Tim", () => {
  it("badge Terhambat/Terlambat terbaca pertama, sebelum identitas", async () => {
    renderWorkspace({
      view: "team",
      entries: teamRiskEntries(),
      teamOverviewRepository: createFixtureWorkTeamOverviewRepository(teamRiskEntries()),
    });

    const card = await screen.findByTestId("team-member-user-bawahan-1");
    expect(card).toHaveAttribute("data-risk", "true");

    const badges = within(card).getByTestId("team-member-risk-user-bawahan-1");
    expect(badges).toHaveTextContent("1 Terhambat");
    // Badge berada sebelum nama di urutan DOM.
    const name = within(card).getByText("Sinta Maharani");
    expect(
      badges.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("anggota tanpa risiko tidak memiliki badge dan tetap ringan", async () => {
    renderWorkspace({
      view: "team",
      entries: teamRiskEntries(),
      teamOverviewRepository: createFixtureWorkTeamOverviewRepository(teamRiskEntries()),
    });

    await screen.findByTestId("team-member-user-bawahan-1");

    const healthy = screen.getByTestId("team-member-user-bawahan-2");
    expect(healthy).toHaveAttribute("data-risk", "false");
    expect(within(healthy).queryByTestId("team-member-risk-user-bawahan-2")).not.toBeInTheDocument();
    // Metrik lengkap tetap tersedia (baca saja), hanya dengan bobot lebih ringan.
    expect(within(healthy).getByTestId("team-member-completed-user-bawahan-2")).toBeInTheDocument();
  });

  it("pagination server-side tetap bekerja pada daftar risiko", async () => {
    const manyMembers: readonly WorkTeamOverviewOption[] = Array.from({ length: 30 }, (_, index) => ({
      kind: "member",
      id: `page-member-${index}`,
      label: `Anggota ${String(index).padStart(2, "0")}`,
      sublabel: null,
      officeId: WORK_CALENDAR_FIXTURE_OFFICE_A_ID,
      departmentId: WORK_CALENDAR_FIXTURE_DEPARTMENT_FINANCE_ID,
      memberCount: 0,
    }));

    renderWorkspace({
      view: "team",
      teamOverviewRepository: createFixtureWorkTeamOverviewRepository([], {
        members: manyMembers,
      }),
    });

    expect(await screen.findByTestId("team-overview-page-label")).toHaveTextContent(
      "Halaman 1 dari 2",
    );
    expect(await screen.findByTestId("team-member-page-member-0")).toBeInTheDocument();
    expect(screen.queryByTestId("team-member-page-member-25")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("team-overview-next-page"));

    expect(await screen.findByTestId("team-overview-page-label")).toHaveTextContent(
      "Halaman 2 dari 2",
    );
    expect(await screen.findByTestId("team-member-page-member-25")).toBeInTheDocument();
  });
});
