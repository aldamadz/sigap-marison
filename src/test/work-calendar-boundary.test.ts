import { readdirSync, readFileSync, statSync } from "node:fs";
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
import { WORK_ENTRY_KINDS, WORK_ENTRY_STATUSES } from "@/features/work-calendar/types/work-calendar";

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
    expect(app).toContain('<Route path="/calendar" element={<WorkCalendarPage />} />');
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
      "src/test/work-calendar-boundary.test.ts",
      "src/test/work-calendar-lib.test.ts",
      "src/test/work-calendar-page.test.tsx",
      "src/test/work-calendar-profile-repository.test.ts",
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
      ["components/WorkCalendarToolbar.tsx", 'className="w-11 shrink-0 rounded-sm"'],
      ["components/WorkEntryRow.tsx", 'className="w-11 shrink-0 rounded-sm"'],
      ["components/WorkEntryRow.tsx", '"h-11 min-w-touch gap-1.5 rounded-sm px-2 font-medium"'],
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
    expect(progress).toContain("WORK_WEEK_PREVIEW_LIMIT_DESKTOP = 4");
    expect(progress).toContain("WORK_WEEK_PREVIEW_LIMIT_MOBILE = 3");
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
