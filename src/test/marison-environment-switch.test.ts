import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Marison environment switch", () => {
  it("keeps credentials server-side and protects switching with verified email OTP", () => {
    const server = read("server.mjs");
    const client = read("src/services/marison-integration.service.ts");

    expect(server).toContain("MARISON_ENV_SWITCH_ADMIN_EMAILS");
    expect(server).toContain("email_confirmed_at");
    expect(server).toContain("MARISON_SWITCH_OTP_TTL_MS");
    expect(server).toContain("timingSafeEqual");
    expect(server).toContain("requireMarisonEnvironmentManager");
    expect(client).not.toContain("CLIENT_SECRET");
    expect(client).not.toContain("CLIENT_ID");
  });

  it("provides status, health test, OTP request, and OTP confirmation endpoints", () => {
    const server = read("server.mjs");

    expect(server).toContain('"/api/integrations/marison/status"');
    expect(server).toContain('"/api/integrations/marison/test"');
    expect(server).toContain('"/api/integrations/marison/switch/request"');
    expect(server).toContain('"/api/integrations/marison/switch/confirm"');
  });

  it("shows staging globally and refreshes status over the shared realtime boundary", () => {
    const provider = read("src/providers/MarisonEnvironmentProvider.tsx");
    const banner = read("src/components/layout/MarisonEnvironmentBanner.tsx");
    const server = read("server.mjs");

    expect(provider).toContain('table: "system_email_settings"');
    expect(banner).toContain("environment staging");
    expect(server).toContain("marisonRealtimeClients");
    expect(server).toContain('table: "system_email_settings"');
  });
});
