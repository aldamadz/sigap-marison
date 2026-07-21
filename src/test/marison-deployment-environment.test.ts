import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Marison deployment environment", () => {
  it("locks the datasource environment to deployment configuration", () => {
    const server = read("server.mjs");

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
    expect(stagingCompose).toContain("Set SUPABASE_URL in .env.staging");
    expect(productionCompose).toContain("Set SUPABASE_URL in .env.production");
    expect(stagingCompose).not.toContain("xuhyodtmgwteyslhrkfx");
  });

  it("uses the deployment URL instead of a shared database email URL", () => {
    const server = read("server.mjs");

    expect(server).toContain("process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || raw.app_url");
    expect(server).not.toContain('app_url: "https://sigap.marison-testing.biz.id"');
  });

  it("keeps credentials server-side and exposes only status and health tests", () => {
    const client = read("src/services/marison-integration.service.ts");
    const page = read("src/pages/admin/MarisonIntegrationPage.tsx");

    expect(client).not.toContain("CLIENT_SECRET");
    expect(client).not.toContain("CLIENT_ID");
    expect(client).not.toContain("requestSwitch");
    expect(client).not.toContain("confirmSwitch");
    expect(page).toContain("Environment ditetapkan saat deployment");
    expect(page).not.toContain("InputOTP");
  });
});
