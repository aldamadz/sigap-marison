import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Hybrid Marison master sync", () => {
  it("keeps local UUID relations and adds review plus a database sync lock", () => {
    const migration = read("supabase/migrations/20260725190000_hybrid_marison_master_sync.sql");

    expect(migration).toContain("marison_hierarchy_confirmed");
    expect(migration).toContain("marison_review_required");
    expect(migration).toContain("marison_review_reasons");
    expect(migration).toContain("marison_sync_runs_one_active_uidx");
    expect(migration).toContain("marison_sync_issues_open_uidx");
    expect(migration).toContain("create policy master_offices_admin_insert");
    expect(migration).not.toContain("alter column id");
  });

  it("runs the staging cron at midnight Jakarta through the internal tracked route", () => {
    const worker = read("server/marison-sync-worker.mjs");
    const server = read("server.mjs");
    const compose = read("docker-compose.staging.yml");

    expect(worker).toContain('const timeZone = "Asia/Jakarta"');
    expect(worker).toContain('parts.hour === "00" && parts.minute === "00"');
    expect(server).toContain("/api/internal/marison/directory-sync");
    expect(server).toContain('triggerType: "cron"');
    expect(server).toContain('scope: "projects"');
    expect(compose).toContain("agenda-marison-sync-staging:");
    expect(compose).toContain('MARISON_SYNC_ENABLED: "true"');
  });

  it("fetches branches before employees and never resets an existing password", () => {
    const server = read("server.mjs");
    const sync = read("server/marison-employee-sync.mjs");

    const sourceLoader = server.slice(
      server.indexOf("const getMarisonEmployeeSyncSource"),
      server.indexOf("const getMarisonBranchSyncSource"),
    );
    expect(sourceLoader.indexOf('"/branches"')).toBeLessThan(sourceLoader.indexOf('"/employees"'));

    const existingAuthUpdate = sync.slice(
      sync.indexOf("const authUpdates = {"),
      sync.indexOf("} else {", sync.indexOf("const authUpdates = {")),
    );
    expect(existingAuthUpdate).not.toContain("password:");
  });

  it("adds tracked project sync without replacing local project UUIDs", () => {
    const migration = read("supabase/migrations/20260727103000_marison_project_master_sync.sql");
    const server = read("server.mjs");
    const sync = read("server/marison-employee-sync.mjs");

    expect(migration).toContain("marison_project_id bigint");
    expect(migration).toContain("master_projects_marison_project_id_uidx");
    expect(migration).toContain("scope in ('branches', 'directory', 'projects')");
    expect(migration).toContain("entity_type in ('branch', 'employee', 'project')");
    expect(migration).not.toContain("alter column id");
    expect(server).toContain('getAllMarisonCollection(marisonDeploymentEnvironment, "/projects")');
    expect(server).toContain("/api/integrations/marison/projects/sync");
    expect(server).toContain('scope: "projects"');
    expect(sync).toContain("export const previewMarisonProjectSync");
    expect(sync).toContain("export const executeMarisonProjectSync");
    expect(sync).toContain("Branch proyek external belum tersedia");
    expect(sync).toContain("fallbackOffice");
    expect(server).toContain("masterProjectReviewCount");
  });
});
