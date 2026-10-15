import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkEntryResult } from "@/features/work-calendar/components/WorkEntryResult";
import { WorkEntryRow } from "@/features/work-calendar/components/WorkEntryRow";
import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import { WORK_CALENDAR_FIXTURE_CURRENT_USER, WORK_CALENDAR_FIXTURE_TODAY, createFixtureWorkEntry, createFixtureWorkEntryRepository, workCalendarFixtureNow } from "@/features/work-calendar/testing/work-calendar-fixtures";

const result = "1. Memperbaiki dashboard\n2. Menguji kalender\n\n- Hasil pertama\n  - Hasil lanjutan\nCatatan  dengan  spasi\nTerakhir";
const displayed = result.replace(/-/g, "\u2022");

describe("calendar result presentation", () => {
  it("preserves line breaks, blank lines, numbers, indentation and spaces; renders dash bullets", () => {
    const { container } = render(<WorkEntryResult value={result} />);
    const content = container.firstElementChild!;
    expect(content.textContent).toBe(displayed);
    expect(content).toHaveClass("whitespace-pre-wrap", "[overflow-wrap:anywhere]");
    expect(content).not.toHaveClass("line-clamp-3");
  });

  it("escapes markup and does not transform hyphens inside prose or negative values", () => {
    const value = '<script>alert("x")</script>\n<img src=x onerror=alert(1)>\nSenin-Jumat: -12\n---\n- Selesai';
    const { container } = render(<WorkEntryResult value={value} />);
    expect(container.querySelector("script,img")).toBeNull();
    expect(container.textContent).toBe(value.replace("- Selesai", "\u2022 Selesai"));
  });

  it.each(["full", "compact"] as const)("bounds %s row previews and opens existing detail without changing data", variant => {
    const entry = createFixtureWorkEntry({ id: "result", realization: result });
    const onOpenDetail = vi.fn();
    const onUpdateTitle = vi.fn();
    render(<WorkEntryRow entry={entry} today={WORK_CALENDAR_FIXTURE_TODAY} variant={variant} readOnly onOpenDetail={onOpenDetail} onUpdateTitle={onUpdateTitle} onRequestStatus={vi.fn()} onSubmitFollowUp={vi.fn()} onCancelFollowUp={vi.fn()} onMoveToDate={vi.fn()} onDelete={vi.fn()} />);
    const preview = screen.getByRole("button", { name: `Buka hasil pekerjaan: ${entry.title}` });
    expect(preview.querySelector(".line-clamp-3")?.textContent).toBe(displayed);
    fireEvent.click(preview);
    expect(onOpenDetail).toHaveBeenCalledOnce();
    expect(onUpdateTitle).not.toHaveBeenCalled();
    expect(entry.realization).toBe(result);
  });

  it.each(["hasil", "judul"])("opens an unclamped complete result from %s and preserves the editor's original value", async source => {
    const entry = createFixtureWorkEntry({ id: "result-detail", title: "Perbaikan format hasil", status: "in_progress", realization: result });
    render(<WorkCalendarWorkspace currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER} repository={createFixtureWorkEntryRepository([entry])} teamMembers={[]} initialView="day" initialAnchorDate={WORK_CALENDAR_FIXTURE_TODAY} now={workCalendarFixtureNow} />);
    fireEvent.click(await screen.findByRole("button", { name: source === "hasil" ? `Buka hasil pekerjaan: ${entry.title}` : `Buka detail pekerjaan: ${entry.title}` }));
    const dialog = within(await screen.findByRole("dialog"));
    const content = await dialog.findByText(displayed, { normalizer: text => text });
    expect(content).not.toHaveClass("line-clamp-3");
    expect(content.textContent).toBe(displayed);
    fireEvent.click(dialog.getByRole("button", { name: /ubah detail/i }));
    await waitFor(() => expect(dialog.getByLabelText("Hasil pekerjaan")).toHaveValue(result));
  });
});
