import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import { WorkEntryCreateDialog } from "@/features/work-calendar/components/WorkEntryCreateDialog";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntry,
  createFixtureWorkEntryRepository,
  workCalendarFixtureNow,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import type { WorkEntry } from "@/features/work-calendar/types/work-calendar";

/**
 * CAL-03 F5 — kontrak interaksi siklus hidup pekerjaan.
 *
 * Fokus pengujian:
 * - satu pekerjaan = satu baris: aksi siklus hidup hanya PATCH;
 * - input tenggat dan warna penanda tersedia di editor detail;
 * - timeline peristiwa tampil dan bertambah setelah aksi;
 * - indikator "Terlambat" dan "Selesai terlambat".
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

function renderWorkspace(entries: readonly WorkEntry[], anchorDate: string = WORK_CALENDAR_FIXTURE_TODAY) {
  const repository = createFixtureWorkEntryRepository(entries);
  const utils = render(
    <WorkCalendarWorkspace
      currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
      repository={repository}
      teamMembers={WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
      initialView="day"
      initialAnchorDate={anchorDate}
      now={workCalendarFixtureNow}
    />,
  );
  return { ...utils, repository };
}

async function openDetail(entryId: string): Promise<HTMLElement> {
  fireEvent.click(await screen.findByTestId(`work-entry-title-${entryId}`));
  return screen.findByTestId(`work-entry-detail-${entryId}`);
}

describe("WorkCalendarWorkspace — CAL-03 F5 siklus hidup", () => {
  it.each(["planned", "in_progress", "blocked"] as const)("preserves a result through detail save and reopen while %s", async (status) => {
    const id = `partial-${status}`;
    const { repository } = renderWorkspace([createFixtureWorkEntry({
      id, status, blockedReason: status === "blocked" ? "Waiting for input" : null,
    })]);
    await openDetail(id);
    fireEvent.click(screen.getByTestId(`work-entry-detail-edit-${id}`));
    fireEvent.change(await screen.findByLabelText("Hasil pekerjaan"), { target: { value: "  Hasil sementara  " } });
    fireEvent.click(screen.getByRole("button", { name: /Simpan detail/i }));
    await waitFor(async () => {
      const entry = await repository.getEntryById({ entryId: id });
      expect(entry?.realization).toBe("Hasil sementara");
      expect(entry?.status).toBe(status);
      expect(entry?.completedAt).toBeNull();
    });
    fireEvent.click(screen.getByTestId(`work-entry-detail-close-${id}`));
    const detail = await openDetail(id);
    expect(within(detail).getByText("Hasil sementara", { exact: true })).toBeInTheDocument();
  });

  it("shows no deadline when absent in detail and editor", async () => {
    renderWorkspace([createFixtureWorkEntry({ id: "no-deadline", dueDate: null })]);
    const detail = await openDetail("no-deadline");
    expect(within(detail).getByTestId("work-entry-detail-due-date-no-deadline")).toHaveTextContent(/^Tanpa tenggat$/);
    fireEvent.click(screen.getByTestId("work-entry-detail-edit-no-deadline"));
    expect(await screen.findByText("Opsional. Kosong berarti tanpa tenggat.")).toBeInTheDocument();
  });

  it("states no deadline for an empty deadline in the creation form", () => {
    render(<WorkEntryCreateDialog workDate={WORK_CALENDAR_FIXTURE_TODAY} initialTitle="New task" isSaving={false} error={null} onSubmit={async () => false} onClose={() => {}} onDismissError={() => {}} />);
    expect(screen.getByTestId("work-entry-create-due-date")).toHaveValue("");
    expect(screen.getByText("Opsional. Kosong berarti tanpa tenggat.")).toBeInTheDocument();
  });

  it.each([
    ["event", "planned"], ["event", "blocked"],
    ["availability", "planned"], ["availability", "blocked"],
  ] as const)("disables continuation for older %s entries with %s status", async (kind, status) => {
    const entry = createFixtureWorkEntry({
      id: `${kind}-${status}`, kind, status, workDate: "2026-03-09", blockedReason: status === "blocked" ? "Waiting" : null,
    });
    const { repository } = renderWorkspace([entry], "2026-03-09");
    await openDetail(entry.id);
    const continueButton = screen.getByTestId(`work-entry-continue-today-${entry.id}`);
    expect(continueButton).toBeDisabled();
    fireEvent.click(continueButton);
    expect(await repository.getEntryById({ entryId: entry.id })).toMatchObject({ workDate: "2026-03-09", status });
    expect((await repository.listEntryEvents({ entryId: entry.id })).map((event) => event.type)).toEqual(["created"]);
  });

  it("menampilkan tenggat dan warna penanda pada detail beserta timeline", async () => {
    renderWorkspace([
      createFixtureWorkEntry({
        id: "f5-color",
        title: "Pekerjaan berwarna",
        dueDate: "2026-03-20",
        colorSwatch: "rose",
      }),
    ]);

    await openDetail("f5-color");

    expect(screen.getByTestId("work-entry-detail-color-f5-color")).toBeInTheDocument();
    expect(screen.getByTestId("work-entry-detail-due-date-f5-color")).toBeInTheDocument();
    expect(screen.getByTestId("work-entry-timeline")).toBeInTheDocument();
    expect(await screen.findByTestId("work-entry-timeline-item-created")).toBeInTheDocument();
  });

  it("menandai pekerjaan lampau sebagai Terlambat", async () => {
    renderWorkspace(
      [createFixtureWorkEntry({ id: "f5-late", title: "Pekerjaan lampau", workDate: "2026-03-01", dueDate: "2026-03-01" })],
      "2026-03-01",
    );

    await openDetail("f5-late");
    expect(
      within(screen.getByTestId("work-entry-detail-f5-late")).getAllByText("Terlambat").length,
    ).toBeGreaterThan(0);
  });

  it("menandai Selesai terlambat bila completedAt melewati tenggat", async () => {
    renderWorkspace(
      [
        createFixtureWorkEntry({
          id: "f5-late-done",
          title: "Selesai lewat tenggat",
          status: "completed",
          workDate: "2026-03-01",
          dueDate: "2026-03-05",
          completedAt: "2026-03-08T02:00:00.000Z",
          realization: "Beres",
        }),
      ],
      "2026-03-01",
    );

    await openDetail("f5-late-done");
    expect(
      within(screen.getByTestId("work-entry-detail-f5-late-done")).getAllByText("Selesai terlambat").length,
    ).toBeGreaterThan(0);
  });

  it("aksi Terhambat menyimpan alasan dan menambah peristiwa pada baris yang sama", async () => {
    const { repository } = renderWorkspace([
      createFixtureWorkEntry({ id: "f5-block", title: "Pekerjaan terhambat" }),
    ]);

    await openDetail("f5-block");
    fireEvent.click(screen.getByTestId("work-entry-block-f5-block"));

    fireEvent.change(screen.getByTestId("work-entry-lifecycle-input-f5-block"), {
      target: { value: "Menunggu data cabang" },
    });
    fireEvent.click(screen.getByTestId("work-entry-lifecycle-submit-f5-block"));

    await waitFor(async () => {
      const events = await repository.listEntryEvents({ entryId: "f5-block" });
      expect(events.some((event) => event.type === "status_changed" && event.toStatus === "blocked")).toBe(true);
    });

    // Panel tetap terbuka dan timeline menampilkan peristiwa baru.
    expect(screen.getByTestId("work-entry-detail-f5-block")).toBeInTheDocument();
    expect(
      within(await screen.findByTestId("work-entry-timeline-item-status_changed")).getByText(
        "Menunggu data cabang",
      ),
    ).toBeInTheDocument();

    const entries = await repository.listEntries({
      ownerId: WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });
    expect(entries.filter((entry) => entry.id === "f5-block")).toHaveLength(1);
  });

  it("aksi Lanjutkan hari ini mengubah status tanpa memindahkan tanggal atau membuat baris baru", async () => {
    const { repository } = renderWorkspace(
      [createFixtureWorkEntry({ id: "f5-continue", title: "Lanjutkan", workDate: "2026-03-09" })],
      "2026-03-09",
    );

    await openDetail("f5-continue");
    fireEvent.click(screen.getByTestId("work-entry-continue-today-f5-continue"));

    await waitFor(async () => {
      const entry = await repository.getEntryById({ entryId: "f5-continue" });
      expect(entry?.workDate).toBe("2026-03-09");
      expect(entry?.status).toBe("in_progress");
    });

    const events = await repository.listEntryEvents({ entryId: "f5-continue" });
    expect(events.some((event) => event.type === "schedule_changed")).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["created", "status_changed"]);
    await screen.findByTestId("work-entry-timeline-item-status_changed");
  });

  it("aksi Selesai meminta hasil pekerjaan sebelum menyimpan", async () => {
    const { repository } = renderWorkspace([
      createFixtureWorkEntry({ id: "f5-done", title: "Selesaikan" }),
    ]);

    await openDetail("f5-done");
    fireEvent.click(screen.getByTestId("work-entry-complete-f5-done"));

    const input = screen.getByTestId("work-entry-lifecycle-input-f5-done");
    // Tombol simpan nonaktif tanpa hasil.
    expect(screen.getByTestId("work-entry-lifecycle-submit-f5-done")).toBeDisabled();

    fireEvent.change(input, { target: { value: "Sudah beres" } });
    fireEvent.click(screen.getByTestId("work-entry-lifecycle-submit-f5-done"));

    await waitFor(async () => {
      const entry = await repository.getEntryById({ entryId: "f5-done" });
      expect(entry?.status).toBe("completed");
      expect(entry?.realization).toBe("Sudah beres");
    });
  });

  it("editor detail menyediakan input tenggat dan pemilih warna aksesibel", async () => {
    const { repository } = renderWorkspace([
      createFixtureWorkEntry({ id: "f5-edit", title: "Ubah detail" }),
    ]);

    await openDetail("f5-edit");
    fireEvent.click(screen.getByTestId("work-entry-detail-edit-f5-edit"));

    const dueInput = await screen.findByTestId("work-entry-editor-due-date-f5-edit");
    fireEvent.change(dueInput, { target: { value: "2026-04-01" } });

    fireEvent.click(screen.getByTestId("work-entry-editor-f5-edit-color-teal"));
    fireEvent.click(screen.getByRole("button", { name: /Simpan detail/i }));

    await waitFor(async () => {
      const entry = await repository.getEntryById({ entryId: "f5-edit" });
      expect(entry?.dueDate).toBe("2026-04-01");
      expect(entry?.colorSwatch).toBe("teal");
    });
  });
});
