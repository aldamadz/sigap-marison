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
    const server = read("backend/src/domain-runtime.ts");
    const syncRuntime = read("backend/src/modules/marison/marison-sync-runtime.ts");
    const compose = read("docker-compose.staging.yml");

    expect(worker).toContain('const timeZone = "Asia/Jakarta"');
    expect(worker).toContain('parts.hour === "00" && parts.minute === "00"');
    expect(server).toContain("/api/internal/marison/directory-sync");
    expect(syncRuntime).toContain('triggerType: "cron"');
    expect(syncRuntime).toContain('scope: "projects"');
    expect(compose).toContain("agenda-marison-sync-staging:");
    expect(compose).toContain('MARISON_SYNC_ENABLED: "true"');
  });

  it("keeps the production scheduler opt-in and provisions new accounts only with production configuration", () => {
    const productionCompose = read("docker-compose.prod.yml");
    const runtime = read("backend/src/modules/marison/marison-sync-runtime.ts");
    const sync = read("server/marison-employee-sync.mjs");
    const migration = read("supabase/migrations/20260923120000_production_marison_master_sync.sql");

    expect(productionCompose).toContain("agenda-marison-sync:");
    expect(productionCompose).toContain('MARISON_SYNC_ENABLED: "${MARISON_SYNC_ENABLED:-false}"');
    expect(productionCompose).toContain("http://agenda-flow/api/internal/marison/directory-sync");
    expect(runtime).toContain('"MARISON_PRODUCTION_DEFAULT_USER_PASSWORD"');
    expect(runtime).toContain('"STAGING_DEFAULT_USER_PASSWORD"');
    expect(sync).toContain("supabase.auth.admin.createUser");
    expect(sync).toContain("defaultPassword");
    expect(sync).not.toContain("Akun Auth belum tersedia; buat akun melalui Manajemen User sebelum sinkronisasi.");
    expect(sync).not.toContain("randomBytes(32)");
    expect(migration).toContain("marison_sync_runs_one_active_uidx");
    expect(migration).toContain("master_projects_marison_project_id_uidx");
  });

  it("fetches branches before employees and never resets an existing password", () => {
    const server = read("backend/src/domain-runtime.ts");
    const sync = read("server/marison-employee-sync.mjs");

    const preview = read("backend/src/modules/marison/marison-preview-runtime.ts");
    const sourceLoader = preview.slice(
      preview.indexOf("const getMarisonEmployeeSyncSource"),
      preview.indexOf("const previewMarisonBranches"),
    );
    expect(sourceLoader).toContain("deps.deploymentEnvironment");
    expect(sourceLoader).not.toContain('getAllMarisonCollection("staging"');
    expect(sourceLoader.indexOf('"/branches"')).toBeLessThan(sourceLoader.indexOf('"/employees"'));

    const existingAuthUpdate = sync.slice(
      sync.indexOf("const authUpdates = {"),
      sync.indexOf("} else {", sync.indexOf("const authUpdates = {")),
    );
    expect(existingAuthUpdate).not.toContain("password:");
  });

  it("keeps employee source and audit environment aligned with the deployed runtime", () => {
    const server = read("backend/src/domain-runtime.ts");
    const sync = read("server/marison-employee-sync.mjs");

    expect(server).toContain("environment: marisonDeploymentEnvironment");
    expect(server).not.toContain("Sinkronisasi karyawan external hanya tersedia di staging.");
    expect(sync).toContain('environment = "staging"');
    expect(sync).toContain("Email external wajib tersedia untuk sinkronisasi production");
    expect(sync).toContain('environment === "production"');
    expect(sync).not.toContain('environment: "staging",');
  });

  it("adds tracked project sync without replacing local project UUIDs", () => {
    const migration = read("supabase/migrations/20260727103000_marison_project_master_sync.sql");
    const server = read("backend/src/domain-runtime.ts");
    const sync = read("server/marison-employee-sync.mjs");

    expect(migration).toContain("marison_project_id bigint");
    expect(migration).toContain("master_projects_marison_project_id_uidx");
    expect(migration).toContain("scope in ('branches', 'directory', 'projects')");
    expect(migration).toContain("entity_type in ('branch', 'employee', 'project')");
    expect(migration).not.toContain("alter column id");
    const preview = read("backend/src/modules/marison/marison-preview-runtime.ts");
    expect(preview).toContain('getAllMarisonCollection(deps.deploymentEnvironment, "/projects")');
    expect(server).toContain("/api/integrations/marison/projects/sync");
    expect(read("backend/src/modules/marison/marison-sync-runtime.ts")).toContain('scope: "projects"');
    expect(sync).toContain("export const previewMarisonProjectSync");
    expect(sync).toContain("export const executeMarisonProjectSync");
    expect(sync).toContain("Branch proyek external belum tersedia");
    expect(sync).toContain("`EXT-PROJECT-${externalId}`");
    expect(sync).toContain("Kode proyek external belum tersedia");
    expect(sync).toContain("Entitas proyek belum dipilih");
    expect(sync).toContain("fallbackOffice");
    expect(sync).not.toContain("defaultEntityId");
    expect(read("backend/src/modules/attention/attention-runtime.ts")).toContain("masterProjectReviewCount");
    const routes = read("backend/src/routes/domain.routes.ts");
    expect(routes).toContain('{ method: "GET", url: "/api/integrations/marison/projects/preview" }');
    expect(routes).toContain('{ method: "POST", url: "/api/integrations/marison/projects/sync" }');
  });

  it("keeps production master pages usable without staging-only payload mappings", () => {
    const server = read("backend/src/domain-runtime.ts");
    const mappingList = server.slice(
      server.indexOf("export const getMarisonPayloadMappings"),
      server.indexOf("export const getMarisonPayloadMappingCatalog"),
    );
    const mappingCatalog = server.slice(
      server.indexOf("export const getMarisonPayloadMappingCatalog"),
      server.indexOf("export const configureMarisonPayloadMapping"),
    );
    expect(mappingList).toContain("return { mappings: [], actorId: actor.id }");
    expect(mappingCatalog).toContain("return { catalog: [], actorId: actor.id }");
  });

  it("requires external projects to be reviewed until an entity is selected", () => {
    const migration = read("supabase/migrations/20260727121500_require_marison_project_entity_review.sql");
    const page = read("src/pages/admin/ProjectManagementPage.tsx");

    expect(migration).toContain("if new.entity_id is null then");
    expect(migration).toContain("Entitas proyek belum dipilih");
    expect(migration).toContain("before insert or update of code, name, office_id, entity_id");
    expect(migration).toContain("set entity_id = null");
    expect(page).toContain("masterReviewRowClass");
    expect(page).toMatch(/<TableHead[^>]*>Keterangan<\/TableHead>/);
    expect(page).toContain("<MasterReviewStatus required={project.marison_review_required} reasons={project.marison_review_reasons} />");
  });

  it("uses the same review row and Keterangan column for employees, offices, and projects", () => {
    const component = read("src/components/admin/MasterReviewStatus.tsx");
    const users = read("src/pages/admin/UserManagementPage.tsx");
    const offices = read("src/pages/admin/OfficeManagementPage.tsx");
    const projects = read("src/pages/admin/ProjectManagementPage.tsx");

    expect(component).toContain("masterReviewRowClass");
    expect(component).toContain('return required ? "Data belum lengkap" : "Lengkap"');
    [users, offices, projects].forEach((source) => {
      expect(source).toContain("MasterReviewStatus");
      expect(source).toContain("masterReviewRowClass");
      expect(source.toLowerCase()).toContain("keterangan");
    });
    expect(users).not.toContain("> Lengkapi</span>");
    expect(offices).not.toContain("Perlu dilengkapi");
  });
});
