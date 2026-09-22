import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import type { WorkCalendarViewMode } from "@/features/work-calendar/types/work-calendar";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntry,
  createFixtureWorkEntryRepository,
  workCalendarFixtureNow,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import { DailyProgressSummary } from "@/features/work-calendar/components/DailyProgressSummary";

/**
 * Polyfill Radix yang sama dengan suite workspace: Select memakai portal,
 * pointer capture, ResizeObserver, dan scrollIntoView yang tidak ada di jsdom.
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

const TODAY = WORK_CALENDAR_FIXTURE_TODAY;

function renderWorkspace(options: {
  view?: WorkCalendarViewMode;
  entries?: Parameters<typeof createFixtureWorkEntryRepository>[0];
} = {}) {
  const repository = createFixtureWorkEntryRepository(options.entries);
  const utils = render(
    <WorkCalendarWorkspace
      currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
      repository={repository}
      initialView={options.view ?? "day"}
      initialAnchorDate={TODAY}
      now={workCalendarFixtureNow}
    />,
  );
  return { ...utils, repository };
}

/** Membuka Select filter status dan memilih satu opsi lewat keyboard. */
async function chooseStatusFilter(label: string): Promise<void> {
  const trigger = screen.getByTestId("work-calendar-status-filter-trigger");
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const listbox = await screen.findByRole("listbox");
  const option = within(listbox).getByRole("option", { name: label });
  option.focus();
  fireEvent.keyDown(option, { key: "Enter" });
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
}

async function waitForSurface() {
  await screen.findByTestId("work-calendar-command-bar");
}

/** Menunggu daftar (atau state kosong) selesai dimuat. */
async function waitForList() {
  await waitFor(() =>
    expect(
      document.querySelector('[data-testid="work-entry-list"], [data-testid="work-entry-empty"]'),
    ).not.toBeNull(),
  );
}

describe("WorkCalendarWorkspace â€” command surface (CAL-03 redesign tahap 1)", () => {
  afterEach(() => {
    cleanup();
  });

  describe("struktur command bar", () => {
    it("menyatukan toolbar, quick entry, dan ringkasan dalam satu permukaan sticky", async () => {
      renderWorkspace({
        entries: [createFixtureWorkEntry({ id: "cmd-1", status: "in_progress" })],
      });
      await waitForList();

      const commandBar = screen.getByTestId("work-calendar-command-bar");
      expect(commandBar.className).toContain("sticky");
      // Ketiga elemen menjadi anak dari command bar, bukan kartu terpisah.
      expect(within(commandBar).getByTestId("work-calendar-range-label")).toBeInTheDocument();
      expect(within(commandBar).getByTestId("work-calendar-quick-entry")).toBeInTheDocument();
      expect(within(commandBar).getByTestId("daily-progress-summary")).toBeInTheDocument();
    });

    it("menampilkan tanggal hanya sekali secara dominan", async () => {
      renderWorkspace({
        entries: [createFixtureWorkEntry({ id: "cmd-2", status: "planned" })],
      });
      await waitForList();

      const labels = screen.getAllByTestId("work-calendar-range-label");
      expect(labels).toHaveLength(1);
      // Heading section tetap ada untuk pembaca layar, tetapi tidak tampak
      // sebagai tanggal kedua di layar.
      const sectionHeading = screen.getByRole("heading", {
        level: 2,
        name: /Pekerjaan/,
      });
      expect(sectionHeading.className).toContain("sr-only");
    });

    it("tidak menyisakan slot status kosong pada quick entry saat idle", async () => {
      renderWorkspace({ entries: [] });
      await waitForList();

      const quick = screen.getByTestId("work-calendar-quick-entry");
      expect(quick).toBeInTheDocument();
      // Tidak ada teks status statis yang menempati ruang saat tidak menyimpan.
      expect(within(quick).queryByText(/Menyimpan/)).toBeNull();
    });

    it("membungkus daftar hari sebagai satu kanvas divide-y, bukan kartu per baris", async () => {
      renderWorkspace({
        entries: [
          createFixtureWorkEntry({ id: "canvas-1", status: "planned" }),
          createFixtureWorkEntry({ id: "canvas-2", status: "in_progress" }),
        ],
      });
      await waitForList();

      const list = screen.getByTestId("work-entry-list");
      expect(list.className).toContain("divide-y");
      expect(list.className).toContain("rounded-sm");
      // Baris tidak membawa border sendiri.
      const firstRow = screen.getByTestId("work-entry-row-canvas-1");
      expect(firstRow.className).not.toContain("border");
      expect(firstRow.className).toContain("hover:bg-muted/40");
    });
  });

  describe("filter status pribadi", () => {
    const mixedEntries = () => [
      createFixtureWorkEntry({ id: "flt-planned", status: "planned", title: "Rencana hari ini" }),
      createFixtureWorkEntry({ id: "flt-running", status: "in_progress", title: "Sedang berjalan" }),
      createFixtureWorkEntry({ id: "flt-done", status: "completed", title: "Sudah selesai" }),
      createFixtureWorkEntry({ id: "flt-blocked", status: "blocked", title: "Terhambat" }),
      createFixtureWorkEntry({
        id: "flt-overdue",
        status: "planned",
        workDate: "2026-03-09",
        title: "Terlambat kemarin",
      }),
    ];

    it("menyaring tampilan Hari per status tunggal", async () => {
      renderWorkspace({ entries: mixedEntries() });
      await waitForList();

      await chooseStatusFilter("Berjalan");
      expect(screen.getByTestId("work-entry-row-flt-running")).toBeInTheDocument();
      expect(screen.queryByTestId("work-entry-row-flt-planned")).toBeNull();
      expect(screen.queryByTestId("work-entry-row-flt-done")).toBeNull();

      await chooseStatusFilter("Selesai");
      expect(screen.getByTestId("work-entry-row-flt-done")).toBeInTheDocument();
      expect(screen.queryByTestId("work-entry-row-flt-running")).toBeNull();
    });

    it("menggabungkan overdue dan blocked pada Perlu perhatian", async () => {
      renderWorkspace({ entries: mixedEntries() });
      await waitForList();

      await chooseStatusFilter("Perlu perhatian");
      expect(screen.getByTestId("work-entry-row-flt-blocked")).toBeInTheDocument();
      // Entry 9 Maret tidak termasuk rentang Hari 10 Maret: verify lewat Minggu.
      expect(screen.queryByTestId("work-entry-row-flt-planned")).toBeNull();
    });

    it("mengembalikan seluruh entry ke filter Semua", async () => {
      renderWorkspace({ entries: mixedEntries() });
      await waitForList();

      await chooseStatusFilter("Terhambat");
      expect(screen.getByTestId("work-entry-row-flt-blocked")).toBeInTheDocument();
      await chooseStatusFilter("Semua");
      expect(screen.getByTestId("work-entry-row-flt-planned")).toBeInTheDocument();
      expect(screen.getByTestId("work-entry-row-flt-running")).toBeInTheDocument();
    });

    it("mempertahankan urutan waktu kerja setelah disaring", async () => {
      renderWorkspace({
        entries: [
          createFixtureWorkEntry({
            id: "ord-timed",
            status: "in_progress",
            isAllDay: false,
            startsAt: "2026-03-10T03:00:00.000Z",
            title: "Berjam 10.00",
          }),
          createFixtureWorkEntry({
            id: "ord-allday",
            status: "in_progress",
            title: "Sepanjang hari",
          }),
        ],
      });
      await waitForList();

      await chooseStatusFilter("Berjalan");
      const list = screen.getByTestId("work-entry-list");
      const rows = within(list).getAllByTestId(/^work-entry-row-/);
      expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
        "work-entry-row-ord-timed",
        "work-entry-row-ord-allday",
      ]);
    });

    it("menyaring tampilan Minggu", async () => {
      renderWorkspace({ view: "week", entries: mixedEntries() });
      await screen.findByTestId("work-week-column-2026-03-09");

      await chooseStatusFilter("Perlu perhatian");
      // Kolom 9 Maret (hanya overdue) tetap memuat entry overdue setelah
      // filter; kolom 10 Maret memuat entry terhambat.
      const overdueColumn = screen.getByTestId("work-week-column-2026-03-09");
      expect(
        within(overdueColumn).getByTestId("work-entry-row-flt-overdue"),
      ).toBeInTheDocument();
      const todayColumn = screen.getByTestId("work-week-column-2026-03-10");
      expect(
        within(todayColumn).getByTestId("work-entry-row-flt-blocked"),
      ).toBeInTheDocument();
      expect(within(todayColumn).queryByTestId("work-entry-row-flt-planned")).toBeNull();
    });

    it("menyaring tampilan Bulan", async () => {
      renderWorkspace({ view: "month", entries: mixedEntries() });
      await screen.findByTestId("work-month-cell-2026-03-10");

      await chooseStatusFilter("Terhambat");
      // Sel 10 Maret hanya memuat preview entry terhambat.
      const cell = screen.getByTestId("work-month-cell-2026-03-10");
      expect(within(cell).getByTestId("work-month-preview-flt-blocked")).toBeInTheDocument();
      expect(within(cell).queryByTestId("work-month-preview-flt-planned")).toBeNull();
    });

    it("tidak menampilkan kontrol filter pada mode Tim", () => {
      render(
        <WorkCalendarWorkspace
          currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
          repository={createFixtureWorkEntryRepository([
            createFixtureWorkEntry({ id: "team-1", status: "in_progress" }),
          ])}
          teamMembers={WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
          initialView="team"
          initialAnchorDate={TODAY}
          now={workCalendarFixtureNow}
        />,
      );
      expect(screen.queryByTestId("work-calendar-status-filter-trigger")).toBeNull();
    });
  });

  describe("quick entry keyboard", () => {
    it("menyimpan hanya dengan judul lewat Enter", async () => {
      renderWorkspace({ entries: [] });
      await waitForList();

      const input = screen.getByLabelText("Apa yang akan dikerjakan?");
      fireEvent.change(input, { target: { value: "Kirim laporan jam 9" } });
      fireEvent.keyDown(input, { key: "Enter" });

      // Entry baru langsung muncul di daftar hari ini.
      await screen.findByText("Kirim laporan jam 9");
      // Input dikosongkan setelah simpan berhasil.
      expect((input as HTMLInputElement).value).toBe("");
    });

    it("membatalkan dan membersihkan input lewat Escape", async () => {
      renderWorkspace({ entries: [] });
      await waitForList();

      const input = screen.getByLabelText("Apa yang akan dikerjakan?") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Batal ini" } });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(input.value).toBe("");
    });
  });

  describe("baris terpilih", () => {
    it("menandai baris terpilih dengan ring dan latar", async () => {
      renderWorkspace({
        entries: [
          createFixtureWorkEntry({ id: "sel-a", status: "planned", title: "Pekerjaan A" }),
          createFixtureWorkEntry({ id: "sel-b", status: "planned", title: "Pekerjaan B" }),
        ],
      });
      await waitForList();

      fireEvent.click(screen.getByTestId("work-entry-title-sel-a"));
      await screen.findByTestId("work-entry-detail-sel-a");

      const selected = screen.getByTestId("work-entry-row-sel-a");
      expect(selected.getAttribute("data-selected")).toBe("true");
      expect(selected.className).toContain("ring-primary");
      expect(selected.className).toContain("bg-primary/5");
      const other = screen.getByTestId("work-entry-row-sel-b");
      expect(other.getAttribute("data-selected")).toBe("false");
    });
  });

  describe("ringkasan compact", () => {
    it("menyembunyikan rincian status saat compact (mobile) dan menampilkannya saat lebar", () => {
      const counts = { total: 4, planned: 1, inProgress: 1, completed: 1, blocked: 1, overdue: 0 };

      const { rerender } = render(<DailyProgressSummary counts={counts} compact />);
      expect(screen.getByTestId("progress-completed-total")).toHaveTextContent("1");
      expect(screen.getByTestId("progress-total")).toHaveTextContent("4");
      expect(screen.queryByTestId("progress-status-items")).toBeNull();

      rerender(<DailyProgressSummary counts={counts} />);
      expect(screen.getByTestId("progress-status-items")).toBeInTheDocument();
      expect(screen.getByTestId("progress-planned")).toHaveTextContent("1");
    });
  });
});
