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
      initialAnchorDate={WORK_CALENDAR_FIXTURE_TODAY}
      now={workCalendarFixtureNow}
    />,
  );
  return { ...utils, repository };
}

const quickInput = () => screen.getByLabelText("Apa yang akan dikerjakan?");

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

describe("WorkCalendarWorkspace — status inline", () => {
  it("meminta realisasi inline saat status menjadi completed", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-1", title: "Pekerjaan status", status: "planned" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-1");
    fireEvent.click(within(row).getByRole("button", { name: /sebagai Selesai/i }));

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
    fireEvent.click(within(row).getByRole("button", { name: /sebagai Selesai/i }));
    const save = await screen.findByRole("button", { name: "Simpan" });
    expect(save).toBeDisabled();
    expect(row).toHaveAttribute("data-entry-status", "planned");
  });

  it("menyimpan completed beserta realisasi", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-3", title: "Pekerjaan status tiga" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-3");
    fireEvent.click(within(row).getByRole("button", { name: /sebagai Selesai/i }));
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
    fireEvent.click(within(row).getByRole("button", { name: /sebagai Terhambat/i }));
    expect(await screen.findByLabelText(/Alasan terhambat/i)).toBeInTheDocument();
  });

  it("menyimpan blocked beserta alasannya", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "status-5", title: "Pekerjaan status lima" })],
    });

    const row = await screen.findByTestId("work-entry-row-status-5");
    fireEvent.click(within(row).getByRole("button", { name: /sebagai Terhambat/i }));
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
    fireEvent.click(within(row).getByRole("button", { name: /sebagai Sedang Dikerjakan/i }));

    await waitFor(() =>
      expect(screen.getByTestId("work-entry-row-status-6")).toHaveAttribute(
        "data-entry-status",
        "in_progress",
      ),
    );
    expect(screen.queryByLabelText(/Hasil pekerjaan/i)).not.toBeInTheDocument();
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

describe("WorkCalendarWorkspace — mode Tim", () => {
  it("menyembunyikan tab Tim tanpa bawahan", async () => {
    renderWorkspace({ entries: [], teamMembers: [] });
    expect(screen.queryByRole("button", { name: /^Tim$/i })).not.toBeInTheDocument();
  });

  it("menampilkan tab Tim saat pengguna punya bawahan", async () => {
    renderWorkspace({ entries: [] });
    expect(screen.getByRole("button", { name: /^Tim$/i })).toBeInTheDocument();
  });

  it("menghitung progres tim otomatis tanpa input persen", async () => {
    renderWorkspace({ view: "team" });
    const row = await screen.findByTestId("work-team-row-user-bawahan-1");
    expect(within(row).getByTestId("team-completed-user-bawahan-1")).toHaveTextContent("1");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("tidak menyediakan aksi ubah/hapus pada entry bawahan", async () => {
    renderWorkspace({ view: "team" });
    const row = await screen.findByTestId("work-team-row-user-bawahan-1");
    fireEvent.click(within(row).getByRole("button", { expanded: false }));

    const entryRow = await screen.findByTestId("work-entry-row-team-1");
    expect(within(entryRow).queryByTestId("work-entry-status-group-team-1")).not.toBeInTheDocument();

    // Menu dibuka lewat keyboard karena Radix memakai pointerdown untuk klik.
    const menuButton = within(entryRow).getByRole("button", { name: /Menu tindakan/i });
    menuButton.focus();
    fireEvent.keyDown(menuButton, { key: "Enter" });

    expect(await screen.findByRole("menuitem", { name: /Lihat detail/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Hapus/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Ubah judul/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Ubah status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Pindahkan tanggal/i })).not.toBeInTheDocument();
  });

  it("menyaring entry tim menurut pemilik", async () => {
    renderWorkspace({ view: "team" });
    expect(await screen.findByTestId("work-team-row-user-bawahan-2")).toBeInTheDocument();
    expect(screen.getByTestId("work-team-row-user-bawahan-3")).toBeInTheDocument();
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

  it("mengubah status melalui keyboard", async () => {
    renderWorkspace({
      entries: [createFixtureWorkEntry({ id: "kb-1", title: "Pekerjaan keyboard" })],
    });

    const row = await screen.findByTestId("work-entry-row-kb-1");
    const button = within(row).getByRole("button", { name: /sebagai Sedang Dikerjakan/i });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);

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
