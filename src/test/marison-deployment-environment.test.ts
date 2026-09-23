import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Marison deployment environment", () => {
  it("locks the datasource environment to deployment configuration", () => {
    const server = read("backend/src/domain-runtime.ts");

    expect(server).toContain("MARISON_DEPLOYMENT_ENVIRONMENT");
    expect(server).toContain("marisonDeploymentEnvironment");
    expect(server).toContain('source: "deployment"');
    expect(server).not.toContain("MARISON_DEFAULT_ENVIRONMENT");
    expect(server).not.toContain("MARISON_ENV_SWITCH_ADMIN_EMAILS");
    expect(server).not.toContain('"/api/integrations/marison/switch/request"');
    expect(server).not.toContain('"/api/integrations/marison/switch/confirm"');
  });

  it("uses separate fixed environments for staging and production compose", () => {
    const stagingCompose = read("docker-compose.staging.yml");
    const productionCompose = read("docker-compose.prod.yml");

    expect(stagingCompose).toContain('MARISON_DEPLOYMENT_ENVIRONMENT: "staging"');
    expect(productionCompose).toContain('MARISON_DEPLOYMENT_ENVIRONMENT: "production"');
    expect(stagingCompose).toContain('APP_PUBLIC_URL: "https://sigap.marison-testing.biz.id"');
    expect(stagingCompose).toContain('VITE_APP_PUBLIC_URL: "https://sigap.marison-testing.biz.id"');
    expect(productionCompose).toContain('APP_PUBLIC_URL: "https://sigap.marisoncloud.com"');
    expect(productionCompose).toContain('VITE_APP_PUBLIC_URL: "https://sigap.marisoncloud.com"');
    expect(stagingCompose).toContain('VITE_WORK_CALENDAR_ENABLED: "true"');
    expect(productionCompose).toContain('VITE_WORK_CALENDAR_ENABLED: "false"');
    expect(stagingCompose).toContain("Set SUPABASE_URL in .env.staging");
    expect(stagingCompose.match(/GIT_SHA: "\$\{DEPLOY_GIT_SHA:\?DEPLOY_GIT_SHA is required\}"/g)).toHaveLength(5);
    expect(productionCompose).toContain("Set SUPABASE_URL in .env.production");
    expect(productionCompose).toContain("agenda-marison-outbound:");
    expect(productionCompose).toContain('MARISON_SUBMISSION_DISPATCH_ENABLED: "${MARISON_SUBMISSION_DISPATCH_ENABLED:-false}"');
    expect(productionCompose).toContain('MARISON_OUTBOUND_INTERNAL_URL: "http://agenda-flow"');
    expect(stagingCompose).not.toContain("xuhyodtmgwteyslhrkfx");
  });

  it("uses the deployment URL instead of a shared database email URL", () => {
    const server = read("backend/src/domain-runtime.ts");

    expect(server).toContain("process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || raw.app_url");
    expect(server).not.toContain('app_url: "https://sigap.marison-testing.biz.id"');
  });

  it("keeps credentials server-side and exposes only status and health tests", () => {
    const client = read("src/services/marison-integration.service.ts");
    const panel = read("src/components/admin/MarisonIntegrationPanel.tsx");

    expect(client).not.toContain("CLIENT_SECRET");
    expect(client).not.toContain("CLIENT_ID");
    expect(client).not.toContain("requestSwitch");
    expect(client).not.toContain("confirmSwitch");
    expect(panel).toContain("Credential server");
    expect(panel).toContain("Cek koneksi");
    expect(panel).toContain("Sinkron kantor cabang");
    expect(panel).toContain("Sinkron karyawan");
    expect(panel).toContain("Sinkron proyek");
    expect(panel).toContain("previewBranches");
    expect(panel).toContain("syncBranches");
    expect(panel).not.toContain("InputOTP");
  });

  it("keeps Marison credential management on its own page and exposes only outbox reconciliation on form usage", () => {
    const formUsages = read("src/pages/admin/FormUsageManagementPage.tsx");
    const integrationPage = read("src/pages/admin/MarisonIntegrationPage.tsx");
    const configuration = read("src/components/configuration/ConfigurationLayout.tsx");
    const routes = read("src/App.tsx");
    const sidebar = read("src/components/layout/Sidebar.tsx");

    expect(configuration).toContain('value: "/admin/configuration/integration"');
    expect(routes).toContain('<Route path="integration" element={<MarisonIntegrationPage />} />');
    expect(integrationPage).toContain("MarisonIntegrationPanel");
    expect(integrationPage).not.toContain("Navigate");
    expect(formUsages).not.toContain("MarisonOutboundQueuePanel");
    expect(integrationPage).toContain("MarisonOutboundQueuePanel");
    expect(formUsages).not.toContain("MarisonIntegrationPanel");
    expect(sidebar).not.toContain("Integrasi Marison");
  });
});
