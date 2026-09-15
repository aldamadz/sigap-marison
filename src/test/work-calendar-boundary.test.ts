import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORK_CALENDAR_LEGACY_IMPORT_MARKERS,
  findLegacyWorkCalendarImports,
} from "@/features/work-calendar/testing/work-calendar-fixtures";

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

describe("Work Calendar — batas modul CAL-03 F1", () => {
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

  it("tidak memanggil Supabase, React Query, atau klien HTTP", () => {
    const forbidden = [/@supabase\//, /@tanstack\/react-query/, /from "@\/lib\/supabase"/, /\baxios\b/];
    const offenders = runtimeFiles
      .filter((file) => forbidden.some((pattern) => pattern.test(file.source)))
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
    // Komentar dokumentasi boleh menyebut fixture; yang dilarang adalah ekspor.
    const barrelCode = (barrel?.source ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(barrelCode).not.toContain("testing/");
    expect(barrelCode).not.toContain("createFixtureWorkEntryRepository");
  });

  it("tidak terpasang pada route aplikasi", () => {
    const app = readFileSync(join(root, "src", "App.tsx"), "utf8");
    expect(app).not.toContain("features/work-calendar");
    expect(app).toContain('<Route path="/agenda"');
  });
});
