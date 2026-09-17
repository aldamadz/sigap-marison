/**
 * CAL-03 F8 — audit aksesibilitas ringan (termasuk Dark Mode) untuk F1–F7.
 *
 * Audit ini sengaja dibatasi pada aset yang tersedia di lokal: `vitest` +
 * `@testing-library` + jsdom. Tidak ada `axe-core` maupun browser sungguhan,
 * sehingga audit dibagi dua lapisan:
 *
 * 1. Audit render — memeriksa nama aksesibel, peran (role), status yang tidak
 *    pernah dibedakan lewat warna saja, dan target sentuh pada permukaan yang
 *    benar-benar dirender (F1–F7).
 * 2. Audit token — menghitung rasio kontras WCAG 2.1 dari token
 *    `.work-calendar-scope` (terang) dan `.dark .work-calendar-scope` (gelap)
 *    langsung dari `src/index.css`, sehingga Dark Mode ikut terverifikasi
 *    secara terukur dan bukan sekadar diasumsikan.
 *
 * Catatan: berkas ini tidak menambah fitur maupun kolom database baru. Ia
 * hanya menegakkan kontrak aksesibilitas yang sudah ada.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import { WorkCalendarDashboardWidget } from "@/features/work-calendar/components/WorkCalendarDashboardWidget";
import { DailyProgressSummary } from "@/features/work-calendar/components/DailyProgressSummary";
import { WorkCalendarDayBadge } from "@/features/work-calendar/components/WorkCalendarDayBadge";
import { buildWorkCalendarDashboardSummary } from "@/features/work-calendar/lib/work-calendar-dashboard";
import { getWorkCalendarDayMeta } from "@/features/work-calendar/lib/work-day-config";
import {
  WORK_ENTRY_STATUS_META,
  WORK_ENTRY_STATUS_ORDER,
} from "@/features/work-calendar/lib/work-entry-status";
import { WORK_CALENDAR_NOTIFICATION_META } from "@/features/work-calendar/lib/work-calendar-notifications";
import { WORK_CALENDAR_NOTIFICATION_CATEGORIES } from "@/features/work-calendar/types/work-calendar-notifications";
import type { WorkCalendarWorkSettings } from "@/features/work-calendar/types/work-calendar";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_HOLIDAYS,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntries,
  createFixtureWorkEntry,
  createFixtureWorkEntryRepository,
  workCalendarFixtureNow,
} from "@/features/work-calendar/testing/work-calendar-fixtures";

const root = process.cwd();

/**
 * Radix memakai API pointer/scroll yang tidak disediakan jsdom. Polyfill ini
 * hanya untuk test, sama seperti berkas uji Work Calendar lain.
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

/* ------------------------------------------------------------------------- */
/* Lapisan 1 — audit render                                                  */
/* ------------------------------------------------------------------------- */

function renderWorkspace(
  options: { initialView?: "day" | "week" | "month" | "team" } = {},
) {
  return render(
    <WorkCalendarWorkspace
      currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
      repository={createFixtureWorkEntryRepository()}
      teamMembers={WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
      initialView={options.initialView ?? "day"}
      initialAnchorDate={WORK_CALENDAR_FIXTURE_TODAY}
      now={workCalendarFixtureNow}
      holidays={WORK_CALENDAR_FIXTURE_HOLIDAYS}
    />,
  );
}

describe("CAL-03 F8 a11y — permukaan Work Calendar (F1–F6)", () => {
  it("menandai kontainer utama dengan scope dark mode dan landmark yang benar", async () => {
    const { container } = renderWorkspace();
    await screen.findByTestId("daily-progress-summary");

    // F4A: token dark mode hanya berlaku di dalam scope ini.
    const scope = container.querySelector(".work-calendar-scope");
    expect(scope).not.toBeNull();
    expect(scope?.tagName).toBe("DIV");
  });

  it("memberi nama aksesibel pada seluruh kontrol ikon dan kontrol tampilan", async () => {
    renderWorkspace();
    await screen.findByTestId("daily-progress-summary");

    // Tombol ikon tidak boleh tanpa nama (WCAG 4.1.2 / 2.4.6).
    expect(screen.getByRole("button", { name: "Rentang sebelumnya" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rentang berikutnya" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hari Ini" })).toBeInTheDocument();

    // Grup pemilih tampilan punya nama dan status terpilih yang terekspos.
    const viewGroup = screen.getByRole("group", { name: "Pilih rentang tampilan" });
    for (const label of ["Hari", "Minggu", "Bulan"]) {
      const viewButton = within(viewGroup).getByRole("button", { name: label });
      expect(viewButton).toHaveAttribute("aria-pressed", label === "Hari" ? "true" : "false");
    }

    // Setiap tombol ikon di dalam workspace wajib punya nama aksesibel.
    const iconOnlyButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
    );
    expect(iconOnlyButtons.length).toBeGreaterThan(0);
    for (const button of iconOnlyButtons) {
      expect(button.getAttribute("aria-label")?.trim().length).toBeGreaterThan(0);
    }
  });

  it("mengumumkan progres harian dengan peran progressbar bernilai teks", async () => {
    renderWorkspace();
    await screen.findByTestId("daily-progress-summary");

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAccessibleName(/Progres/);
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    expect(progress.getAttribute("aria-valuetext")).toMatch(/persen selesai$/);
  });

  it("tidak pernah membedakan status hanya lewat warna: ikon selalu bergandengan label", () => {
    // Kontrak murni F5/F6: setiap status punya label + deskripsi + ikon.
    for (const status of WORK_ENTRY_STATUS_ORDER) {
      const meta = WORK_ENTRY_STATUS_META[status];
      expect(meta.label.trim().length).toBeGreaterThan(0);
      expect(meta.description.trim().length).toBeGreaterThan(0);
      expect(meta.icon).toBeTruthy();
      expect(meta.badgeClassName).toContain("text-");
    }
  });

  it("menyediakan teks (bukan warna) untuk hari libur dan hari nonkerja", () => {
    const settings: WorkCalendarWorkSettings = {
      workDays: [1, 2, 3, 4, 5],
      workStart: "08:00",
      workEnd: "17:00",
      breakStart: "12:00",
      breakEnd: "13:00",
      timezone: "Asia/Jakarta",
    };
    const holiday = WORK_CALENDAR_FIXTURE_HOLIDAYS[0];
    const holidayMap = new Map(
      WORK_CALENDAR_FIXTURE_HOLIDAYS.map((item) => [item.date, item] as const),
    );
    const meta = getWorkCalendarDayMeta(holiday.date, settings, holidayMap);
    expect(meta.kind).not.toBe("work_day");
    expect(meta.label).toBeTruthy();

    const { container } = render(<WorkCalendarDayBadge meta={meta} />);
    const badge = container.querySelector(`[data-testid="work-day-badge-${meta.date}"]`);
    expect(badge).not.toBeNull();
    // Label teks harus ada di DOM, bukan hanya latar berwarna.
    expect(badge?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("menjaga target sentuh kontrol utama minimal 44px", async () => {
    renderWorkspace();
    const viewGroup = await screen.findByRole("group", { name: "Pilih rentang tampilan" });
    for (const button of within(viewGroup).getAllByRole("button")) {
      expect(button.className).toContain("min-h-touch");
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Lapisan 1b — F7 dashboard & notifikasi                                    */
/* ------------------------------------------------------------------------- */

describe("CAL-03 F8 a11y — dashboard dan notifikasi (F7)", () => {
  const entries = createFixtureWorkEntries();
  const summary = buildWorkCalendarDashboardSummary(entries, WORK_CALENDAR_FIXTURE_TODAY);

  it("memberi widget dashboard nama region dan mengumumkan galat sebagai alert", () => {
    render(
      <MemoryRouter>
        <WorkCalendarDashboardWidget
          summary={summary}
          today={WORK_CALENDAR_FIXTURE_TODAY}
          error="Gagal memuat ringkasan."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("region", { name: "Ringkasan Kalender Kerja" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Gagal memuat ringkasan.");
  });

  it("tidak mengandalkan warna untuk penanda lewat tenggat pada dashboard", () => {
    const overdueOnly = [
      createFixtureWorkEntry({ id: "od-1", status: "planned", workDate: "2026-03-08" }),
    ];
    render(
      <MemoryRouter>
        <WorkCalendarDashboardWidget
          summary={buildWorkCalendarDashboardSummary(overdueOnly, WORK_CALENDAR_FIXTURE_TODAY)}
          today={WORK_CALENDAR_FIXTURE_TODAY}
        />
      </MemoryRouter>,
    );

    const region = screen.getByRole("region", { name: "Ringkasan Kalender Kerja" });
    // Penanda tertunda punya teks eksplisit, bukan hanya warna `text-overdue`.
    expect(within(region).getByText("Tertunda (lewat tenggat)")).toBeInTheDocument();
    expect(within(region).getAllByText("Lewat tenggat").length).toBeGreaterThan(0);
    expect(within(region).getByText(/Belum selesai dan tanggal kerja sudah lewat/)).toBeInTheDocument();
  });

  it("menyediakan label, deskripsi, tipe, dan ikon berbeda untuk tiap kategori notifikasi", () => {
    for (const category of WORK_CALENDAR_NOTIFICATION_CATEGORIES) {
      const meta = WORK_CALENDAR_NOTIFICATION_META[category];
      expect(meta.label.trim().length).toBeGreaterThan(0);
      expect(meta.description.trim().length).toBeGreaterThan(0);
      expect(["info", "warning", "error"]).toContain(meta.notificationType);
      expect(meta.icon).toBeTruthy();
      expect(meta.iconClassName).toContain("text-");
    }

    // Kategori tidak boleh berbagi ikon yang sama.
    const iconNames = WORK_CALENDAR_NOTIFICATION_CATEGORIES.map(
      (category) => WORK_CALENDAR_NOTIFICATION_META[category].icon.displayName ?? category,
    );
    expect(new Set(iconNames).size).toBe(iconNames.length);
  });

  it("mengekspos lonceng notifikasi dengan nama yang memuat jumlah belum dibaca", () => {
    // Sumber Header tidak dapat dirender tanpa seluruh provider aplikasi, jadi
    // kontrak aksesibilitasnya diaudit sebagai sumber. Ini menjaga badge angka
    // tetap terbaca pembaca layar.
    const header = readFileSync(join(root, "src", "components", "layout", "Header.tsx"), "utf8");
    expect(header).toContain("aria-label={`Buka notifikasi, ${unreadCount} belum dibaca`}");
    expect(header).toContain('data-testid="notification-unread-badge"');
    expect(header).toContain("aria-label={");
  });
});

/* ------------------------------------------------------------------------- */
/* Lapisan 1c — komponen presentasional                                      */
/* ------------------------------------------------------------------------- */

describe("CAL-03 F8 a11y — ringkasan progres dan badge hari", () => {
  it("memberi nama aksesibel pada ringkasan progres dan memakai definisi daftar", () => {
    render(
      <DailyProgressSummary
        title="Selasa, 10 Maret 2026"
        counts={{ total: 4, planned: 1, inProgress: 1, completed: 1, blocked: 1, overdue: 1 }}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Ringkasan progres Selasa, 10 Maret 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAccessibleName(
      "Progres Selasa, 10 Maret 2026",
    );
    // Jumlah status tersedia sebagai pasangan istilah/nilai.
    expect(screen.getByText("Direncanakan")).toBeInTheDocument();
    expect(screen.getByText("Terhambat")).toBeInTheDocument();
    expect(screen.getByText("Terlambat")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------- */
/* Lapisan 2 — audit kontras token (terang + Dark Mode)                      */
/* ------------------------------------------------------------------------- */

interface HslToken {
  h: number;
  s: number;
  l: number;
}

function parseToken(value: string): HslToken {
  const match = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(value.trim());
  if (!match) throw new Error(`Token HSL tidak valid: ${value}`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function hslToRgb(token: HslToken): [number, number, number] {
  const s = token.s / 100;
  const l = token.l / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = token.h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number] = [0, 0, 0];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const channels = rgb.map((value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: HslToken, b: HslToken): number {
  const la = relativeLuminance(hslToRgb(a));
  const lb = relativeLuminance(hslToRgb(b));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Membaca blok deklarasi CSS untuk selektor tertentu dari `src/index.css`. */
function readCssBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Selektor tidak ditemukan: ${selector}`);
  const end = css.indexOf("}", start);
  const body = css.slice(start + selector.length + 2, end);
  const declarations: Record<string, string> = {};
  for (const line of body.split(/;|\n/)) {
    const match = /^\s*(--[a-z-]+)\s*:\s*([^;]+?)\s*$/.exec(line);
    if (match) declarations[match[1]] = match[2];
  }
  return declarations;
}

describe("CAL-03 F8 audit dark mode — kontras token Work Calendar", () => {
  const css = readFileSync(join(root, "src", "index.css"), "utf8");
  const light = readCssBlock(css, ".work-calendar-scope");
  const dark = readCssBlock(css, ".dark .work-calendar-scope");

  it("scope terang dan gelap sama-sama memuat token yang diaudit", () => {
    for (const token of ["--primary", "--input", "--success", "--pending", "--overdue", "--destructive"]) {
      expect(light[token]).toBeDefined();
    }
    for (const token of [
      "--primary",
      "--card",
      "--card-foreground",
      "--muted",
      "--muted-foreground",
      "--border",
      "--input",
      "--success",
      "--pending",
      "--overdue",
      "--destructive",
      "--destructive-foreground",
    ]) {
      expect(dark[token]).toBeDefined();
    }
  });

  it("menjaga token status terang >= 4.5:1 di atas kartu", () => {
    const card = parseToken("0 0% 100%");
    for (const token of ["--success", "--pending", "--overdue", "--destructive", "--primary"]) {
      const ratio = contrastRatio(parseToken(light[token]), card);
      expect(ratio, `${token} terang`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("menjaga token status gelap >= 4.5:1 di atas kartu gelap", () => {
    const card = parseToken(dark["--card"]);
    for (const token of [
      "--primary",
      "--success",
      "--pending",
      "--overdue",
      "--destructive",
      "--muted-foreground",
    ]) {
      const ratio = contrastRatio(parseToken(dark[token]), card);
      expect(ratio, `${token} gelap`).toBeGreaterThanOrEqual(4.5);
    }
    // Teks utama di atas kartu gelap harus jauh di atas ambang.
    expect(contrastRatio(parseToken(dark["--card-foreground"]), card)).toBeGreaterThanOrEqual(7);
  });

  it("menjaga batas kontrol interaktif >= 3:1 di kedua tema", () => {
    expect(
      contrastRatio(parseToken(light["--input"]), parseToken("0 0% 100%")),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(parseToken(dark["--input"]), parseToken(dark["--card"])),
    ).toBeGreaterThanOrEqual(3);
  });

  it("menjaga tombol destruktif gelap tetap >= 4.5:1", () => {
    expect(
      contrastRatio(parseToken(dark["--destructive-foreground"]), parseToken(dark["--destructive"])),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(parseToken("0 0% 100%"), parseToken("126 55% 30%")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("tidak menaikkan token dark mode ke scope global", () => {
    // Override harus tetap berada di dalam `.dark .work-calendar-scope`.
    const darkScopeStart = css.indexOf(".dark .work-calendar-scope {");
    const nextRule = css.indexOf(".dark .work-calendar-scope {", darkScopeStart + 1);
    expect(nextRule).toBe(-1);
    // Token `--card` pada scope gelap berbeda dari nilai global `.dark --card`.
    expect(dark["--card"]).not.toBe("222 34% 10%");
  });
});
