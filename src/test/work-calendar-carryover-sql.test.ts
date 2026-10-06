import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = join(process.cwd(), "supabase", "migrations");
const migrationName = "20261006080000_work_calendar_carryover_deadlines.sql";
const source = (name: string) => readFileSync(join(migrationDir, name), "utf8").replace(/\r\n/g, "\n");
const sql = source(migrationName);
const canonicalFiles: Record<string, string> = {
  list_work_calendar_team_entries: "20260915093000_work_calendar_team_members.sql",
  list_work_calendar_team_overview: "20260916171000_work_calendar_team_overview_scale.sql",
  list_work_calendar_member_entries: "20260916170000_work_calendar_team_overview.sql",
  get_work_calendar_dashboard_entries: "20260918120000_work_calendar_notifications.sql",
  generate_work_calendar_notifications: "20260918120000_work_calendar_notifications.sql",
};

function definition(text: string, name: string): string {
  const start = text.indexOf(`create or replace function public.${name}(`);
  const end = text.indexOf("\n$$;", start);
  if (start < 0 || end < start) throw new Error(`Missing complete definition: ${name}`);
  return text.slice(start, end + 4);
}

function recursiveCte(text: string): string | null {
  // These canonical CTEs contain no nested CTE definitions.
  return text.match(/with recursive (?:authorized|subordinates) as \([\s\S]*?\n {4}\)/)?.[0] ?? null;
}

describe("forward-only calendar carryover SQL", () => {
  it("contains exactly five full canonical replacements and no migration-time writes/privilege changes", () => {
    const executable = sql.replace(/^--.*$/gm, "").trim();
    expect(executable.startsWith("begin;")).toBe(true);
    expect(executable.endsWith("commit;")).toBe(true);
    expect([...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]).sort())
      .toEqual(Object.keys(canonicalFiles).sort());
    let topLevel = executable;
    for (const name of Object.keys(canonicalFiles)) topLevel = topLevel.replace(definition(sql, name), "");
    expect(topLevel.replace(/(?:begin|commit);/g, "").trim()).toBe("");
    expect(sql).not.toMatch(/\b(?:pg_get_functiondef|regexp_replace|execute\s+format|create\s+policy|grant\s+execute)\b/i);
    expect(sql).not.toMatch(/coalesce\(\s*e\.due_date\s*,\s*e\.work_date\s*\)/i);
  });

  for (const [name, canonicalFile] of Object.entries(canonicalFiles)) {
    it(`preserves ${name} signature, security mode, authorization and ordering`, () => {
      const before = definition(source(canonicalFile), name);
      const after = definition(sql, name);
      expect(after.slice(0, after.indexOf("as $$"))).toBe(before.slice(0, before.indexOf("as $$")));
      expect(recursiveCte(after)).toBe(recursiveCte(before));
      expect(after).not.toMatch(/\b(?:insert into|update public|delete from)\b/i);
      if (name !== "generate_work_calendar_notifications") {
        const lastOrder = before.lastIndexOf("\n    order by");
        expect(after.slice(after.lastIndexOf("\n    order by"))).toBe(before.slice(lastOrder));
      }
    });
  }

  it("retains ranked pagination and whole-filter aggregates verbatim", () => {
    const name = "list_work_calendar_team_overview";
    const before = definition(source(canonicalFiles[name]), name);
    const after = definition(sql, name);
    expect(after.slice(after.indexOf("    filtered as ("))).toBe(before.slice(before.indexOf("    filtered as (")));
    expect(after).toContain("e.due_date is not null and e.due_date < v_today");
  });

  it("caps carryover at today/Jakarta completion and never promotes a missing completion timestamp", () => {
    for (const name of ["list_work_calendar_team_entries", "list_work_calendar_team_overview", "list_work_calendar_member_entries"]) {
      const body = definition(sql, name);
      expect(body).toContain("kind = 'work'");
      expect(body).toMatch(/completed_at at time zone 'Asia\/Jakarta'\)::date >=/);
      expect(body).not.toMatch(/coalesce\([^)]*completed_at/);
      expect(body).toContain("status <> 'completed'");
      expect(body).toMatch(/<= (?:v_today|\(now\(\) at time zone 'Asia\/Jakarta'\)::date)/);
    }
    const dashboard = definition(sql, "get_work_calendar_dashboard_entries");
    expect(dashboard).toContain("e.due_date is not null and e.due_date < p_today");
    expect(dashboard).toContain("e.kind = 'work'");
    const generator = definition(sql, "generate_work_calendar_notifications");
    expect(generator).toContain("and e.due_date is not null");
    expect(generator).toContain("and e.due_date < v_today");
    expect(generator.match(/e\.kind = 'work'/g)).toHaveLength(2);
    expect(generator.match(/public\.work_calendar_emit_notification\(/g)).toHaveLength(3);
  });

  it("is the last checked-in definition, including production recovery migrations", () => {
    const migrations = readdirSync(migrationDir).filter((file) => file.endsWith(".sql"))
      .map((file) => ({ file, sql: source(file) }));
    for (const name of Object.keys(canonicalFiles)) {
      const definingFiles = migrations.filter((migration) =>
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "i").test(migration.sql),
      ).map((migration) => migration.file).sort();
      expect(definingFiles.at(-1)).toBe(migrationName);
    }
  });

  it("defaults to sequential baseline/carryover children before any outer database setup", () => {
    const runner = readFileSync(join(process.cwd(), "scripts", "test-work-calendar-sql.mjs"), "utf8");
    expect(runner).toContain('const mode = process.argv[2] ?? "--all";');
    const start = runner.indexOf('if (mode === "--all") {');
    const setup = runner.indexOf("const migrationFiles = readdirSync");
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(setup);
    const orchestration = runner.slice(start, setup);
    expect(orchestration).toContain('for (const suite of ["--baseline", "--carryover"])');
    expect(orchestration).toContain('spawnSync(process.execPath, [process.argv[1], suite], { stdio: "inherit" })');
    expect(orchestration).toContain("if (result.error) throw result.error;");
    expect(orchestration).toContain("if (result.status !== 0) process.exit(result.status ?? 1);");
    expect(orchestration).toContain("process.exit(0);");
  });

  it("keeps old SQL assertions intact and exposes explicit baseline/carryover runner modes", () => {
    const runner = readFileSync(join(process.cwd(), "scripts", "test-work-calendar-sql.mjs"), "utf8");
    expect(runner).toContain('"--baseline"');
    expect(runner).toContain('"--carryover"');
    expect(runner).toContain("calendar_rpc_contract_before");
    expect(runner).toContain("calendar_policies_before");
    expect(runner).toContain("postgres:17-alpine");
    const integration = readFileSync(join(process.cwd(), "supabase", "tests", "work_calendar_carryover_deadlines.integration.sql"), "utf8");
    expect(integration).toContain("legacy completed null");
    expect(integration).toContain("completed Jakarta midnight");
    expect(integration).toContain("set local timezone = 'America/Los_Angeles'");
    expect(integration).toContain("rollback;");
  });
});
