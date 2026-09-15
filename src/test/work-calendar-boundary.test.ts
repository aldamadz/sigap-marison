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

  it("ketiga hierarchy (list_members, list_entries, entries_select) identik dan tidak drift", () => {
    const migrationsDir = join(root, "supabase", "migrations");
    const migrationFiles = readdirSync(migrationsDir).filter((name) =>
      name.endsWith("work_calendar_team_members.sql"),
    );
    expect(migrationFiles.length).toBe(1);

    const sql = readFileSync(join(migrationsDir, migrationFiles[0]), "utf8");

    // Verifikasi klausa WHERE dari root query di dalam subordinates
    const rootWhere = sql.match(/where p\.parent_id = \(select auth\.uid\(\)\)\s+and p\.id <> \(select auth\.uid\(\)\)\s+and p\.deleted_at is null\s+and p\.is_active is true/g);
    expect(rootWhere).toBeTruthy();
    expect(rootWhere!.length).toBe(3);

    // Verifikasi klausa WHERE dari recursive query di dalam subordinates
    const recursiveWhere = sql.match(/where not \(child\.id = any\(s\.path\)\)\s+and child\.id <> \(select auth\.uid\(\)\)\s+and child\.deleted_at is null\s+and child\.is_active is true/g);
    expect(recursiveWhere).toBeTruthy();
    expect(recursiveWhere!.length).toBe(3);
  });
});
