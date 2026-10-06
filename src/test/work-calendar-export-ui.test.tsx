import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import { WorkCalendarToolbar } from "@/features/work-calendar/components/WorkCalendarToolbar";
import { DEFAULT_WORK_CALENDAR_WORK_SETTINGS } from "@/features/work-calendar/lib/work-day-config";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntry,
  createFixtureWorkEntryRepository,
  workCalendarFixtureNow,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import type { WorkCalendarSettingsRepository, WorkCalendarViewMode } from "@/features/work-calendar/types/work-calendar";

const mocks = vi.hoisted(() => ({ exportPdf: vi.fn(), save: vi.fn() }));
vi.mock("@/features/work-calendar/lib/work-calendar-pdf", () => ({ exportWorkCalendarPdf: mocks.exportPdf }));

function renderCalendar(settingsRepository?: WorkCalendarSettingsRepository) {
  const repository = createFixtureWorkEntryRepository([
    createFixtureWorkEntry({ id: "export-own", title: "Pekerjaan sendiri" }),
    createFixtureWorkEntry({ id: "export-other", ownerId: "foreign-owner", title: "Pekerjaan asing" }),
  ]);
  return render(<WorkCalendarWorkspace currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
    repository={repository} settingsRepository={settingsRepository}
    initialAnchorDate={WORK_CALENDAR_FIXTURE_TODAY} now={workCalendarFixtureNow} />);
}

describe("Work Calendar PDF command", () => {
  beforeEach(() => {
    mocks.exportPdf.mockReset();
    mocks.save.mockReset();
    mocks.exportPdf.mockResolvedValue({ save: mocks.save });
  });
  afterEach(cleanup);

  it("exports only the current owner's rows and selected dates after successful reads", async () => {
    renderCalendar();
    await screen.findByRole("button", { name: "Buka detail pekerjaan: Pekerjaan sendiri" });
    fireEvent.click(screen.getByRole("button", { name: "Export kalender ke PDF" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.exportPdf).toHaveBeenCalledWith(expect.objectContaining({
      entries: [expect.objectContaining({ id: "export-own" })],
      owner: WORK_CALENDAR_FIXTURE_CURRENT_USER,
      fromDate: WORK_CALENDAR_FIXTURE_TODAY,
      toDate: WORK_CALENDAR_FIXTURE_TODAY,
      now: workCalendarFixtureNow(),
    }));
  });

  it("never exports with fallback settings when the configured office lookup failed", async () => {
    renderCalendar({ getWorkSettings: vi.fn().mockRejectedValue(new Error("offline")), listHolidays: vi.fn().mockResolvedValue([]) });
    await screen.findByRole("button", { name: "Buka detail pekerjaan: Pekerjaan sendiri" });
    const button = screen.getByRole("button", { name: "Export kalender ke PDF" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Pengaturan jam kerja");
    expect(mocks.exportPdf).not.toHaveBeenCalled();
  });

  it("does not save a partial PDF after history loading fails", async () => {
    mocks.exportPdf.mockRejectedValue(new Error("history failed"));
    renderCalendar();
    await screen.findByRole("button", { name: "Buka detail pekerjaan: Pekerjaan sendiri" });
    fireEvent.click(screen.getByRole("button", { name: "Export kalender ke PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF belum dapat dibuat");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("aborts an in-flight export on date change and suppresses a late download", async () => {
    let resolvePdf: ((value: { save: typeof mocks.save }) => void) | undefined;
    mocks.exportPdf.mockImplementation(() => new Promise(resolve => { resolvePdf = resolve; }));
    renderCalendar({ getWorkSettings: vi.fn().mockResolvedValue(DEFAULT_WORK_CALENDAR_WORK_SETTINGS), listHolidays: vi.fn().mockResolvedValue([]) });
    await screen.findByRole("button", { name: "Buka detail pekerjaan: Pekerjaan sendiri" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Export kalender ke PDF" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Export kalender ke PDF" }));
    await waitFor(() => expect(mocks.exportPdf).toHaveBeenCalledOnce());
    const signal: AbortSignal = mocks.exportPdf.mock.calls[0][0].signal;
    fireEvent.click(screen.getByRole("button", { name: "Rentang berikutnya" }));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => { resolvePdf?.({ save: mocks.save }); });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("hides the personal export in Team view and gives it an accessible name in other views", () => {
    const noop = () => {};
    const toolbar = (view: WorkCalendarViewMode) => <WorkCalendarToolbar view={view}
      anchorDate={WORK_CALENDAR_FIXTURE_TODAY} today={WORK_CALENDAR_FIXTURE_TODAY}
      isTeamViewAvailable ownerFilterId="all" teamMembers={[]} addLabel="Tambah"
      onSelectView={noop} onPrevious={noop} onNext={noop} onToday={noop}
      onSelectOwner={noop} onAdd={noop} onExportPdf={noop} />;
    const { rerender } = render(toolbar("team"));
    expect(screen.queryByRole("button", { name: "Export kalender ke PDF" })).toBeNull();
    rerender(toolbar("month"));
    expect(screen.getByRole("button", { name: "Export kalender ke PDF" })).toHaveAttribute("title", "Export kalender ke PDF");
  });
});
