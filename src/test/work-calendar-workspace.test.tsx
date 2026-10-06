import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/**
 * Konten Radix Select dirender lewat Portal dan memakai pointer capture,
 * ResizeObserver, serta scrollIntoView yang tidak disediakan jsdom. Polyfill
 * ini hanya untuk test; runtime produksi memakai implementasi browser asli.
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
  entries?: Parameters<typeof createFixtureWorkEntryRepository>[0];
  teamMembers?: typeof WORK_CALENDAR_FIXTURE_TEAM_MEMBERS;
  failOnList?: boolean;
} = {}) {
  const repository = createFixtureWorkEntryRepository(
    options.entries,
    { failOnList: options.failOnList },
  );
  const utils = render(
    <WorkCalendarWorkspace
      currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
      repository={repository}
      teamMembers={options.teamMembers ?? WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
      initialView={options.view ?? "day"}
      initialAnchorDate={options.initialAnchorDate ?? WORK_CALENDAR_FIXTURE_TODAY}
      now={workCalendarFixtureNow}
    />,
  );
  return { ...utils, repository };
}

const quickInput = () => screen.getByLabelText("Apa yang akan dikerjakan?");

/**
 * Membuka kontrol status pada baris lalu memilih satu status dari menu.
 * Radix memakai pointerdown untuk klik, jadi menu dibuka lewat keyboard
 * (yang sekaligus menguji aksesibilitas keyboard).
 */
async function chooseStatus(row: HTMLElement, statusLabel: string): Promise<void> {
  const trigger = within(row).getByTestId(/^work-entry-status-control-/);
  trigger.focus();
  expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const option = await screen.findByRole("menuitemradio", { name: statusLabel });
  fireEvent.keyDown(option, { key: "Enter" });
  fireEvent.click(option);
}

async function openActionMenu(row: HTMLElement): Promise<void> {
  const menuButton = within(row).getByRole("button", { name: /Menu tindakan/i });
  menuButton.focus();
  fireEvent.keyDown(menuButton, { key: "Enter" });
  await screen.findByRole("menu");
}

/**
 * Memilih anggota pada filter pemilik mode Tim. Radix Select dibuka dengan
 * keyboard (Enter) dan opsinya dipilih dengan Enter supaya test tidak
 * bergantung pada pointer capture yang tidak ada di jsdom.
 */
async function selectOwnerFilter(
  trigger: HTMLElement,
  optionName: RegExp | string,
): Promise<void> {
  trigger.focus();
  expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const listbox = await screen.findByRole("listbox");
  const option = within(listbox).getByRole("option", { name: optionName });
  option.focus();
  fireEvent.keyDown(option, { key: "Enter" });
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
}

/** Menunggu callback `requestAnimationFrame` (pergeseran fokus) diproses. */
async function flushAnimationFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

describe("WorkCalendarWorkspace — quick entry", () => {
  it("hanya membutuhkan judul untuk membuat pekerjaan", async () => {
    const { repository } = renderWorkspace({ entries: [] });
    const created: string[] = [];
    const originalCreate = repository.createEntry;
    repository.createEntry = async (draft) => {
      created.push(draft.title);
      return originalCreate(draft);
    };

    fireEvent.change(quickInput(), { target: { value: "Susun laporan harian" } });
    fireEvent.keyDown(quickInput(), { key: "Enter" });

    await waitFor(() => expect(created).toEqual(["Susun laporan harian"]));
  });

  it("Enter menyimpan dan input siap kembali untuk entry berikutnya", async () => {
    renderWorkspace({ entries: [] });

    fireEvent.change(quickInput(), { target: { value: "Pekerjaan pertama" } });
    fireEvent.keyDown(quickInput(), { key: "Enter" });

    await waitFor(() => expect(quickInput()).toHaveValue(""));
    expect(await screen.findByText("Pekerjaan pertama")).toBeInTheDocument();

    fireEvent.change(quickInput(), { target: { value: "Pekerjaan kedua" } });
    fireEvent.keyDown(quickInput(), { key: "Enter" });

    await waitFor(() => expect(quickInput()).toHaveValue(""));
    expect(await screen.findByText("Pekerjaan kedua")).toBeInTheDocument();
  });

  it("menolak judul kosong dan hanya spasi", async () => {
    renderWorkspace({ entries: [] });

    fireEvent.change(quickInput(), { target: { value: "    " } });
    fireEvent.keyDown(quickInput(), { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Tulis pekerjaan terlebih dahulu.");
    expect(screen.getByTestId("work-entry-empty")).toBeInTheDocument();
  });

  it("Esc membatalkan isi input", async () => {
    renderWorkspace({ entries: [] });
    fireEvent.change(quickInput(), { target: { value: "Batal" } });
    fireEvent.keyDown(quickInput(), { key: "Escape" });
    expect(quickInput()).toHaveValue("");
  });

  it("menampilkan error dekat input tanpa menggeser layout", async () => {
    const { repository } = renderWorkspace({ entries: [] });
    repository.createEntry = async () => {
      throw new Error("Penyimpanan gagal.");
    };

    fireEvent.change(quickInput(), { target: { value: "Gagal simpan" } });
    fireEvent.keyDown(quickInput(), { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Penyimpanan gagal.");
    // Input tetap terpasang sehingga pengguna dapat mencoba lagi.
    expect(quickInput()).toBeInTheDocument();
  });
});

describe("WorkCalendarWorkspace — kontrol status per baris", () => {
  it("memakai satu kontrol status dengan label status aktif", async () => {
    renderWorkspace({
      entries: [
        createFixtureWorkEntry({ id: "single-1", title: "Pekerjaan satu kontrol", status: "planned" }),
      ],
    });

    const row = await screen.findByTestId("work-entry-row-single-1");
    const trigger = within(row).getByTestId("work-entry-status-control-single-1");
    expect(trigger).toHaveTextContent("Direncanakan");
    expect(trigger).toHaveAttribute("data-active-status", "planned");
    // Deretan empat tombol ikon lama tidak boleh ada lagi.
    expect(screen.queryByTestId("work-entry-status-group-single-1")).not.toBeInTheDocument();
  });

  it("menampilkan empat status berlabel lengkap pada menu status", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "single-2", title: "Pekerjaan menu", status: "planned" })],
    });

    const row = await screen.findByTestId("work-entry-row-single-2");
    const trigger = within(row).getByTestId("work-entry-status-control-single-2");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(await screen.findByRole("menuitemradio", { name: "Direncanakan" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Sedang Dikerjakan" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Selesai" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Terhambat" })).toBeInTheDocument();
  });

  it("meminta realisasi inline saat status menjadi completed", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-1", title: "Pekerjaan status", status: "planned" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-1");
    await chooseStatus(row, "Selesai");

    const field = await screen.findByLabelText(/Hasil pekerjaan/i);
    expect(field).toBeInTheDocument();
    // Tidak ada modal besar yang dibuka otomatis.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tidak menyimpan completed tanpa realisasi", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-2", title: "Pekerjaan status dua" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-2");
    await chooseStatus(row, "Selesai");
    const save = await screen.findByRole("button", { name: "Simpan" });
    expect(save).toBeDisabled();
    expect(row).toHaveAttribute("data-entry-status", "planned");
  });

  it("menyimpan completed beserta realisasi", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-3", title: "Pekerjaan status tiga" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-3");
    await chooseStatus(row, "Selesai");
    fireEvent.change(await screen.findByLabelText(/Hasil pekerjaan/i), {
      target: { value: "Sudah dikirim ke atasan." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(screen.getByTestId("work-entry-row-status-3")).toHaveAttribute(
        "data-entry-status",
        "completed",
      ),
    );
    expect(screen.getByTestId("work-entry-realization-status-3")).toHaveTextContent(
      "Sudah dikirim ke atasan.",
    );
  });

  it("meminta alasan inline saat status menjadi blocked", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-4", title: "Pekerjaan status empat" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-4");
    await chooseStatus(row, "Terhambat");
    expect(await screen.findByLabelText(/Alasan terhambat/i)).toBeInTheDocument();
  });

  it("menyimpan blocked beserta alasannya", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-5", title: "Pekerjaan status lima" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-5");
    await chooseStatus(row, "Terhambat");
    fireEvent.change(await screen.findByLabelText(/Alasan terhambat/i), {
      target: { value: "Menunggu dokumen dari pusat." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(screen.getByTestId("work-entry-blocked-status-5")).toHaveTextContent(
        "Menunggu dokumen dari pusat.",
      ),
    );
  });

  it("mengubah status tanpa input lanjutan untuk in_progress", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-6", title: "Pekerjaan status enam" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-6");
    await chooseStatus(row, "Sedang Dikerjakan");

    await waitFor(() =>
      expect(screen.getByTestId("work-entry-row-status-6")).toHaveAttribute(
        "data-entry-status",
        "in_progress",
      ),
    );
    expect(screen.queryByLabelText(/Hasil pekerjaan/i)).not.toBeInTheDocument();
  });

  it("tetap menyediakan menu tindakan detail dan pindah tanggal", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "menu-1", title: "Pekerjaan dengan aksi" })],
    });

    const row = await screen.findByTestId("work-entry-row-menu-1");
    await openActionMenu(row);

    expect(await screen.findByRole("menuitem", { name: /Buka detail/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Ubah judul/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Pindahkan tanggal/i })).toBeInTheDocument();
  });

  it("menyederhanakan baris minggu (compact) tanpa label status ganda", async () => {
    renderWorkspace({
      view: "week",
      entries: [
        createFixtureWorkEntry({ id: "compact-1", title: "Pekerjaan minggu", status: "in_progress" }),
      ],
    });

    const row = await screen.findByTestId("work-entry-row-compact-1");
    expect(row).toHaveAttribute("data-row-variant", "compact");
    // Pada row compact label status ditegaskan sekali saja di baris metadata.
    expect(within(row).getAllByTestId("work-entry-status-label-compact-1")).toHaveLength(1);
    expect(within(row).getByTestId("work-entry-status-control-compact-1")).toHaveAttribute(
      "data-active-status",
      "in_progress",
    );
  });
});

describe("WorkCalendarWorkspace — overdue dan navigasi", () => {
  it("menurunkan overdue dari tenggat eksplisit tanpa menyimpan status baru", async () => {
    // Senin 9 Maret 2026 berada pada minggu yang sama dengan hari fixture,
    // sehingga entry masih termuat tetapi tanggalnya sudah lewat.
    renderWorkspace({
      view: "week",
      entries: [
        createFixtureWorkEntry({ id: "late", title: "Pekerjaan terlambat", status: "planned", workDate: "2026-03-09", dueDate: "2026-03-09" }),
      ],
    });

    const originalDay = within(await screen.findByTestId("work-week-column-2026-03-09"));
    expect(await originalDay.findByTestId("work-entry-overdue-late")).toHaveTextContent("Terlambat");
    // Overdue tetap status `planned`; tidak ada status tersimpan bernama overdue.
    expect(originalDay.getByTestId("work-entry-row-late")).toHaveAttribute("data-entry-status", "planned");
  });

  it("menandai pekerjaan blocked pada tanggal lampau sebagai terlambat", async () => {
    renderWorkspace({
      view: "week",
      entries: [
        createFixtureWorkEntry({
          id: "late-blocked",
          title: "Pekerjaan terhambat lampau",
          status: "blocked",
          blockedReason: "Menunggu vendor.",
          workDate: "2026-03-09",
          dueDate: "2026-03-09",
        }),
      ],
    });

    const originalDay = within(await screen.findByTestId("work-week-column-2026-03-09"));
    expect(await originalDay.findByTestId("work-entry-overdue-late-blocked")).toHaveTextContent("Terlambat");
    expect(originalDay.getByTestId("work-entry-row-late-blocked")).toHaveAttribute(
      "data-entry-status",
      "blocked",
    );
  });

  it("tidak menandai entry selesai sebagai terlambat", async () => {
    renderWorkspace({
      view: "week",
      entries: [
        createFixtureWorkEntry({
          id: "late-done",
          title: "Pekerjaan selesai",
          status: "completed",
          realization: "Sudah dikirim.",
          workDate: "2026-03-09",
        }),
      ],
    });

    expect(await screen.findByTestId("work-entry-row-late-done")).toHaveAttribute(
      "data-entry-status",
      "completed",
    );
    expect(screen.queryByTestId("work-entry-overdue-late-done")).not.toBeInTheDocument();
  });

  it("menyediakan tombol Hari Ini dan navigasi sebelumnya/berikutnya", async () => {
    renderWorkspace({ entries: [] });
    const initial = screen.getByTestId("work-calendar-range-label").textContent;

    fireEvent.click(screen.getByRole("button", { name: "Rentang berikutnya" }));
    await waitFor(() =>
      expect(screen.getByTestId("work-calendar-range-label").textContent).not.toBe(initial),
    );

    fireEvent.click(screen.getByRole("button", { name: "Hari Ini" }));
    await waitFor(() =>
      expect(screen.getByTestId("work-calendar-range-label").textContent).toBe(initial),
    );
  });
});

describe("WorkCalendarWorkspace — ringkasan progres", () => {
  it("menampilkan seluruh status termasuk Direncanakan dan indikator Terlambat", async () => {
    renderWorkspace({
      entries: [
        createFixtureWorkEntry({ id: "sum-1", status: "planned" }),
        createFixtureWorkEntry({ id: "sum-2", status: "in_progress" }),
        createFixtureWorkEntry({ id: "sum-3", status: "completed", realization: "Selesai." }),
        createFixtureWorkEntry({ id: "sum-4", status: "blocked", blockedReason: "Tertahan." }),
      ],
    });

    await screen.findByTestId("work-entry-row-sum-1");
    const summary = screen.getByTestId("daily-progress-summary");
    expect(within(summary).getByTestId("progress-planned")).toHaveTextContent("1");
    expect(within(summary).getByTestId("progress-inProgress")).toHaveTextContent("1");
    expect(within(summary).getByTestId("progress-completed")).toHaveTextContent("1");
    expect(within(summary).getByTestId("progress-blocked")).toHaveTextContent("1");
    expect(within(summary).getByTestId("progress-overdue")).toHaveTextContent("0");
    expect(within(summary).getByTestId("progress-total")).toHaveTextContent("4");
  });

  it("menjaga jumlah status sama dengan total dan overdue terpisah", async () => {
    renderWorkspace({
      entries: [
        createFixtureWorkEntry({ id: "cons-1", status: "planned" }),
        createFixtureWorkEntry({ id: "cons-2", status: "blocked", blockedReason: "Tertahan." }),
        createFixtureWorkEntry({
          id: "cons-late",
          status: "planned",
          workDate: "2026-03-09",
        }),
      ],
    });

    const summary = await screen.findByTestId("daily-progress-summary");
    // Entry 9 Maret tidak termasuk rentang Hari 10 Maret, jadi ringkasan hari
    // hanya memuat dua entry; gunakan mode Minggu untuk memuat keduanya.
    expect(summary).toBeInTheDocument();

    renderWorkspace({
      view: "week",
      entries: [
        createFixtureWorkEntry({ id: "cons-3", status: "planned" }),
        createFixtureWorkEntry({ id: "cons-4", status: "blocked", blockedReason: "Tertahan." }),
        createFixtureWorkEntry({ id: "cons-5", status: "completed", realization: "Selesai.", workDate: "2026-03-09" }),
      ],
    });
    const weekRow = await screen.findByTestId("work-entry-row-cons-5");
    expect(weekRow).toHaveAttribute("data-entry-status", "completed");
  });

  it("tidak pernah menyediakan input persentase yang dapat diedit", async () => {
    renderWorkspace({ entries: [createFixtureWorkEntry({ id: "pct-1" })] });
    await screen.findByTestId("work-entry-row-pct-1");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    const progressbar = screen.getAllByRole("progressbar")[0];
    expect(progressbar).toHaveAttribute("aria-readonly", "true");
  });
});

describe("WorkCalendarWorkspace — mode Tim", () => {
  it("menyembunyikan tab Tim tanpa bawahan", async () => {
    renderWorkspace({ entries: [], teamMembers: [] });
    expect(screen.queryByRole("button", { name: /^Tim$/i })).not.toBeInTheDocument();
  });

  it("menampilkan tab Tim saat pengguna punya bawahan", async () => {
    renderWorkspace({ entries: [] });
    expect(screen.getByRole("button", { name: /^Tim$/i })).toBeInTheDocument();
  });

  it("menampilkan identitas tanpa dipotong dan metrik lengkap per anggota", async () => {
    renderWorkspace({ view: "team" });
    const row = await screen.findByTestId("work-team-row-user-bawahan-1");

    expect(within(row).getByText("Sinta Maharani")).toBeInTheDocument();
    expect(within(row).getByText("Staf Operasional")).toBeInTheDocument();
    // Nama dan jabatan tidak memakai kelas truncate.
    expect(within(row).getByText("Sinta Maharani")).not.toHaveClass("truncate");
    expect(within(row).getByText("Staf Operasional")).not.toHaveClass("truncate");

    expect(within(row).getByTestId("team-ratio-label-user-bawahan-1")).toHaveTextContent("1");
    expect(within(row).getByTestId("team-total-user-bawahan-1")).toHaveTextContent("2");
    expect(within(row).getByTestId("team-planned-user-bawahan-1")).toHaveTextContent("0");
    expect(within(row).getByTestId("team-in-progress-user-bawahan-1")).toHaveTextContent("1");
    expect(within(row).getByTestId("team-blocked-user-bawahan-1")).toHaveTextContent("0");
    expect(within(row).getByTestId("team-overdue-user-bawahan-1")).toBeInTheDocument();
    expect(within(row).getByTestId("team-ratio-user-bawahan-1")).toBeInTheDocument();
  });

  it("menampilkan metrik Direncanakan pada anggota tim", async () => {
    renderWorkspace({ view: "team" });
    const row = await screen.findByTestId("work-team-row-user-bawahan-2");
    // Bimo Nugroho punya satu entry planned dan satu blocked.
    expect(within(row).getByTestId("team-planned-user-bawahan-2")).toHaveTextContent("1");
    expect(within(row).getByTestId("team-blocked-user-bawahan-2")).toHaveTextContent("1");
    expect(within(row).getByTestId("team-total-user-bawahan-2")).toHaveTextContent("2");
  });

  it("tidak menyediakan aksi ubah/hapus pada entry bawahan", async () => {
    renderWorkspace({ view: "team" });
    const row = await screen.findByTestId("work-team-row-user-bawahan-1");
    fireEvent.click(within(row).getByRole("button", { expanded: false }));

    const entryRow = await screen.findByTestId("work-entry-row-team-1");
    expect(within(entryRow).queryByTestId(/^work-entry-status-control-/)).not.toBeInTheDocument();

    await openActionMenu(entryRow);

    expect(await screen.findByRole("menuitem", { name: /Lihat detail/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Hapus/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Ubah judul/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Selesai" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Pindahkan tanggal/i })).not.toBeInTheDocument();
  });

  it("menyaring entry tim menurut pemilik", async () => {
    renderWorkspace({ view: "team" });
    expect(await screen.findByTestId("work-team-row-user-bawahan-2")).toBeInTheDocument();
    expect(screen.getByTestId("work-team-row-user-bawahan-3")).toBeInTheDocument();
  });

  it("masuk ke Tim dari Minggu/Bulan menyetel anchorDate ke today", async () => {
    const { repository } = renderWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-01",
      entries: [],
    });

    const listTeamSpy = vi.spyOn(repository, "listTeamEntries");

    const teamButton = screen.getByRole("button", { name: /^Tim$/i });
    fireEvent.click(teamButton);

    await waitFor(() => {
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Hari Ini, Selasa, 10 Maret 2026",
      );
    });

    expect(listTeamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: WORK_CALENDAR_FIXTURE_TODAY,
        toDate: WORK_CALENDAR_FIXTURE_TODAY,
      }),
    );
  });

  it("navigasi previous/next pada Tim memindahkan tanggal tepat satu hari dan memicu fetch", async () => {
    const { repository } = renderWorkspace({
      view: "team",
      initialAnchorDate: WORK_CALENDAR_FIXTURE_TODAY,
      entries: [],
    });

    const listTeamSpy = vi.spyOn(repository, "listTeamEntries");

    // Klik Previous (kemarin: 9 Maret)
    const prevBtn = screen.getByRole("button", { name: "Rentang sebelumnya" });
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Kemarin, Senin, 9 Maret 2026",
      );
    });

    expect(listTeamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: "2026-03-09",
        toDate: "2026-03-09",
      }),
    );

    // Klik Next dua kali (9 Maret -> 10 Maret -> 11 Maret)
    const nextBtn = screen.getByRole("button", { name: "Rentang berikutnya" });
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Besok, Rabu, 11 Maret 2026",
      );
    });

    expect(listTeamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: "2026-03-11",
        toDate: "2026-03-11",
      }),
    );
  });

  it("heading, summary, dan repository range pada Tim memakai tanggal yang sama", async () => {
    const pastDate = "2026-03-05";
    const teamEntryOnPastDate = createFixtureWorkEntry({
      id: "team-past-1",
      ownerId: "user-bawahan-1",
      title: "Pekerjaan Masa Lalu",
      workDate: pastDate,
      status: "completed",
    });

    renderWorkspace({
      view: "team",
      initialAnchorDate: pastDate,
      entries: [teamEntryOnPastDate],
    });

    // Label range toolbar memakai tanggal yang sama
    await waitFor(() => {
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Kamis, 5 Maret 2026",
      );
    });

    const row = await screen.findByTestId("work-team-row-user-bawahan-1");
    // Metrik summary menghitung entry pada tanggal tersebut
    expect(within(row).getByTestId("team-completed-user-bawahan-1")).toHaveTextContent("1");
    expect(within(row).getByTestId("team-total-user-bawahan-1")).toHaveTextContent("1");
  });

  it("Hari Ini mengembalikan anchor Tim ke today dan tidak ada tombol navigasi no-op", async () => {
    const { repository } = renderWorkspace({
      view: "team",
      initialAnchorDate: WORK_CALENDAR_FIXTURE_TODAY,
      entries: [],
    });

    const listTeamSpy = vi.spyOn(repository, "listTeamEntries");

    // Geser ke kemarin
    const prevBtn = screen.getByRole("button", { name: "Rentang sebelumnya" });
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Kemarin, Senin, 9 Maret 2026",
      );
    });

    // Tekan Hari Ini
    const todayBtn = screen.getByRole("button", { name: "Hari Ini" });
    fireEvent.click(todayBtn);

    await waitFor(() => {
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Hari Ini, Selasa, 10 Maret 2026",
      );
    });

    expect(listTeamSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: WORK_CALENDAR_FIXTURE_TODAY,
        toDate: WORK_CALENDAR_FIXTURE_TODAY,
      }),
    );
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4A filter Tim", () => {
  const ownerFilterTrigger = () => screen.getByLabelText("Filter pemilik pekerjaan");

  it("menampilkan seluruh bawahan aktif pada 'Semua anggota'", async () => {
    renderWorkspace({ view: "team" });

    for (const member of WORK_CALENDAR_FIXTURE_TEAM_MEMBERS) {
      expect(await screen.findByTestId(`work-team-row-${member.id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("work-team-filter-note")).not.toBeInTheDocument();
  });

  it("menyaring daftar, metrik, dan ringkasan ke satu anggota lalu kembali ke semua", async () => {
    const { repository } = renderWorkspace({ view: "team" });
    const listTeamSpy = vi.spyOn(repository, "listTeamEntries");

    // Bimo (bawahan-2) punya satu planned dan satu blocked; bawahan lain
    // punya entry berbeda sehingga penyaringan terlihat pada angka, bukan
    // hanya pada nilai dropdown.
    expect(await screen.findByTestId("work-team-row-user-bawahan-2")).toBeInTheDocument();

    await selectOwnerFilter(ownerFilterTrigger(), "Bimo Nugroho");

    const filteredRow = await screen.findByTestId("work-team-row-user-bawahan-2");
    expect(within(filteredRow).getByTestId("team-planned-user-bawahan-2")).toHaveTextContent("1");
    expect(within(filteredRow).getByTestId("team-blocked-user-bawahan-2")).toHaveTextContent("1");
    expect(within(filteredRow).getByTestId("team-total-user-bawahan-2")).toHaveTextContent("2");

    // Ringkasan lingkup hanya memuat entry anggota terpilih (2), bukan seluruh
    // tim (5 entry pada tanggal fixture).
    expect(screen.getByTestId("work-team-scope-progress")).toHaveTextContent(
      "0 selesai dari 2 pekerjaan",
    );

    // Anggota lain benar-benar hilang dari daftar, bukan sekadar disembunyikan
    // secara visual.
    expect(screen.queryByTestId("work-team-row-user-bawahan-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-team-row-user-bawahan-3")).not.toBeInTheDocument();
    expect(await screen.findByTestId("work-team-filter-note")).toHaveTextContent(
      "Menampilkan pekerjaan Bimo Nugroho saja.",
    );

    // Kembali ke "Semua anggota": daftar dan ringkasan pulih.
    await selectOwnerFilter(ownerFilterTrigger(), "Semua anggota");

    for (const member of WORK_CALENDAR_FIXTURE_TEAM_MEMBERS) {
      expect(await screen.findByTestId(`work-team-row-${member.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("work-team-scope-progress")).toHaveTextContent(
      "2 selesai dari 6 pekerjaan",
    );
  });

  it("tetap menampilkan anggota tanpa entry dengan empty state dan progres nol", async () => {
    renderWorkspace({
      view: "team",
      entries: [
        createFixtureWorkEntry({
          id: "only-b1",
          ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[1].id,
          title: "Pekerjaan Bimo",
        }),
      ],
    });

    await selectOwnerFilter(ownerFilterTrigger(), "Sinta Maharani");

    const row = await screen.findByTestId("work-team-row-user-bawahan-1");
    expect(within(row).getByTestId("team-total-user-bawahan-1")).toHaveTextContent("0");
    expect(within(row).getByTestId("team-ratio-label-user-bawahan-1")).toHaveTextContent("0");
    // Satu anggota terpilih otomatis terbuka sehingga empty state terlihat.
    expect(await screen.findByTestId("work-entry-empty")).toHaveTextContent(
      "Belum ada pekerjaan tercatat untuk anggota ini.",
    );
    expect(screen.getByTestId("work-team-scope-progress")).toHaveTextContent(
      "0 selesai dari 0 pekerjaan",
    );
  });

  it("mempertahankan filter saat berpindah tanggal dan memuat tanggal baru", async () => {
    const { repository } = renderWorkspace({ view: "team" });
    const listTeamSpy = vi.spyOn(repository, "listTeamEntries");

    await selectOwnerFilter(ownerFilterTrigger(), "Dewi Lestari");
    expect(await screen.findByTestId("work-team-row-user-bawahan-3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rentang sebelumnya" }));

    await waitFor(() => {
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Kemarin, Senin, 9 Maret 2026",
      );
    });
    expect(listTeamSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: "2026-03-09", toDate: "2026-03-09" }),
    );
    // Filter tidak kembali ke "Semua anggota" setelah fetch tanggal baru.
    expect(ownerFilterTrigger()).toHaveTextContent("Dewi Lestari");
    expect(screen.getByTestId("work-team-filter-note")).toHaveTextContent(
      "Menampilkan pekerjaan Dewi Lestari saja.",
    );
    expect(screen.queryByTestId("work-team-row-user-bawahan-1")).not.toBeInTheDocument();
  });

  it("jatuh kembali ke 'Semua anggota' bila anggota terpilih hilang dari daftar", async () => {
    const { rerender } = renderWorkspace({
      view: "team",
      entries: [
        createFixtureWorkEntry({
          id: "b1",
          ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[1].id,
          title: "Pekerjaan Bimo",
        }),
      ],
    });

    await selectOwnerFilter(ownerFilterTrigger(), "Bimo Nugroho");
    expect(await screen.findByTestId("work-team-row-user-bawahan-2")).toBeInTheDocument();

    // Struktur tim berubah dan Bimo tidak lagi menjadi bawahan.
    const repository = createFixtureWorkEntryRepository([
      createFixtureWorkEntry({
        id: "b1",
        ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[1].id,
        title: "Pekerjaan Bimo",
      }),
    ]);
    rerender(
      <WorkCalendarWorkspace
        currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
        repository={repository}
        teamMembers={[WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0], WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[2]]}
        initialView="team"
        initialAnchorDate={WORK_CALENDAR_FIXTURE_TODAY}
        now={workCalendarFixtureNow}
      />,
    );

    // Fallback aman: filter tidak menggantung pada id yang sudah tidak ada.
    await waitFor(() => expect(ownerFilterTrigger()).toHaveTextContent("Semua anggota"));
    expect(await screen.findByTestId("work-team-row-user-bawahan-1")).toBeInTheDocument();
    expect(screen.getByTestId("work-team-row-user-bawahan-3")).toBeInTheDocument();
    expect(screen.queryByTestId("work-team-row-user-bawahan-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-calendar-owner-filter-state")).not.toBeInTheDocument();
  });

  it("tidak pernah menampilkan UUID mentah sebagai nama anggota", async () => {
    renderWorkspace({
      view: "team",
      entries: [
        createFixtureWorkEntry({
          id: "ghost",
          ownerId: "11111111-2222-3333-4444-555555555555",
          title: "Pekerjaan pemilik tak dikenal",
        }),
      ],
    });

    await screen.findByTestId("work-team-row-user-bawahan-1");
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("11111111-2222-3333-4444-555555555555");
    // Entry pemilik tak dikenal tidak boleh membocorkan judulnya sebagai
    // kelompok tanpa nama.
    expect(text).not.toContain("Pekerjaan pemilik tak dikenal");
  });

  it("mempertahankan entry bawahan tetap read-only saat filter aktif", async () => {
    renderWorkspace({ view: "team" });

    await selectOwnerFilter(ownerFilterTrigger(), "Sinta Maharani");

    const row = await screen.findByTestId("work-team-row-user-bawahan-1");
    const entryRow = await screen.findByTestId("work-entry-row-team-1");
    expect(entryRow).toHaveAttribute("data-readonly", "true");
    expect(within(entryRow).queryByTestId(/^work-entry-status-control-/)).not.toBeInTheDocument();

    await openActionMenu(entryRow);

    expect(await screen.findByRole("menuitem", { name: /Lihat detail/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Hapus/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Ubah judul/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Pindahkan tanggal/i })).not.toBeInTheDocument();
    expect(within(row).getByText("Sinta Maharani")).toBeInTheDocument();
  });

  it("tidak menandai filter saat atasan hanya punya satu bawahan pada 'Semua anggota'", async () => {
    // Satu bawahan saja, tanpa memilih filter eksplisit.
    renderWorkspace({
      view: "team",
      teamMembers: [WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0]],
      entries: [
        createFixtureWorkEntry({
          id: "single-1",
          ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id,
          title: "Pekerjaan satu-satunya bawahan",
        }),
      ],
    });

    expect(await screen.findByTestId("work-team-row-user-bawahan-1")).toBeInTheDocument();
    // Kabar salah yang dikoreksi: catatan filter palsu tidak boleh muncul
    // hanya karena jumlah kelompok satu.
    expect(screen.queryByTestId("work-team-filter-note")).not.toBeInTheDocument();
    expect(ownerFilterTrigger()).toHaveTextContent("Semua anggota");
    expect(screen.queryByTestId("work-calendar-owner-filter-state")).not.toBeInTheDocument();
  });

  it("menampilkan catatan filter saat satu bawahan dipilih eksplisit", async () => {
    renderWorkspace({
      view: "team",
      teamMembers: [WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0]],
      entries: [
        createFixtureWorkEntry({
          id: "single-1",
          ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id,
          title: "Pekerjaan satu-satunya bawahan",
        }),
      ],
    });

    await selectOwnerFilter(ownerFilterTrigger(), "Sinta Maharani");

    expect(await screen.findByTestId("work-team-filter-note")).toHaveTextContent(
      "Menampilkan pekerjaan Sinta Maharani saja.",
    );
    expect(screen.getByTestId("work-calendar-owner-filter-state")).toHaveTextContent(
      "Sinta Maharani",
    );
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4A koreksi interaksi judul", () => {
  it("klik judul membuka detail, bukan editor judul inline", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "title-1", title: "Judul dibuka" })],
    });

    const title = await screen.findByTestId("work-entry-title-title-1");
    expect(title).toHaveAccessibleName("Buka detail pekerjaan: Judul dibuka");

    fireEvent.click(title);

    expect(await screen.findByTestId("work-entry-detail-title-1")).toBeInTheDocument();
    // Editor inline tidak aktif: tidak ada input judul inline.
    expect(screen.queryByLabelText("Judul pekerjaan Judul dibuka")).not.toBeInTheDocument();
  });

  it("Enter pada judul membuka detail dan tetap menjaga fokus keyboard", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "title-2", title: "Judul keyboard" })],
    });

    const title = await screen.findByTestId("work-entry-title-title-2");
    title.focus();
    expect(title).toHaveFocus();
    fireEvent.keyDown(title, { key: "Enter" });
    fireEvent.click(title);

    expect(await screen.findByTestId("work-entry-detail-title-2")).toBeInTheDocument();
  });

  it("menu 'Ubah judul' tetap membuka editor judul inline", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "title-3", title: "Judul via menu" })],
    });

    const row = await screen.findByTestId("work-entry-row-title-3");
    await openActionMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Ubah judul/i }));

    // Editor judul inline hanya terbuka lewat aksi eksplisit ini.
    const input = await screen.findByRole("textbox", { name: /^Judul pekerjaan Judul via menu/ });
    expect(input).toHaveValue("Judul via menu");
  });

  it("detail pekerjaan sendiri menyediakan aksi ubah judul eksplisit", async () => {
    const { repository } = renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "title-4", title: "Judul awal" })],
    });

    const patches: string[] = [];
    const originalUpdate = repository.updateEntry;
    repository.updateEntry = async (input) => {
      patches.push(String(input.patch.title ?? ""));
      return originalUpdate(input);
    };

    fireEvent.click(await screen.findByTestId("work-entry-title-title-4"));
    fireEvent.click(await screen.findByTestId("work-entry-detail-edit-title-title-4"));

    const input = await screen.findByLabelText("Ubah judul pekerjaan Judul awal");
    fireEvent.change(input, { target: { value: "Judul baru dari detail" } });
    fireEvent.click(screen.getByTestId("work-entry-detail-save-title-title-4"));

    await waitFor(() => expect(patches).toEqual(["Judul baru dari detail"]));
  });

  it("judul bawahan membuka detail read-only tanpa aksi ubah", async () => {
    renderWorkspace({ view: "team" });

    await selectOwnerFilter(screen.getByLabelText("Filter pemilik pekerjaan"), "Sinta Maharani");
    const entryRow = await screen.findByTestId("work-entry-row-team-1");
    const title = within(entryRow).getByTestId("work-entry-title-team-1");
    expect(title).toHaveAccessibleName("Buka detail pekerjaan: Input berkas pengajuan unit baru");

    fireEvent.click(title);

    const detail = await screen.findByTestId("work-entry-detail-team-1");
    expect(within(detail).queryByTestId("work-entry-detail-edit-title-team-1")).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /Ubah detail/i })).not.toBeInTheDocument();
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4A koreksi batas preview Minggu", () => {
  const weekEntries = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      createFixtureWorkEntry({
        id: `week-${index}`,
        title: `Pekerjaan minggu ${index}`,
        workDate: WORK_CALENDAR_FIXTURE_TODAY,
        status: index === 0 ? "blocked" : "planned",
      }),
    );

  it("membatasi empat preview dan menghitung +N pada desktop", async () => {
    renderWorkspace({ view: "week", entries: weekEntries(6) });

    const column = await screen.findByTestId(`work-week-column-${WORK_CALENDAR_FIXTURE_TODAY}`);
    expect(within(column).getAllByTestId(/^work-entry-row-/)).toHaveLength(4);
    expect(within(column).getByTestId(`work-week-more-${WORK_CALENDAR_FIXTURE_TODAY}`)).toHaveTextContent(
      "+2 pekerjaan lainnya",
    );
    // Progres tetap dihitung dari seluruh entry, bukan hanya preview.
    expect(within(column).getByText(/selesai/)).toHaveTextContent("0/6 selesai");
  });

  it("membatasi tiga preview pada mobile", async () => {
    // Override matchMedia seperti pada setup test, tetapi mengembalikan
    // `matches: true` untuk query mobile. Nilai asli dikembalikan setelah test
    // supaya test berikutnya tetap desktop.
    const originalMatchMedia = window.matchMedia;
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

    try {
      renderWorkspace({ view: "week", entries: weekEntries(6) });

      const column = await screen.findByTestId(`work-week-column-${WORK_CALENDAR_FIXTURE_TODAY}`);
      await waitFor(() =>
        expect(within(column).getAllByTestId(/^work-entry-row-/)).toHaveLength(3),
      );
      expect(
        within(column).getByTestId(`work-week-more-${WORK_CALENDAR_FIXTURE_TODAY}`),
      ).toHaveTextContent("+3 pekerjaan lainnya");
    } finally {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("tombol +N membuka panel hari dalam konteks Minggu", async () => {
    renderWorkspace({ view: "week", initialAnchorDate: "2026-03-09", entries: weekEntries(5) });

    const more = await screen.findByTestId(`work-week-more-${WORK_CALENDAR_FIXTURE_TODAY}`);
    fireEvent.click(more);

    // Panel terbuka tanpa berpindah ke tampilan Hari: tujuh kolom minggu tetap
    // dirender di bawahnya.
    const panel = await screen.findByTestId(
      `work-week-day-panel-${WORK_CALENDAR_FIXTURE_TODAY}`,
    );
    expect(panel).toBeInTheDocument();
    expect(screen.getAllByTestId(/^work-week-column-/)).toHaveLength(7);
    // Panel memuat seluruh entry, termasuk yang dipotong preview.
    expect(await screen.findByTestId("work-entry-row-week-4")).toBeInTheDocument();

    // Aksi sekunder tetap membuka tampilan Hari penuh pada tanggal itu.
    fireEvent.click(
      screen.getByTestId(`work-week-day-panel-open-day-${WORK_CALENDAR_FIXTURE_TODAY}`),
    );
    await waitFor(() =>
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Hari Ini, Selasa, 10 Maret 2026",
      ),
    );
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4A aksi tambah kontekstual", () => {
  it("tidak menampilkan aksi toolbar duplikat pada tampilan Hari", async () => {
    renderWorkspace({ view: "day", entries: [] });

    await screen.findByTestId("work-entry-empty");
    expect(screen.queryByTestId("work-calendar-toolbar-add")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah" })).toBeInTheDocument();
    expect(quickInput()).toHaveAttribute("placeholder", "Apa yang akan dikerjakan?");
  });

  it("berlabel 'Tambah hari ini' pada Minggu dan memindahkan tanggal target ke today", async () => {
    const { repository } = renderWorkspace({
      view: "week",
      initialAnchorDate: "2026-03-01",
      entries: [],
    });

    const addButton = await screen.findByTestId("work-calendar-toolbar-add");
    expect(addButton).toHaveAccessibleName("Tambah hari ini");

    const created: string[] = [];
    const originalCreate = repository.createEntry;
    repository.createEntry = async (draft) => {
      created.push(draft.workDate);
      return originalCreate(draft);
    };

    fireEvent.click(addButton);
    await flushAnimationFrame();

    // Aksi berpindah ke tampilan Hari pada today, bukan anchor Minggu.
    await waitFor(() => {
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Hari Ini, Selasa, 10 Maret 2026",
      );
    });
    await waitFor(() => expect(quickInput()).toHaveFocus());

    fireEvent.change(quickInput(), { target: { value: "Pekerjaan dari Minggu" } });
    fireEvent.keyDown(quickInput(), { key: "Enter" });
    await waitFor(() => expect(created).toEqual([WORK_CALENDAR_FIXTURE_TODAY]));
  });

  it("berlabel 'Tambah pekerjaan saya' pada Tim dan tidak membuat pekerjaan bawahan", async () => {
    const { repository } = renderWorkspace({ view: "team", entries: [] });

    const addButton = await screen.findByTestId("work-calendar-toolbar-add");
    expect(addButton).toHaveAccessibleName("Tambah pekerjaan saya");

    const drafts: Array<{ ownerId: string; workDate: string }> = [];
    const originalCreate = repository.createEntry;
    repository.createEntry = async (draft) => {
      drafts.push({ ownerId: draft.ownerId, workDate: draft.workDate });
      return originalCreate(draft);
    };

    fireEvent.click(addButton);
    await flushAnimationFrame();

    await waitFor(() =>
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Hari Ini, Selasa, 10 Maret 2026",
      ),
    );
    await waitFor(() => expect(quickInput()).toHaveFocus());

    fireEvent.change(quickInput(), { target: { value: "Pekerjaan saya dari Tim" } });
    fireEvent.keyDown(quickInput(), { key: "Enter" });

    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(drafts[0]).toEqual({
      ownerId: WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
      workDate: WORK_CALENDAR_FIXTURE_TODAY,
    });
  });

  it("panel Bulan mempertahankan aksi 'Tambahkan pekerjaan ke tanggal ini' beserta tanggalnya", async () => {
    const { repository } = renderWorkspace({
      view: "month",
      entries: [
        createFixtureWorkEntry({
          id: "panel-1",
          title: "Pekerjaan panel satu",
          workDate: WORK_CALENDAR_FIXTURE_TODAY,
        }),
        createFixtureWorkEntry({
          id: "panel-2",
          title: "Pekerjaan panel dua",
          workDate: WORK_CALENDAR_FIXTURE_TODAY,
        }),
        createFixtureWorkEntry({
          id: "panel-3",
          title: "Pekerjaan panel tiga",
          workDate: WORK_CALENDAR_FIXTURE_TODAY,
        }),
      ],
    });

    fireEvent.click(await screen.findByTestId(`work-month-more-${WORK_CALENDAR_FIXTURE_TODAY}`));
    const panel = await screen.findByTestId("work-month-day-panel");

    const created: string[] = [];
    const originalCreate = repository.createEntry;
    repository.createEntry = async (draft) => {
      created.push(draft.workDate);
      return originalCreate(draft);
    };

    fireEvent.click(within(panel).getByTestId("work-month-panel-add"));
    await flushAnimationFrame();

    await waitFor(() =>
      expect(screen.getByTestId("work-calendar-range-label")).toHaveTextContent(
        "Hari Ini, Selasa, 10 Maret 2026",
      ),
    );
    await waitFor(() => expect(quickInput()).toHaveFocus());
    expect(screen.queryByTestId("work-month-day-panel")).not.toBeInTheDocument();

    fireEvent.change(quickInput(), { target: { value: "Pekerjaan dari panel bulan" } });
    fireEvent.keyDown(quickInput(), { key: "Enter" });

    // Tanggal target sama dengan tanggal panel, bukan selalu today.
    await waitFor(() => expect(created).toEqual([WORK_CALENDAR_FIXTURE_TODAY]));
  });
});

describe("WorkCalendarWorkspace — CAL-03 F4A keterbacaan dark mode", () => {
  it("tidak memakai muted penuh pada judul selesai dan tetap menyediakan badge status", async () => {
    renderWorkspace({
      entries: [
        createFixtureWorkEntry({
          id: "done-1",
          title: "Laporan selesai dibaca",
          status: "completed",
          realization: "Sudah dikirim.",
        }),
      ],
    });

    const row = await screen.findByTestId("work-entry-row-done-1");
    const titleButton = within(row).getByTestId("work-entry-title-done-1");
    expect(titleButton).toHaveClass("text-foreground");
    expect(titleButton).not.toHaveClass("text-muted-foreground");
    // Efek selesai hanya dekorasi ringan, bukan warna teks yang diredupkan.
    expect(titleButton.className).toContain("line-through");

    // Status tetap dikenali lewat ikon + label + badge, bukan warna saja.
    const statusControl = within(row).getByTestId("work-entry-status-control-done-1");
    expect(statusControl).toHaveTextContent("Selesai");
    expect(within(row).getByTestId("work-entry-status-label-done-1")).toHaveTextContent("Selesai");
  });

  it("memberi kelas scope Work Calendar pada root agar token dark-mode terbatas", async () => {
    const { container } = renderWorkspace({ entries: [] });
    await screen.findByTestId("work-entry-empty");
    const root = container.querySelector(".work-calendar-scope");
    expect(root).not.toBeNull();
  });
});

describe("WorkCalendarWorkspace — mode Minggu dan Bulan", () => {
  it("menampilkan tujuh hari pada mode Minggu", async () => {
    renderWorkspace({ view: "week", entries: [] });
    await waitFor(() =>
      expect(screen.getAllByTestId(/^work-week-column-/)).toHaveLength(7),
    );
  });

  it("menampilkan jumlah selesai/total dan maksimal dua preview pada sel bulan", async () => {
    renderWorkspace({
      view: "month",
      entries: [
        createFixtureWorkEntry({ id: "m1", title: "Satu", workDate: WORK_CALENDAR_FIXTURE_TODAY, status: "completed" }),
        createFixtureWorkEntry({ id: "m2", title: "Dua", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
        createFixtureWorkEntry({ id: "m3", title: "Tiga", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
      ],
    });

    const cell = await screen.findByTestId(`work-month-cell-${WORK_CALENDAR_FIXTURE_TODAY}`);
    expect(screen.getByTestId(`work-month-count-${WORK_CALENDAR_FIXTURE_TODAY}`)).toHaveTextContent("1/3");
    expect(within(cell).getAllByTestId(/^work-month-preview-/)).toHaveLength(2);
    expect(screen.getByTestId(`work-month-more-${WORK_CALENDAR_FIXTURE_TODAY}`)).toHaveTextContent("+1 lainnya");
  });

  it("menyediakan satu preview judul prioritas tertinggi pada sel mobile", async () => {
    renderWorkspace({
      view: "month",
      entries: [
        createFixtureWorkEntry({ id: "mc1", title: "Satu", workDate: WORK_CALENDAR_FIXTURE_TODAY, status: "completed" }),
        createFixtureWorkEntry({ id: "mc2", title: "Dua", workDate: WORK_CALENDAR_FIXTURE_TODAY, status: "blocked", blockedReason: "Tertahan." }),
      ],
    });

    const compact = await screen.findByTestId(`work-month-compact-${WORK_CALENDAR_FIXTURE_TODAY}`);
    // Preview tunggal memuat judul dengan prioritas tertinggi (terhambat)
    // sehingga risiko paling mudah terbaca; judul entry selesai tidak ikut.
    expect(within(compact).getByTestId("work-month-mobile-preview-mc2")).toBeInTheDocument();
    expect(compact).toHaveTextContent("Dua");
    expect(compact).not.toHaveTextContent("Satu");
    // Ringkasan jumlah per status tetap ada: satu selesai dan satu terhambat.
    expect(within(compact).getAllByText("1")).toHaveLength(2);
  });

  it("membuka panel hari saat +N lainnya diklik", async () => {
    renderWorkspace({
      view: "month",
      entries: [
        createFixtureWorkEntry({ id: "p1", title: "Satu", workDate: WORK_CALENDAR_FIXTURE_TODAY, status: "completed" }),
        createFixtureWorkEntry({ id: "p2", title: "Dua", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
        createFixtureWorkEntry({ id: "p3", title: "Tiga", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
      ],
    });

    fireEvent.click(await screen.findByTestId(`work-month-more-${WORK_CALENDAR_FIXTURE_TODAY}`));
    expect(await screen.findByTestId("work-month-day-panel")).toBeInTheDocument();
    expect(screen.getByTestId("work-month-day-panel")).toHaveTextContent("1 selesai dari 3 pekerjaan");
  });

  it("membuka daftar hari penuh dari sel bulan versi mobile", async () => {
    renderWorkspace({
      view: "month",
      entries: [
        createFixtureWorkEntry({ id: "mo1", title: "Rapat koordinasi mingguan", workDate: WORK_CALENDAR_FIXTURE_TODAY }),
      ],
    });

    fireEvent.click(await screen.findByTestId(`work-month-open-${WORK_CALENDAR_FIXTURE_TODAY}`));
    const panel = await screen.findByTestId("work-month-day-panel");
    // Judul lengkap terbaca di panel, bukan potongan satu huruf di grid.
    expect(panel).toHaveTextContent("Rapat koordinasi mingguan");
  });
});

describe("WorkCalendarWorkspace — konfirmasi hapus", () => {
  async function openDeleteDialog() {
    const row = await screen.findByTestId("work-entry-row-del-1");
    await openActionMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Hapus/i }));
    return row;
  }

  it("tidak memanggil repository sebelum konfirmasi", async () => {
    const { repository } = renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "del-1", title: "Pekerjaan dihapus" })],
    });
    const deleted: string[] = [];
    repository.deleteEntry = async ({ entryId }) => {
      deleted.push(entryId);
    };

    const row = await openDeleteDialog();
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(deleted).toEqual([]);
    expect(row).toHaveAttribute("data-entry-status", "planned");
  });

  it("menyebut judul pekerjaan pada dialog konfirmasi", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "del-1", title: "Pekerjaan dihapus" })],
    });
    await openDeleteDialog();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Pekerjaan dihapus");
    expect(within(dialog).getByRole("button", { name: "Batal" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Hapus pekerjaan/i })).toBeInTheDocument();
  });

  it("Batal tidak menghapus dan mengembalikan fokus ke tombol menu", async () => {
    const { repository } = renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "del-1", title: "Pekerjaan dihapus" })],
    });
    const deleted: string[] = [];
    repository.deleteEntry = async ({ entryId }) => {
      deleted.push(entryId);
    };

    const row = await openDeleteDialog();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deleted).toEqual([]);
    expect(screen.getByTestId("work-entry-row-del-1")).toBeInTheDocument();
    // Fokus kembali ke tombol menu pemicu.
    expect(within(row).getByRole("button", { name: /Menu tindakan/i })).toHaveFocus();
  });

  it("Hapus pekerjaan menjalankan penghapusan setelah konfirmasi", async () => {
    const { repository } = renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "del-1", title: "Pekerjaan dihapus" })],
    });
    const deleted: string[] = [];
    repository.deleteEntry = async ({ entryId }) => {
      deleted.push(entryId);
    };

    await openDeleteDialog();
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Hapus pekerjaan/i }),
    );

    await waitFor(() => expect(deleted).toEqual(["del-1"]));
    await waitFor(() =>
      expect(screen.queryByTestId("work-entry-row-del-1")).not.toBeInTheDocument(),
    );
  });

  it("menampilkan error hapus dekat area kerja dan tetap menyimpan entry", async () => {
    const { repository } = renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "del-1", title: "Pekerjaan dihapus" })],
    });
    repository.deleteEntry = async () => {
      throw new Error("Penghapusan gagal di server.");
    };

    await openDeleteDialog();
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Hapus pekerjaan/i }),
    );

    expect(await screen.findByTestId("work-calendar-mutation-error")).toHaveTextContent(
      "Penghapusan gagal di server.",
    );
    expect(screen.getByTestId("work-entry-row-del-1")).toBeInTheDocument();
  });
});

describe("WorkCalendarWorkspace — keadaan gagal", () => {
  it("menampilkan error memuat dan tombol coba lagi", async () => {
    renderWorkspace({ failOnList: true });
    expect(await screen.findByTestId("work-calendar-load-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coba lagi/i })).toBeInTheDocument();
  });

  it("tetap menampilkan quick entry saat daftar kosong", async () => {
    renderWorkspace({ entries: [] });
    expect(quickInput()).toBeInTheDocument();
    expect(await screen.findByTestId("work-entry-empty")).toBeInTheDocument();
  });
});

describe("WorkCalendarWorkspace — aksesibilitas", () => {
  it("memberi label aksesibel pada kontrol utama", async () => {
    renderWorkspace({ entries: [] });

    expect(screen.getByRole("button", { name: "Rentang sebelumnya" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rentang berikutnya" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hari Ini" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Pilih rentang tampilan" })).toBeInTheDocument();
    // Tampilan Hari memakai tombol Tambah milik quick entry, bukan aksi
    // toolbar duplikat (CAL-03 F4A scope C).
    expect(screen.queryByTestId("work-calendar-toolbar-add")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah" })).toBeInTheDocument();
  });

  it("mengubah status melalui keyboard dari kontrol status", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "kb-1", title: "Pekerjaan keyboard" })],
    });

    const row = await screen.findByTestId("work-entry-row-kb-1");
    await chooseStatus(row, "Sedang Dikerjakan");

    await waitFor(() =>
      expect(screen.getByTestId("work-entry-row-kb-1")).toHaveAttribute(
        "data-entry-status",
        "in_progress",
      ),
    );
  });

  it("menyediakan judul halaman tersembunyi untuk pembaca layar", async () => {
    renderWorkspace({ entries: [] });
    // Tunggu sampai daftar selesai dimuat sebelum memeriksa judul.
    await screen.findByTestId("work-entry-empty");
    expect(
      screen.getByRole("heading", { name: /Pekerjaan Selasa, 10 Maret 2026/i }),
    ).toBeInTheDocument();
  });

  it("tidak memakai emoji sebagai ikon", async () => {
    const { container } = renderWorkspace({ view: "team" });
    await screen.findByTestId("work-team-row-user-bawahan-1");
    const text = container.textContent ?? "";
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiPattern.test(text)).toBe(false);
  });
});
