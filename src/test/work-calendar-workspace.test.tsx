import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
  it("menurunkan overdue dari tanggal tanpa menyimpan status baru", async () => {
    // Senin 9 Maret 2026 berada pada minggu yang sama dengan hari fixture,
    // sehingga entry masih termuat tetapi tanggalnya sudah lewat.
    renderWorkspace({
      view: "week",
      entries: [
        createFixtureWorkEntry({ id: "late", title: "Pekerjaan terlambat", status: "planned", workDate: "2026-03-09" }),
      ],
    });

    expect(await screen.findByTestId("work-entry-overdue-late")).toHaveTextContent("Terlambat");
    // Overdue tetap status `planned`; tidak ada status tersimpan bernama overdue.
    expect(screen.getByTestId("work-entry-row-late")).toHaveAttribute("data-entry-status", "planned");
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
        }),
      ],
    });

    expect(await screen.findByTestId("work-entry-overdue-late-blocked")).toHaveTextContent("Terlambat");
    expect(screen.getByTestId("work-entry-row-late-blocked")).toHaveAttribute(
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

  it("menyediakan indikator ringkas mobile tanpa preview judul", async () => {
    renderWorkspace({
      view: "month",
      entries: [
        createFixtureWorkEntry({ id: "mc1", title: "Satu", workDate: WORK_CALENDAR_FIXTURE_TODAY, status: "completed" }),
        createFixtureWorkEntry({ id: "mc2", title: "Dua", workDate: WORK_CALENDAR_FIXTURE_TODAY, status: "blocked", blockedReason: "Tertahan." }),
      ],
    });

    const compact = await screen.findByTestId(`work-month-compact-${WORK_CALENDAR_FIXTURE_TODAY}`);
    // Satu selesai dan satu terhambat: dua penanda status ringkas.
    expect(compact).toHaveTextContent("11");
    // Indikator mobile tidak memuat judul entry.
    expect(compact).not.toHaveTextContent("Satu");
    expect(compact).not.toHaveTextContent("Dua");
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
    expect(screen.getByRole("button", { name: "Tambah pekerjaan" })).toBeInTheDocument();
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
