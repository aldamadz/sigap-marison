import { StrictMode } from "react";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { WorkEntryRow, type WorkEntryRowProps } from "@/features/work-calendar/components/WorkEntryRow";
import { createFixtureWorkEntry, WORK_CALENDAR_FIXTURE_TODAY } from "@/features/work-calendar/testing/work-calendar-fixtures";

beforeAll(() => {
  // jsdom lacks the browser APIs used by real Radix pointer interactions.
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId = 1;
    pointerType = "mouse";
    isPrimary = true;
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (value: string) => value });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

afterAll(() => vi.unstubAllGlobals());

function renderRow(overrides: Partial<WorkEntryRowProps> = {}) {
  const props: WorkEntryRowProps = {
    entry: createFixtureWorkEntry({ id: "title-menu", title: "Judul awal" }),
    today: WORK_CALENDAR_FIXTURE_TODAY,
    onUpdateTitle: vi.fn(),
    onRequestStatus: vi.fn(),
    onSubmitFollowUp: vi.fn(),
    onCancelFollowUp: vi.fn(),
    onOpenDetail: vi.fn(),
    onMoveToDate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<StrictMode><ul><WorkEntryRow {...props} /></ul></StrictMode>);
  return props;
}

const actionTrigger = () => screen.getByRole("button", { name: "Menu tindakan untuk Judul awal" });
const titleInput = () => screen.getByRole("textbox", { name: "Judul pekerjaan Judul awal" });

describe("work calendar title menu", () => {
  it("waits for the real Radix exit lifecycle before mounting and focusing the editor", async () => {
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudoElement) => {
      const styles = getComputedStyle(element, pseudoElement);
      if (element.getAttribute("role") !== "menu") return styles;
      // Model live computed animation styles; jsdom does not run CSS animations.
      return new Proxy(styles, {
        get(target, key) {
          if (key === "animationName") {
            return element.getAttribute("data-state") === "open" ? "menu-enter" : "menu-exit";
          }
          return Reflect.get(target, key);
        },
      });
    });
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
    const user = userEvent.setup();
    const props = renderRow();

    await user.click(actionTrigger());
    const menu = screen.getByRole("menu");
    await user.click(screen.getByRole("menuitem", { name: "Ubah judul" }));
    expect(menu).toHaveAttribute("data-state", "closed");
    expect(menu).toBeInTheDocument();
    await act(async () => {
      frames.splice(0).forEach((callback) => callback(0));
    });
    expect(screen.queryByRole("textbox", { hidden: true })).not.toBeInTheDocument();

    const animationEnd = createEvent.animationEnd(menu);
    Object.defineProperty(animationEnd, "animationName", { value: "menu-exit" });
    fireEvent(menu, animationEnd);

    await waitFor(() => expect(titleInput()).toHaveFocus());
    expect(menu).not.toBeInTheDocument();
    expect(props.onUpdateTitle).not.toHaveBeenCalled();
    await user.clear(titleInput());
    await user.type(titleInput(), "  Judul   baru  {Enter}");
    expect(props.onUpdateTitle).toHaveBeenCalledExactlyOnceWith("Judul baru");
    expect(props.onOpenDetail).not.toHaveBeenCalled();
  });

  it.each(["full", "compact"] as const)("supports pointer selection, stable focus and blur save in %s rows", async (variant) => {
    const user = userEvent.setup();
    const props = renderRow({ variant });
    await user.click(actionTrigger());
    await user.click(screen.getByRole("menuitem", { name: "Ubah judul" }));
    await waitFor(() => expect(titleInput()).toHaveFocus());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(props.onUpdateTitle).not.toHaveBeenCalled();
    await user.clear(titleInput());
    await user.type(titleInput(), "Judul pointer");
    expect(titleInput()).toHaveFocus();
    await user.tab();
    expect(props.onUpdateTitle).toHaveBeenCalledExactlyOnceWith("Judul pointer");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(props.onRequestStatus).not.toHaveBeenCalled();
  });

  it.each(["full", "compact"] as const)("supports keyboard selection, focus and Enter save in %s rows", async (variant) => {
    const user = userEvent.setup();
    const props = renderRow({ variant });
    await user.tab();
    await user.tab();
    await user.tab();
    expect(actionTrigger()).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Buka detail" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Ubah judul" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(titleInput()).toHaveFocus());
    expect(props.onUpdateTitle).not.toHaveBeenCalled();
    await user.clear(titleInput());
    await user.keyboard("Judul keyboard{Enter}");
    expect(props.onUpdateTitle).toHaveBeenCalledExactlyOnceWith("Judul keyboard");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(props.onOpenDetail).not.toHaveBeenCalled();
  });

  it("cancels edits with Escape and can reopen without a stale draft", async () => {
    const user = userEvent.setup();
    const props = renderRow();
    await user.click(actionTrigger());
    await user.click(screen.getByRole("menuitem", { name: "Ubah judul" }));
    await waitFor(() => expect(titleInput()).toHaveFocus());
    await user.clear(titleInput());
    await user.keyboard("Batal{Escape}");
    expect(props.onUpdateTitle).not.toHaveBeenCalled();
    await user.click(actionTrigger());
    await user.click(screen.getByRole("menuitem", { name: "Ubah judul" }));
    await waitFor(() => expect(titleInput()).toHaveFocus());
    expect(titleInput()).toHaveValue("Judul awal");
  });

  it.each(["", "   ", "Judul awal"])("does not save an empty or unchanged title: %j", async (value) => {
    const user = userEvent.setup();
    const props = renderRow();
    await user.click(actionTrigger());
    await user.click(screen.getByRole("menuitem", { name: "Ubah judul" }));
    await waitFor(() => expect(titleInput()).toHaveFocus());
    await user.clear(titleInput());
    await user.keyboard(`${value}{Enter}`);
    expect(props.onUpdateTitle).not.toHaveBeenCalled();
    expect(screen.getByTestId("work-entry-title-title-menu")).toHaveTextContent("Judul awal");
  });

  it("retains normal menu focus restoration and read-only restrictions", async () => {
    const user = userEvent.setup();
    const props = renderRow({ readOnly: true });
    await user.click(actionTrigger());
    expect(screen.queryByRole("menuitem", { name: "Ubah judul" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-entry-status-control-title-menu")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(actionTrigger()).toHaveFocus());
    await user.click(screen.getByTestId("work-entry-title-title-menu"));
    expect(props.onOpenDetail).toHaveBeenCalledOnce();
    expect(props.onUpdateTitle).not.toHaveBeenCalled();
  });

  it("preserves the status control and its selection behavior", async () => {
    const user = userEvent.setup();
    const props = renderRow();
    const status = screen.getByTestId("work-entry-status-control-title-menu");
    await user.click(status);
    await user.click(screen.getByRole("menuitemradio", { name: "Sedang Dikerjakan" }));
    expect(props.onRequestStatus).toHaveBeenCalledExactlyOnceWith("in_progress");
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each(["full", "compact"] as const)("aligns the leading icon with the title and spaces menu icons in %s rows", async (variant) => {
    const user = userEvent.setup();
    renderRow({ variant });
    const title = screen.getByTestId("work-entry-title-title-menu");
    const leadingIcon = title.parentElement?.previousElementSibling;
    expect(leadingIcon).toHaveClass("flex", "h-11", "items-center", "shrink-0");
    expect(leadingIcon?.className).not.toMatch(/mt-/);
    await user.click(actionTrigger());
    for (const name of ["Buka detail", "Ubah judul", "Pindahkan tanggal", "Hapus"]) {
      const item = screen.getByRole("menuitem", { name });
      expect(item).toHaveClass("gap-2");
      expect(item.querySelector("svg")).toHaveClass("h-4", "w-4", "shrink-0");
    }
  });
});
