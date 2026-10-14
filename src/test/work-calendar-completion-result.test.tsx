import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkEntryLifecycleActions } from "@/features/work-calendar/components/WorkEntryLifecycleActions";
import { WorkEntryRow } from "@/features/work-calendar/components/WorkEntryRow";
import { createFixtureWorkEntry, WORK_CALENDAR_FIXTURE_TODAY } from "@/features/work-calendar/testing/work-calendar-fixtures";

describe("saved results when completing work", () => {
  it.each([false, true])("detail completion uses the saved result and accepts edits: %s", (edit) => {
    const entry = createFixtureWorkEntry({ id: "saved-result", status: "in_progress", realization: "Existing result" });
    const onSave = vi.fn();
    render(<WorkEntryLifecycleActions entry={entry} today={WORK_CALENDAR_FIXTURE_TODAY} isSaving={false} onSave={onSave} onEditDetail={vi.fn()} />);
    fireEvent.click(screen.getByTestId("work-entry-complete-saved-result"));
    const input = screen.getByLabelText("Hasil pekerjaan");
    expect(input).toHaveValue("Existing result");
    if (edit) fireEvent.change(input, { target: { value: "Updated result" } });
    fireEvent.click(screen.getByTestId("work-entry-lifecycle-submit-saved-result"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", realization: edit ? "Updated result" : "Existing result" }));
  });

  it("cancel then reopen loads the latest saved result, not the discarded edit", () => {
    const entry = createFixtureWorkEntry({ id: "saved-result", realization: "Existing result" });
    const props = { entry, today: WORK_CALENDAR_FIXTURE_TODAY, isSaving: false, onSave: vi.fn(), onEditDetail: vi.fn() };
    const { rerender } = render(<WorkEntryLifecycleActions {...props} />);
    fireEvent.click(screen.getByTestId("work-entry-complete-saved-result"));
    fireEvent.change(screen.getByLabelText("Hasil pekerjaan"), { target: { value: "Discard this" } });
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    rerender(<WorkEntryLifecycleActions {...props} entry={{ ...entry, realization: "New saved result" }} />);
    fireEvent.click(screen.getByTestId("work-entry-complete-saved-result"));
    expect(screen.getByLabelText("Hasil pekerjaan")).toHaveValue("New saved result");
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("missing result still requires input and whitespace cannot complete work", () => {
    const entry = createFixtureWorkEntry({ id: "saved-result", realization: null });
    render(<WorkEntryLifecycleActions entry={entry} today={WORK_CALENDAR_FIXTURE_TODAY} isSaving={false} onSave={vi.fn()} onEditDetail={vi.fn()} />);
    fireEvent.click(screen.getByTestId("work-entry-complete-saved-result"));
    expect(screen.getByLabelText("Hasil pekerjaan")).toHaveValue("");
    expect(screen.getByTestId("work-entry-lifecycle-submit-saved-result")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Hasil pekerjaan"), { target: { value: "  " } });
    expect(screen.getByTestId("work-entry-lifecycle-submit-saved-result")).toBeDisabled();
  });

  it("row completion starts from saved results without overwriting typing on refetch", () => {
    const entry = createFixtureWorkEntry({ id: "row-result", realization: "Existing result", blockedReason: "Waiting" });
    const props = { entry, today: WORK_CALENDAR_FIXTURE_TODAY, onUpdateTitle: vi.fn(), onRequestStatus: vi.fn(), onSubmitFollowUp: vi.fn(), onCancelFollowUp: vi.fn(), onOpenDetail: vi.fn(), onMoveToDate: vi.fn(), onDelete: vi.fn() };
    const { rerender } = render(<WorkEntryRow {...props} />);
    rerender(<WorkEntryRow {...props} promptType="realization" />);
    expect(screen.getByLabelText(/Hasil pekerjaan/)).toHaveValue("Existing result");
    fireEvent.change(screen.getByLabelText(/Hasil pekerjaan/), { target: { value: "My final result" } });
    rerender(<WorkEntryRow {...props} entry={{ ...entry, realization: "Refetched result" }} promptType="realization" />);
    expect(screen.getByLabelText(/Hasil pekerjaan/)).toHaveValue("My final result");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(props.onSubmitFollowUp).toHaveBeenCalledWith("My final result");
    rerender(<WorkEntryRow {...props} />);
    rerender(<WorkEntryRow {...props} entry={{ ...entry, realization: "Refetched result" }} promptType="realization" />);
    expect(screen.getByLabelText(/Hasil pekerjaan/)).toHaveValue("Refetched result");
    rerender(<WorkEntryRow {...props} promptType="blocked_reason" />);
    expect(screen.getByLabelText(/Alasan terhambat/)).toHaveValue("Waiting");
  });
});
