import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORK_CALENDAR_LEGACY_IMPORT_MARKERS,
  findLegacyWorkCalendarImports,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import {
  WORK_ENTRY_BLOCKED_REASON_MAX_LENGTH,
  WORK_ENTRY_LOCATION_MAX_LENGTH,
  WORK_ENTRY_NOTES_MAX_LENGTH,
  WORK_ENTRY_REALIZATION_MAX_LENGTH,
  WORK_ENTRY_TITLE_MAX_LENGTH,
} from "@/features/work-calendar/lib/work-entry-validation";
import {
  WORK_ENTRY_COLOR_SWATCHES,
  WORK_ENTRY_EVENT_TYPES,
  WORK_ENTRY_KINDS,
  WORK_ENTRY_STATUSES,
} from "@/features/work-calendar/types/work-calendar";

const root = process.cwd();
const featureDir = join(root, "src", "features", "work-calendar");
/** Fixture memang memuat nama modul legacy sebagai daftar marker audit. */
const fixtureDir = join(featureDir, "testing");

function collectRuntimeFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full === fixtureDir) continue;
      files.push(...collectRuntimeFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(full);
  }
  return files;
}

const runtimeFiles = collectRuntimeFiles(featureDir).map((full) => ({
  path: relative(root, full).split(sep).join("/"),
  source: readFileSync(full, "utf8"),
}));

describe("Work Calendar — batas modul CAL-03 F3", () => {
  it("menemukan berkas runtime untuk diaudit", () => {
    expect(runtimeFiles.length).toBeGreaterThan(0);
    expect(runtimeFiles.some((file) => file.path.endsWith("index.ts"))).toBe(true);
  });

  it("tidak mengimpor modul agenda/kalender lama", () => {
    const offenders = runtimeFiles
      .map((file) => ({ path: file.path, markers: findLegacyWorkCalendarImports(file.source) }))
      .filter((result) => result.markers.length > 0);

    expect(offenders).toEqual([]);
    // Marker sengaja tinggal di berkas fixture saja.
    expect(WORK_CALENDAR_LEGACY_IMPORT_MARKERS.length).toBeGreaterThan(0);
  });

  it("mendeteksi impor legacy pada contoh sintetis", () => {
    // Guard: audit harus benar-benar bisa gagal, bukan sekadar selalu lolos.
    expect(
      findLegacyWorkCalendarImports(
        'import { AgendaPage } from "@/pages/agenda/AgendaPage";\nimport { agendaSchema } from "@/types/agenda";',
      ),
    ).toEqual(expect.arrayContaining(["@/pages/agenda/AgendaPage", "@/types/agenda", "AgendaPage", "agendaSchema"]));

    expect(
      findLegacyWorkCalendarImports(
        'import type { WorkCalendarViewMode } from "../types/work-calendar";',
      ),
    ).toEqual([]);
  });

  it("komponen, hook, lib, dan types tidak memanggil Supabase atau klien HTTP", () => {
    const nonDataFiles = runtimeFiles.filter(
      (file) => !file.path.startsWith("src/features/work-calendar/data/"),
    );
    const forbidden = [/@supabase\//, /@tanstack\/react-query/, /from "@\/lib\/supabase"/, /\baxios\b/];
    const offenders = nonDataFiles
      .filter((file) => forbidden.some((pattern) => pattern.test(file.source)))
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it("hanya data layer yang boleh mengimpor @supabase/supabase-js", () => {
    const dataFiles = runtimeFiles.filter((file) =>
      file.path.startsWith("src/features/work-calendar/data/"),
    );
    expect(dataFiles.length).toBeGreaterThan(0);
    const forbiddenInData = [/@tanstack\/react-query/, /from "@\/lib\/supabase"/, /\baxios\b/];
    const offenders = dataFiles
      .filter((file) => forbiddenInData.some((pattern) => pattern.test(file.source)))
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it("hanya bergantung pada helper bersama yang diizinkan", () => {
    const allowed = new Set(["/lib/utils", "/components/ui/"]);
    const bareImports = runtimeFiles.flatMap((file) =>
      [...file.source.matchAll(/from\s+"(@\/[^"]+)"/g)].map((match) => ({
        path: file.path,
        specifier: match[1],
      })),
    );

    const offenders = bareImports.filter(
      (entry) => ![...allowed].some((prefix) => entry.specifier.includes(prefix)),
    );

    expect(offenders).toEqual([]);
    expect(bareImports.length).toBeGreaterThan(0);
  });

  it("tidak mengekspor fixture dari barrel publik", () => {
    const barrel = runtimeFiles.find((file) => file.path.endsWith("index.ts"));
    const barrelCode = (barrel?.source ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(barrelCode).not.toContain("testing/");
    expect(barrelCode).not.toContain("createFixtureWorkEntryRepository");
  });

  it("terpasang pada canonical route /calendar dan route legacy /agenda tidak terdaftar", () => {
    const app = readFileSync(join(root, "src", "App.tsx"), "utf8");
    expect(app).toContain('const WorkCalendarPage = lazy(() => import("@/pages/work-calendar/WorkCalendarPage"));');
    expect(app).toContain('path="/calendar"');
    expect(app).toContain('isWorkCalendarEnabled ? <WorkCalendarPage /> : <WorkCalendarUnavailablePage />');
    expect(app).not.toContain('<Route path="/agenda"');
    expect(app).not.toContain("@/pages/agenda/AgendaPage");
    expect(app).not.toContain("@/pages/calendar/CalendarPage");
  });

  it("sidebar hanya memiliki satu item Kalender Kerja pada /calendar tanpa menu Agenda", () => {
    const sidebar = readFileSync(join(root, "src", "components", "layout", "Sidebar.tsx"), "utf8");
    expect(sidebar).toContain("renderNavLink('/calendar', 'Kalender Kerja', Calendar)");
    expect(sidebar).not.toContain("renderNavLink('/agenda'");
    expect(sidebar).not.toContain("ClipboardList");
  });

  it("WorkCalendarPage tidak mengimpor modul agenda legacy", () => {
    const page = readFileSync(
      join(root, "src", "pages", "work-calendar", "WorkCalendarPage.tsx"),
      "utf8",
    );
    const markers = findLegacyWorkCalendarImports(page);
    expect(markers).toEqual([]);
    expect(page).not.toContain("@/types/agenda");
    expect(page).not.toContain("useAuth");
  });

  it("konstanta validasi frontend selaras dengan constraint migration database", () => {
    const migrationsDir = join(root, "supabase", "migrations");
    const migrationFiles = readdirSync(migrationsDir).filter((name) =>
      name.endsWith("work_calendar_entries.sql"),
    );
    expect(migrationFiles.length).toBe(1);

    const sql = readFileSync(join(migrationsDir, migrationFiles[0]), "utf8");

    // Title length 1..180
    expect(sql).toContain(`between 1 and ${WORK_ENTRY_TITLE_MAX_LENGTH}`);
    // Realization <= 500
    expect(sql).toContain(`length(realization) <= ${WORK_ENTRY_REALIZATION_MAX_LENGTH}`);
    // Blocked reason <= 300
    expect(sql).toContain(`length(blocked_reason) <= ${WORK_ENTRY_BLOCKED_REASON_MAX_LENGTH}`);
    // Notes <= 1000
    expect(sql).toContain(`length(notes) <= ${WORK_ENTRY_NOTES_MAX_LENGTH}`);
    // Location <= 120
    expect(sql).toContain(`length(location) <= ${WORK_ENTRY_LOCATION_MAX_LENGTH}`);

    // Statuses
    for (const status of WORK_ENTRY_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    // Kinds
    for (const kind of WORK_ENTRY_KINDS) {
      expect(sql).toContain(`'${kind}'`);
    }
  });

  it("seluruh modul runtime dan test CAL-03 F3 bebas any, @ts-*, dan double cast", () => {
    const cal03TestFiles = [
      "src/test/cal-03-f8-accessibility.test.tsx",
      "src/test/work-calendar-boundary.test.ts",
      "src/test/work-calendar-interaction-ux.test.tsx",
      "src/test/work-calendar-lib.test.ts",
      "src/test/work-calendar-lifecycle.test.tsx",
      "src/test/work-calendar-notifications.test.tsx",
      "src/test/work-calendar-page.test.tsx",
      "src/test/work-calendar-profile-repository.test.ts",
      "src/test/work-calendar-settings-repository.test.ts",
      "src/test/work-calendar-team-overview.test.ts",
      "src/test/work-calendar-team-overview-view.test.tsx",
      "src/test/work-calendar-workdays.test.tsx",
      "src/test/work-calendar-workspace.test.tsx",
    ];

    const allFilesToCheck = [
      ...runtimeFiles.map((f) => ({ path: f.path, source: f.source })),
      ...cal03TestFiles.map((rel) => ({
        path: rel,
        source: readFileSync(join(root, rel), "utf8"),
      })),
    ];

    const forbiddenPatterns = [
      { label: "@ts-ignore", pattern: new RegExp("@" + "ts-ignore") },
      { label: "@ts-nocheck", pattern: new RegExp("@" + "ts-nocheck") },
      { label: "@ts-expect-error", pattern: new RegExp("@" + "ts-expect-error") },
      { label: "as any", pattern: new RegExp("\\bas\\s+" + "any\\b") },
      { label: ": any", pattern: new RegExp(":\\s*" + "any\\b") },
      { label: "<any>", pattern: new RegExp("<" + "any>") },
      { label: "as unknown as", pattern: new RegExp("\\bas\\s+unknown\\s+as\\b") },
    ];

    for (const file of allFilesToCheck) {
      const content =
        file.path === "src/test/work-calendar-boundary.test.ts"
          ? file.source.slice(0, file.source.indexOf("seluruh modul runtime dan test CAL-03 F3 bebas"))
          : file.source;

      for (const { label, pattern } of forbiddenPatterns) {
        const matches = pattern.test(content);
        expect(
          matches,
          `File ${file.path} melanggar larangan: mengandung '${label}'`,
        ).toBe(false);
      }
    }
  });

  it("ketiga hierarchy (list_members, list_entries, entries_select) identik dan tidak memuat relaksasi is_active", () => {
    const migrationsDir = join(root, "supabase", "migrations");
    const migrationFiles = readdirSync(migrationsDir).filter((name) =>
      name.endsWith("work_calendar_team_members.sql"),
    );
    expect(migrationFiles.length).toBe(1);

    const sql = readFileSync(join(migrationsDir, migrationFiles[0]), "utf8");

    // Guard: pastikan file ini bebas dari relaksasi coalesce(is_active) atau is_active is null
    expect(sql).not.toMatch(/coalesce\s*\(\s*p\.is_active/i);
    expect(sql).not.toMatch(/coalesce\s*\(\s*child\.is_active/i);
    expect(sql).not.toMatch(/is_active\s*is\s*null/i);

    // Verifikasi klausa WHERE dari root query di dalam subordinates
    // Bentuk ini memastikan isolasi caller, pengecualian user terhapus, dan hanya true (bukan null) untuk is_active
    const rootWhere = sql.match(/where p\.parent_id = \(select auth\.uid\(\)\)\s+and p\.id <> \(select auth\.uid\(\)\)\s+and p\.deleted_at is null\s+and p\.is_active is true/g);
    expect(rootWhere).toBeTruthy();
    expect(rootWhere!.length).toBe(3);

    // Verifikasi klausa WHERE dari recursive query di dalam subordinates
    // Bentuk ini memastikan cycle protection, isolasi caller, pengecualian user terhapus, dan hanya true untuk is_active
    const recursiveWhere = sql.match(/where not \(child\.id = any\(s\.path\)\)\s+and child\.id <> \(select auth\.uid\(\)\)\s+and child\.deleted_at is null\s+and child\.is_active is true/g);
    expect(recursiveWhere).toBeTruthy();
    expect(recursiveWhere!.length).toBe(3);
  });
});

describe("Work Calendar — batas CAL-03 F4A", () => {
  it("menyimpan override dark-mode di scope Work Calendar, bukan token global", () => {
    const css = readFileSync(join(root, "src", "index.css"), "utf8");

    // Scope terang dan gelap harus ada supaya permukaan Work Calendar
    // terpisah dari halaman lain.
    expect(css).toContain(".work-calendar-scope {");
    expect(css).toContain(".dark .work-calendar-scope {");

    // Override harus berada di dalam scope, bukan mengubah `:root`/`.dark`
    // global; guard ini mencegah refactor yang menaikkan token ke global.
    const scopeBlock = css.slice(css.indexOf(".dark .work-calendar-scope {"));
    const scopeEnd = scopeBlock.indexOf("}");
    const scopeDeclarations = scopeBlock.slice(0, scopeEnd);
    for (const token of [
      "--card:",
      "--popover:",
      "--muted-foreground:",
      "--border:",
      "--input:",
      "--success:",
      "--pending:",
      "--overdue:",
      "--destructive-foreground:",
      // Regresi yang pernah terjadi: `--primary` hanya di-override di scope
      // terang, sehingga nilai terang (gelap) terbawa ke tema gelap dan
      // `text-primary` pada chip/hover hanya 3.42:1.
      "--primary:",
    ]) {
      expect(scopeDeclarations).toContain(token);
    }

    // Scope terang juga wajib menurunkan `--destructive`; tanpa itu teks
    // "Terhambat" pada chip destructive/10 hanya 4.12:1.
    const lightScope = css.slice(
      css.indexOf(".work-calendar-scope {"),
      css.indexOf(".dark .work-calendar-scope {"),
    );
    expect(lightScope).toContain("--destructive:");
    expect(lightScope).toContain("--primary:");

    // Token global tidak boleh menerima nilai spesifik Work Calendar.
    const globalRoot = css.slice(0, css.indexOf(".work-calendar-scope"));
    expect(globalRoot).not.toContain("--destructive-foreground: 222 47% 6%");
    expect(globalRoot).not.toContain("--primary: 126 55% 30%");
  });

  it("menjaga target sentuh kontrol Work Calendar minimal 44px", () => {
    const iconControls: ReadonlyArray<readonly [string, string]> = [
      ["components/WorkCalendarToolbar.tsx", 'className="h-11 w-11 shrink-0 rounded-sm"'],
      ["components/WorkEntryRow.tsx", 'className="w-11 shrink-0 rounded-sm"'],
      ["components/WorkEntryRow.tsx", '"h-11 w-11 shrink-0 justify-center rounded-sm px-0 font-medium"'],
    ];
    for (const [file, marker] of iconControls) {
      const source = readFileSync(join(featureDir, file), "utf8");
      expect(source).toContain(marker);
    }

    // Sel bulan memakai margin negatif agar area sentuh mencapai tepi sel
    // (>= 44px) pada grid 7 kolom di layar sempit.
    const month = readFileSync(join(featureDir, "components", "MonthlyWorkView.tsx"), "utf8");
    expect(month).toContain("-mx-1.5 flex min-h-touch min-w-0");
  });

  it("menyediakan kelas scope pada seluruh permukaan portal Work Calendar", () => {
    const workspace = readFileSync(
      join(featureDir, "components", "WorkCalendarWorkspace.tsx"),
      "utf8",
    );
    expect(workspace).toContain('className="sigap-page work-calendar-scope"');
    expect(workspace).toContain('className="work-calendar-scope"');

    for (const [file, marker] of [
      ["components/WorkCalendarToolbar.tsx", 'className="work-calendar-scope"'],
      ["components/WorkEntryRow.tsx", 'className="work-calendar-scope w-56"'],
    ] as const) {
      const source = readFileSync(join(featureDir, file), "utf8");
      expect(source).toContain(marker);
    }
  });

  it("judul selesai tetap memakai warna teks utama, bukan muted penuh", () => {
    const row = readFileSync(join(featureDir, "components", "WorkEntryRow.tsx"), "utf8");

    // Guard: kombinasi `text-muted-foreground` + `line-through` pada judul
    // completed membuat judul sulit dibaca di dark mode dan tidak boleh
    // kembali.
    expect(row).toContain("entry.status === \"completed\" && \"line-through decoration-muted-foreground/60\"");
    expect(row).not.toMatch(
      /entry\.status === "completed"[^\n]*text-muted-foreground/,
    );

    // Status tetap dibedakan tanpa warna: badge memakai ikon + label.
    const statusSource = readFileSync(join(featureDir, "lib", "work-entry-status.ts"), "utf8");
    expect(statusSource).toContain("badgeClassName");
    expect(statusSource).toContain("icon:");
    expect(statusSource).toContain("label:");
  });

  it("filter Tim dibangun dari entry yang sudah tersaring, bukan seluruh entry", () => {
    const hook = readFileSync(join(featureDir, "hooks", "use-work-calendar-view.ts"), "utf8");

    // Akar masalah F4A: kelompok pemilik dibangun dari `entries` yang belum
    // difilter sehingga metrik tetap menghitung anggota lain.
    const groupsCall = hook.match(
      /ownerGroups:\s*buildWorkEntryOwnerGroups\(\s*([A-Za-z0-9_.]+),/,
    );
    expect(groupsCall).not.toBeNull();
    expect(groupsCall?.[1]).toBe("visibleEntries");
    expect(hook).not.toMatch(
      /ownerGroups:\s*buildWorkEntryOwnerGroups\(\s*entries,/,
    );

    // Nilai filter yang tidak tersedia jatuh kembali ke "all" sebelum dipakai,
    // lewat satu sumber kebenaran `resolveWorkEntryOwnerFilter`.
    expect(hook).toContain("resolveWorkEntryOwnerFilter(");
    expect(hook).not.toMatch(/ownerFilterId:\s*isOwnerFilterAvailable\s*\?/);
  });

  it("status filter Tim ditentukan filter efektif, bukan jumlah kelompok", () => {
    const team = readFileSync(
      join(featureDir, "components", "TeamProgressView.tsx"),
      "utf8",
    );

    // Regresi review: `groups.length === 1` salah menandai "Semua anggota"
    // sebagai filter tunggal ketika atasan punya tepat satu bawahan.
    expect(team).not.toMatch(/isFilteredToSingleOwner\s*=\s*groups\.length\s*===\s*1/);
    expect(team).toContain("isOwnerFiltered");
    expect(team).not.toMatch(/\{\s*isOwnerFiltered\s*&&\s*groups\.length === 1\s*\}/);

    const workspace = readFileSync(
      join(featureDir, "components", "WorkCalendarWorkspace.tsx"),
      "utf8",
    );
    expect(workspace).toContain("derived.ownerFilter.isOwnerFiltered");
    expect(workspace).toContain("derived.ownerFilter.selectedOwner");

    const progress = readFileSync(join(featureDir, "lib", "work-progress.ts"), "utf8");
    expect(progress).toContain("export function resolveWorkEntryOwnerFilter");
    expect(progress).toContain("isOwnerFiltered");
  });

  it("klik judul membuka detail dan editor judul hanya lewat aksi eksplisit", () => {
    const row = readFileSync(join(featureDir, "components", "WorkEntryRow.tsx"), "utf8");

    // Kontrak review: judul adalah tombol "Buka detail pekerjaan: <judul>".
    expect(row).toContain("aria-label={`Buka detail pekerjaan: ${entry.title}`}");
    expect(row).toContain("onClick={onOpenDetail}");
    expect(row).not.toMatch(/aria-label=\{\s*readOnly\s*\?/);
    // Judul tidak lagi memulai editor inline dan tidak lagi dinonaktifkan
    // untuk entry bawahan (read-only tetap bisa membuka detail).
    const titleButton = row.slice(row.indexOf("data-testid={`work-entry-title-"));
    expect(titleButton.slice(0, 600)).not.toContain("setIsEditingTitle(true)");

    const detail = readFileSync(
      join(featureDir, "components", "WorkEntryDetail.tsx"),
      "utf8",
    );
    expect(detail).toContain("work-entry-detail-edit-title-");
    expect(detail).toContain("commitTitle");
  });

  it("tampilan Minggu membatasi preview lewat selector murni tanpa scroll internal", () => {
    const week = readFileSync(join(featureDir, "components", "WeeklyWorkView.tsx"), "utf8");
    expect(week).toContain("getWorkWeekDayPreview(");
    expect(week).toContain("work-week-more-");
    expect(week).not.toMatch(/overflow-(auto|scroll|y-auto)/);

    const progress = readFileSync(join(featureDir, "lib", "work-progress.ts"), "utf8");
    expect(progress).toContain("WORK_WEEK_PREVIEW_LIMIT_DESKTOP = 2");
    expect(progress).toContain("WORK_WEEK_PREVIEW_LIMIT_MOBILE = 2");
    expect(progress).toContain("export function getWorkWeekDayPreview");
    expect(progress).toContain("export function getWorkWeekEntryPriority");
  });

  it("aksi tambah dikendalikan satu kontrak kontekstual dan tidak tampil pada Hari", () => {
    const addAction = readFileSync(
      join(featureDir, "lib", "work-calendar-add-action.ts"),
      "utf8",
    );
    expect(addAction).toContain("shouldShowToolbarAdd");
    expect(addAction).toContain('"Tambah hari ini"');
    expect(addAction).toContain('"Tambah pekerjaan saya"');

    const toolbar = readFileSync(
      join(featureDir, "components", "WorkCalendarToolbar.tsx"),
      "utf8",
    );
    expect(toolbar).toContain("shouldShowToolbarAdd(view)");
    expect(toolbar).toContain('data-testid="work-calendar-toolbar-add"');
    // Label tidak boleh lagi berupa teks statis "Tambah".
    expect(toolbar).not.toMatch(/>\s*Tambah\s*</);

    const workspace = readFileSync(
      join(featureDir, "components", "WorkCalendarWorkspace.tsx"),
      "utf8",
    );
    expect(workspace).toContain("getWorkCalendarAddAction({");
    expect(workspace).toContain('data-testid="work-month-panel-add"');
    expect(workspace).toContain("Tambahkan pekerjaan ke tanggal ini");
  });
});

describe("Work Calendar — batas CAL-03 F4B", () => {
  it("tidak menambah migration atau menyentuh lingkungan produksi", () => {
    const migrationsDir = join(root, "supabase", "migrations");
    const names = readdirSync(migrationsDir);
    // F4B murni UI: tidak boleh ada migration baru untuk fitur ini.
    expect(names.filter((name) => /work_entry_selection|entry_selection/i.test(name))).toEqual([]);
  });

  it("selection entry memakai query `entry` dan tidak menambah key lain", () => {
    const selection = readFileSync(
      join(featureDir, "lib", "work-entry-selection.ts"),
      "utf8",
    );
    expect(selection).toContain('WORK_ENTRY_QUERY_KEY = "entry"');
    expect(selection).not.toMatch(/WORK_ENTRY_QUERY_KEY = "(?!entry)/);

    const routeState = readFileSync(
      join(featureDir, "hooks", "use-work-calendar-route-state.ts"),
      "utf8",
    );
    expect(routeState).toContain("writeEntryId(entryId");
    expect(routeState).toContain("readEntryId(");
    // Penulisan entry hanya menyentuh kuncinya sendiri.
    const writer = routeState.slice(routeState.indexOf("writeEntryId(entryId"));
    expect(writer.slice(0, 500)).toContain("params.delete(WORK_ENTRY_QUERY_KEY)");
    expect(writer.slice(0, 500)).toContain("params.set(WORK_ENTRY_QUERY_KEY, normalized)");
    expect(writer.slice(0, 500)).not.toContain('params.delete("date")');
    expect(writer.slice(0, 500)).not.toContain('params.delete("view")');
  });

  it("motion memakai Framer Motion terbatas tanpa animasi layout besar", () => {
    const motion = readFileSync(
      join(featureDir, "components", "WorkCalendarMotion.tsx"),
      "utf8",
    );
    expect(motion).toContain("useReducedMotion");
    expect(motion).toContain("AnimatePresence");
    // Tidak ada animasi layout (`layout`/`layoutId`) yang dapat mengganggu.
    // Pola sengaja mencari pemakaian prop, bukan penyebutan di dokumentasi.
    expect(motion).not.toMatch(/layoutId\s*[:=]/);
    expect(motion).not.toMatch(/layout\s*=/);
  });

  it("detail memakai primitive modal Radix, bukan dialog dan focus trap buatan", () => {
    const detail = readFileSync(
      join(featureDir, "components", "WorkEntryDetail.tsx"),
      "utf8",
    );
    // Perilaku modal didelegasikan ke primitive, bukan diimplementasikan ulang.
    expect(detail).toContain("<WorkCalendarModal");
    expect(detail).not.toContain('role="dialog"');
    expect(detail).not.toContain("useWorkCalendarFocusTrap");
    // Escape/overlay/panel tidak lagi ditangani sendiri di komponen ini.
    expect(detail).not.toContain('event.key !== "Escape"');
    // Lebar side sheet desktop/tablet.
    expect(detail).toContain("sm:min-w-[480px]");
    expect(detail).toContain("sm:w-[min(560px,92vw)]");
  });

  it("primitive modal memakai Radix Dialog + forceMount tanpa overlay/focus trap ganda", () => {
    const modal = readFileSync(
      join(featureDir, "components", "WorkCalendarModal.tsx"),
      "utf8",
    );
    expect(modal).toContain('from "@radix-ui/react-dialog"');
    expect(modal).toContain("DialogPrimitive.Portal");
    // `forceMount` wajib agar Radix tidak melepas DOM sebelum exit Framer.
    expect(modal).toContain("forceMount");
    // Radix tidak menetapkan aria-modal; primitive ini menetapkannya.
    expect(modal).toContain("aria-modal={true}");
    // Tidak ada focus trap atau kunci scroll buatan sendiri.
    expect(modal).not.toContain("useWorkCalendarFocusTrap");
    expect(modal).not.toContain("data-scroll-locked");

    // Hook focus trap buatan sudah dihapus dari fitur.
    expect(
      existsSync(join(featureDir, "hooks", "use-work-calendar-focus-trap.ts")),
    ).toBe(false);
  });

  it("Quick Add dan editor lengkap memakai primitive modal yang sama", () => {
    const surface = readFileSync(
      join(featureDir, "components", "QuickAddSurface.tsx"),
      "utf8",
    );
    expect(surface).toContain("<WorkCalendarModal");
    expect(surface).not.toContain('role="dialog"');

    const createDialog = readFileSync(
      join(featureDir, "components", "WorkEntryCreateDialog.tsx"),
      "utf8",
    );
    expect(createDialog).toContain("<WorkCalendarModal");
    expect(createDialog).not.toContain('role="dialog"');
    // Satu createEntry per simpan dan Batal tidak membuat entry.
    expect(createDialog).toContain("submittingRef");
    expect(createDialog).toContain("validateWorkEntryInput");
  });

  it("Quick Add tidak memakai drawer pihak ketiga dan aman virtual keyboard", () => {
    const surface = readFileSync(
      join(featureDir, "components", "QuickAddSurface.tsx"),
      "utf8",
    );
    // Tidak memakai vaul/drawer; mobile memakai bottom sheet sendiri.
    expect(surface).not.toMatch(/from ["']vaul["']/);
    expect(surface).not.toMatch(/from ["']@\/components\/ui\/drawer["']/);
    expect(surface).toContain("max-h-[85dvh]");
    expect(surface).toContain("PopoverAnchor");
    expect(surface).toContain("virtualRef");

    const panel = readFileSync(
      join(featureDir, "components", "QuickAddPanel.tsx"),
      "utf8",
    );
    // Anti double-submit dan tanggal target selalu terlihat.
    expect(panel).toContain("submittingRef");
    expect(panel).toContain("work-calendar-quick-add-date");
    expect(panel).toContain('event.key === "Enter"');
    expect(panel).toContain('event.key === "Escape"');
  });

  it("permukaan Minggu/Bulan menghentikan propagasi agar tidak ada entry ganda", () => {
    const week = readFileSync(
      join(featureDir, "components", "WeeklyWorkView.tsx"),
      "utf8",
    );
    expect(week).toContain("work-week-quick-add-");
    expect(week).toContain("event.stopPropagation()");
    expect(week).toContain("event.defaultPrevented");

    const month = readFileSync(
      join(featureDir, "components", "MonthlyWorkView.tsx"),
      "utf8",
    );
    expect(month).toContain("work-month-quick-add-");
    expect(month).toContain("work-month-preview-");
    expect(month).toContain("event.stopPropagation()");
    expect(month).toContain("event.defaultPrevented");
  });

  it("permukaan fixed dipindahkan ke body agar tidak terkena `space-y-5` `.sigap-page`", () => {
    const modal = readFileSync(
      join(featureDir, "components", "WorkCalendarModal.tsx"),
      "utf8",
    );
    // Regresi layout: `.sigap-page` memakai `space-y-5`, sehingga anak kedua
    // dan seterusnya mendapat `margin-top: 20px`. Overlay/sheet `fixed` yang
    // tetap menjadi anaknya bergeser 20px (terpotong) dan overlay menyisakan
    // celah yang tidak menutup. Solusinya portal Radix ke `document.body`.
    expect(modal).toContain("DialogPrimitive.Portal");

    // Motion tidak lagi memuat portal/overlay/panel manual.
    const motion = readFileSync(
      join(featureDir, "components", "WorkCalendarMotion.tsx"),
      "utf8",
    );
    expect(motion).not.toContain("createPortal");
    expect(motion).not.toContain("renderFixedSurface");
    expect(motion).not.toContain("WorkCalendarOverlay");
    expect(motion).not.toContain("WorkCalendarSlidePanel");
  });
});

describe("Work Calendar — batas CAL-03 F5 siklus hidup", () => {
  it("hanya satu migration siklus hidup dan selaras dengan domain", () => {
    const migrationsDir = join(root, "supabase", "migrations");
    const files = readdirSync(migrationsDir).filter((name) =>
      name.endsWith("work_calendar_lifecycle.sql"),
    );
    expect(files.length).toBe(1);

    const sql = readFileSync(join(migrationsDir, files[0]), "utf8");

    // Kolom siklus hidup.
    expect(sql).toContain("add column if not exists due_date date null");
    expect(sql).toContain("add column if not exists color_swatch text null");

    // Palet warna frontend harus sama dengan check constraint database.
    for (const swatch of WORK_ENTRY_COLOR_SWATCHES) {
      expect(sql).toContain(`'${swatch}'`);
    }

    // Tabel histori dan jenis peristiwanya.
    expect(sql).toContain("create table if not exists public.work_calendar_events");
    for (const eventType of WORK_ENTRY_EVENT_TYPES) {
      expect(sql).toContain(`'${eventType}'`);
    }

    // Riwayat append-only lewat trigger definer, bukan tulis dari klien.
    expect(sql).toContain("security definer");
    expect(sql).toContain("create trigger trg_work_calendar_entries_log_event");
    expect(sql).toContain("revoke all on public.work_calendar_events from public, anon, authenticated");
    // Anti-duplikasi: satu peristiwa created per pekerjaan.
    expect(sql).toContain("uq_work_calendar_events_created");
  });

  it("editor dan dialog membuat memakai pemilih warna statis aksesibel", () => {
    const picker = readFileSync(
      join(featureDir, "components", "WorkEntryColorPicker.tsx"),
      "utf8",
    );
    // Grup radio asli: label teks wajib, bukan warna saja.
    expect(picker).toContain('type="radio"');
    expect(picker).toContain("Tanpa penanda");
    expect(picker).toContain("WORK_ENTRY_COLOR_META");

    for (const file of ["WorkEntryEditor.tsx", "WorkEntryCreateDialog.tsx"]) {
      const source = readFileSync(join(featureDir, "components", file), "utf8");
      expect(source).toContain("<WorkEntryColorPicker");
    }
  });

  it("aksi siklus hidup selalu PATCH pada baris yang sama, tidak pernah createEntry", () => {
    const actions = readFileSync(
      join(featureDir, "components", "WorkEntryLifecycleActions.tsx"),
      "utf8",
    );
    expect(actions).not.toContain("createEntry");
    expect(actions).toContain("buildContinueTodayPatch");
    expect(actions).toContain("buildCompletePatch");
    expect(actions).toContain("buildBlockedPatch");

    const workspace = readFileSync(
      join(featureDir, "components", "WorkCalendarWorkspace.tsx"),
      "utf8",
    );
    expect(workspace).toContain("handleQuickSaveDetail");
    // Aksi cepat tidak menutup panel supaya timeline tetap terlihat.
    const quickSave = workspace.slice(workspace.indexOf("const handleQuickSaveDetail"));
    expect(quickSave.slice(0, 400)).not.toContain("closeEntryDetail");
  });

  it("detail menampilkan timeline dari repository, bukan data statis", () => {
    const detail = readFileSync(
      join(featureDir, "components", "WorkEntryDetail.tsx"),
      "utf8",
    );
    expect(detail).toContain("<WorkEntryTimeline");
    expect(detail).toContain("events={events}");

    const workspace = readFileSync(
      join(featureDir, "components", "WorkCalendarWorkspace.tsx"),
      "utf8",
    );
    expect(workspace).toContain("listEntryEvents(");
    expect(workspace).toContain("events={entryEvents}");
  });
});

describe("Work Calendar — batas CAL-03 F6 hari kerja dan libur", () => {
  const migrationsDir = join(root, "supabase", "migrations");

  it("hanya satu migration hari libur dan selaras dengan domain", () => {
    const files = readdirSync(migrationsDir).filter((name) =>
      name.endsWith("work_calendar_holidays.sql"),
    );
    expect(files.length).toBe(1);

    const sql = readFileSync(join(migrationsDir, files[0]), "utf8");

    // Tabel hari libur dengan kolom yang diwajibkan.
    expect(sql).toContain("create table if not exists public.holidays");
    expect(sql).toContain("holiday_date date not null");
    expect(sql).toContain("name text not null");
    expect(sql).toContain("is_cuti_bersama boolean not null default false");
    // Satu libur per tanggal supaya impor idempotent.
    expect(sql).toContain("unique (holiday_date)");

    // RLS: baca untuk authenticated, tulis hanya admin.
    expect(sql).toContain("alter table public.holidays enable row level security");
    expect(sql).toContain("create policy holidays_select_authenticated");
    expect(sql).toContain("create policy holidays_admin_write");
    expect(sql).toContain("p.role = 'admin'");

    // Pengaturan hari/jam kerja diturunkan dari KPI existing dengan default
    // Senin-Jumat, bukan nilai yang di-hardcode di frontend.
    expect(sql).toContain("create or replace function public.get_work_calendar_work_settings()");
    expect(sql).toContain("public.department_kpi_configs");
    expect(sql).toContain("array[1, 2, 3, 4, 5]");
    expect(sql).toContain("coalesce(v_work_start, time '08:00')");
    expect(sql).toContain("coalesce(v_timezone, 'Asia/Jakarta')");
  });

  it("mekanisme impor tersedia, default dry-run, dan menolak non-staging", () => {
    const importer = readFileSync(join(root, "scripts", "import-holidays.mjs"), "utf8");
    expect(importer).toContain("--apply");
    expect(importer).toContain("MARISON_DEPLOYMENT_ENVIRONMENT");
    expect(importer).toContain('environment !== "staging"');
    expect(importer).toContain("onConflict");
    // Tidak pernah mencetak credential.
    expect(importer).not.toContain("console.log(stagingServiceKey");
    expect(importer).not.toContain("console.log(stagingUrl");

    // Contoh data tersedia untuk operator.
    const sample = readFileSync(
      join(root, "supabase", "data", "holidays.example.csv"),
      "utf8",
    );
    expect(sample).toContain("holiday_date");
    expect(sample).toContain("is_cuti_bersama");
  });

  it("hanya lib yang diimpor frontend; komponen tidak menulis holidays", () => {
    const dataFiles = runtimeFiles.filter((file) =>
      file.path.startsWith("src/features/work-calendar/data/"),
    );
    // Jalur data hanya membaca: tidak ada insert/update/delete pada holidays.
    for (const file of dataFiles) {
      if (!file.source.includes("holidays")) continue;
      expect(file.source).not.toContain('.insert(');
      expect(file.source).not.toContain('.update(');
      expect(file.source).not.toContain('.delete(');
    }
  });

  it("default frontend sama dengan default database (Senin-Jumat 08:00-17:00)", () => {
    const lib = readFileSync(join(featureDir, "lib", "work-day-config.ts"), "utf8");
    expect(lib).toContain("workDays: Object.freeze([1, 2, 3, 4, 5])");
    expect(lib).toContain('workStart: "08:00"');
    expect(lib).toContain('workEnd: "17:00"');
    expect(lib).toContain('breakStart: "12:00"');
    expect(lib).toContain('breakEnd: "13:00"');
    expect(lib).toContain('timezone: "Asia/Jakarta"');
  });

  it("tampilan Hari/Minggu/Bulan memakai klasifikasi yang sama, bukan warna saja", () => {
    for (const file of ["WeeklyWorkView.tsx", "MonthlyWorkView.tsx"]) {
      const source = readFileSync(join(featureDir, "components", file), "utf8");
      expect(source).toContain("WorkCalendarDayBadge");
      expect(source).toContain("getWorkCalendarDaySurfaceClassName");
      expect(source).toContain("data-day-kind");
    }

    const daily = readFileSync(join(featureDir, "components", "DailyWorkView.tsx"), "utf8");
    expect(daily).toContain("work-day-note");
    expect(daily).toContain("Pekerjaan tetap dapat ditambahkan");

    const badge = readFileSync(
      join(featureDir, "components", "WorkCalendarDayBadge.tsx"),
      "utf8",
    );
    // Label teks selalu tersedia, bukan warna saja.
    expect(badge).toContain("meta.label");
    expect(badge).toContain("data-day-kind");
  });

  it("workspace memuat pengaturan lewat repository dan mendukung override test", () => {
    const workspace = readFileSync(
      join(featureDir, "components", "WorkCalendarWorkspace.tsx"),
      "utf8",
    );
    expect(workspace).toContain("settingsRepository.getWorkSettings(");
    expect(workspace).toContain("settingsRepository.listHolidays(");
    expect(workspace).toContain("buildWorkCalendarDayMetaMap(");
    expect(workspace).toContain("workSettingsOverride");
    expect(workspace).toContain("holidaysOverride");

    // Halaman produksi menyambungkan repository nyata.
    const page = readFileSync(
      join(root, "src", "pages", "work-calendar", "WorkCalendarPage.tsx"),
      "utf8",
    );
    expect(page).toContain("createSupabaseWorkCalendarSettingsRepository");
    expect(page).toContain("settingsRepository={settingsRepository}");
  });
});

describe("Work Calendar — batas CAL-03 F7 dashboard dan notifikasi", () => {
  const migrationsDir = join(root, "supabase", "migrations");

  it("hanya satu migration notifikasi dan memakai tabel notifications bersama", () => {
    const files = readdirSync(migrationsDir).filter((name) =>
      name.endsWith("work_calendar_notifications.sql"),
    );
    expect(files.length).toBe(1);

    const sql = readFileSync(join(migrationsDir, files[0]), "utf8");

    // Reuse tabel `notifications`, bukan tabel baru.
    expect(sql).toContain("create table if not exists public.notifications");
    expect(sql).toContain("create unique index if not exists uq_notifications_work_calendar_dedupe");
    expect(sql).toContain("(data->>'dedupe_key')");
    expect(sql).toContain("create index if not exists idx_notifications_work_calendar_category");

    // Generator on-demand, idempotent, dan aman.
    expect(sql).toContain("create or replace function public.generate_work_calendar_notifications");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("when unique_violation then");
  });

  it("helper internal tidak diekspos dan hanya tiga RPC publik yang diberi grant", () => {
    const sql = readFileSync(
      join(migrationsDir, "20260918120000_work_calendar_notifications.sql"),
      "utf8",
    );

    // Helper p_user_id tidak boleh bisa dipanggil klien.
    expect(sql).toContain(
      "revoke all on function public.work_calendar_emit_notification(uuid, text, text, text, text, text, text, uuid[], integer) from public, anon, authenticated",
    );

    const grants = [...sql.matchAll(/grant execute on function public\.([a-z_]+)\(/g)].map(
      (match) => match[1],
    );
    expect(grants.sort()).toEqual([
      "generate_work_calendar_notifications",
      "get_my_recent_work_calendar_events",
      "get_work_calendar_dashboard_entries",
    ]);
  });

  it("anti-spam memakai debounce jam dan batching satu notifikasi per kategori per hari", () => {
    const sql = readFileSync(
      join(migrationsDir, "20260918120000_work_calendar_notifications.sql"),
      "utf8",
    );

    expect(sql).toContain("p_debounce_hours integer default 6");
    expect(sql).toContain("make_interval(hours => greatest(p_debounce_hours, 0))");
    expect(sql).toContain("'work-calendar:deadline_overdue:' || v_user::text || ':' || v_today::text");
    expect(sql).toContain("'work-calendar:follow_up_reminder:' || v_user::text || ':' || v_today::text");
    expect(sql).toContain("'work-calendar:blocked_escalation:' || v_user::text || ':' || v_today::text");
  });

  it("eskalasi ke atasan memakai hari kerja dan mengabaikan weekend serta libur", () => {
    const sql = readFileSync(
      join(migrationsDir, "20260918120000_work_calendar_notifications.sql"),
      "utf8",
    );

    expect(sql).toContain("create or replace function public.work_calendar_count_work_days");
    expect(sql).toContain("extract(isodow from day)::integer");
    expect(sql).toContain("from public.holidays h");
    expect(sql).toContain("public.work_calendar_work_days_for_user(v_user)");
    expect(sql).toContain("with recursive subordinates as");

    // Helper hari kerja tidak diberi hak ke authenticated.
    expect(sql).toContain(
      "revoke all on function public.work_calendar_count_work_days(date, date, integer[]) from public, anon, authenticated",
    );
  });

  it("migration F7 diuji lewat test SQL khusus dan ikut harness", () => {
    const testSql = readFileSync(
      join(root, "supabase", "tests", "work_calendar_notifications.integration.sql"),
      "utf8",
    );
    expect(testSql).toContain("all assertions passed");
    expect(testSql).toContain("deadline_overdue");
    expect(testSql).toContain("blocked_escalation");

    const harness = readFileSync(
      join(root, "scripts", "test-work-calendar-sql.mjs"),
      "utf8",
    );
    expect(harness).toContain("CAL-03 work calendar notifications integration: all assertions passed");
    expect(harness).toContain('name.includes("work_calendar")');
  });

  it("widget dan notifikasi memakai helper murni lintas permukaan", () => {
    // Widget dashboard dirender di Dashboard, bukan ditanam di feature dir.
    const dashboard = readFileSync(
      join(root, "src", "components", "dashboard", "Dashboard.tsx"),
      "utf8",
    );
    expect(dashboard).toContain("<WorkCalendarDashboardWidget");
    expect(dashboard).toContain("buildWorkCalendarDashboardSummary(");

    // Lonceng: badge angka + ikon kategori kalender dari helper murni.
    const header = readFileSync(
      join(root, "src", "components", "layout", "Header.tsx"),
      "utf8",
    );
    expect(header).toContain('data-testid="notification-unread-badge"');
    expect(header).toContain("formatUnreadBadge(unreadCount)");
    expect(header).not.toMatch(/unreadCount\s*>\s*0\s*&&\s*\(\s*<span className="absolute top-1\.5/);
    expect(header).toContain("getWorkCalendarNotificationMeta");
    expect(header).toContain("readWorkCalendarNotificationCategory");

    // Generator dijalankan on-demand sebelum daftar dimuat.
    expect(header).toContain("generateWorkCalendarNotifications");

    // Aktivitas Terbaru menggabungkan work_calendar_events.
    const recent = readFileSync(
      join(root, "src", "components", "dashboard", "RecentActivity.tsx"),
      "utf8",
    );
    expect(recent).toContain("work_calendar_events");

    const service = readFileSync(
      join(root, "src", "services", "dashboard.service.ts"),
      "utf8",
    );
    expect(service).toContain("listRecentActivity");
  });

  it("repository dashboard hanya memanggil RPC publik dan tidak menulis tabel", () => {
    const source = readFileSync(
      join(featureDir, "data", "supabase-work-calendar-dashboard-repository.ts"),
      "utf8",
    );

    for (const rpc of [
      "get_work_calendar_dashboard_entries",
      "get_my_recent_work_calendar_events",
      "generate_work_calendar_notifications",
    ]) {
      expect(source).toContain(`"${rpc}"`);
    }
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain("work_calendar_emit_notification");
  });
});

describe("Work Calendar — batas CAL-03 F8 penutupan produk", () => {
  it("menyediakan manual singkat Kalender dan menautkannya dari indeks dokumentasi", () => {
    const manual = readFileSync(join(root, "docs", "CAL-03_WORK_CALENDAR.md"), "utf8");

    // Manual harus menyebut seluruh fase F1–F7 supaya pembaca dapat menelusuri
    // lingkup fitur tanpa membuka riwayat commit.
    for (const phase of ["F1", "F2", "F3", "F4A", "F4B", "F5", "F6", "F7"]) {
      expect(manual).toContain(phase);
    }
    expect(manual).toContain("/calendar");
    expect(manual).toContain("generate_work_calendar_notifications");
    expect(manual).toContain("get_work_calendar_dashboard_entries");
    expect(manual).toContain("get_my_recent_work_calendar_events");

    const readme = readFileSync(join(root, "docs", "README.md"), "utf8");
    expect(readme).toContain("CAL-03_WORK_CALENDAR.md");
  });

  it("mencatat CAL-03 F1–F8 pada riwayat rilis production", () => {
    const changelog = readFileSync(join(root, "docs", "versi", "changelog.md"), "utf8");

    const upcomingStart = changelog.indexOf("## 2. Rilis Mendatang");
    const releaseHistoryStart = changelog.indexOf("## 3. Riwayat Rilis");
    expect(upcomingStart).toBeGreaterThan(-1);
    expect(releaseHistoryStart).toBeGreaterThan(upcomingStart);

    const upcoming = changelog.slice(upcomingStart, releaseHistoryStart);
    expect(upcoming).toContain("Tidak ada kandidat rilis yang belum dipromosikan");

    const releaseHistory = changelog.slice(releaseHistoryStart);
    expect(releaseHistory).toContain("CAL-03");
    expect(releaseHistory).toContain("2026-09-23");
    expect(releaseHistory).toContain("#333");
    for (const phase of ["F1", "F2", "F3", "F4A", "F4B", "F5", "F6", "F7", "F8"]) {
      expect(releaseHistory).toContain(phase);
    }
    expect(releaseHistory).toContain("Alur registrasi bertahap");
  });

  it("tidak menambah migration atau kolom database baru pada fase penutupan", () => {
    const migrationsDir = join(root, "supabase", "migrations");
    const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));

    // Snapshot migration CAL-03 dibekukan pada penutupan: F2 entries, F3 team
    // members, F4A team overview + scale, F5 lifecycle, F6 holidays, F7
    // notifications. CAL-04 is tested separately by its carryover SQL contract.
    const cal03Migrations = migrations.filter((name) =>
      name.includes("work_calendar") && name.slice(0, 14) <= "20260918120000",
    ).sort();
    expect(cal03Migrations).toEqual([
      "20260915072607_work_calendar_entries.sql",
      "20260915093000_work_calendar_team_members.sql",
      "20260916170000_work_calendar_team_overview.sql",
      "20260916171000_work_calendar_team_overview_scale.sql",
      "20260917120000_work_calendar_lifecycle.sql",
      "20260918090000_work_calendar_holidays.sql",
      "20260918120000_work_calendar_notifications.sql",
    ]);
  });

  it("menjaga audit aksesibilitas F8 tetap mencakup dark mode dan seluruh fase", () => {
    const audit = readFileSync(join(root, "src", "test", "cal-03-f8-accessibility.test.tsx"), "utf8");
    expect(audit).toContain(".dark .work-calendar-scope");
    expect(audit).toContain("contrastRatio");
    expect(audit).toContain("workspace");
  });
});
