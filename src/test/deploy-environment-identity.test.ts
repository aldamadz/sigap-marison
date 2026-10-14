import { describe, expect, it } from "vitest";
import { validateDeploymentIdentity } from "../../scripts/deploy-environment-identity.mjs";

const config = (environment: string, backend: string, frontend = backend, extra = {}) => ({ services: { app: {
  environment: { MARISON_DEPLOYMENT_ENVIRONMENT: environment, APP_PUBLIC_URL: environment === "staging"
    ? "https://sigap.marison-testing.biz.id" : "https://sigap.marisoncloud.com", SUPABASE_URL: backend, VITE_SUPABASE_URL: frontend, ...extra },
  build: { args: { VITE_SUPABASE_URL: frontend } },
} } });
describe("deployment infrastructure identity", () => {
  it("accepts the exact existing staging and production Cloud configurations", () => {
    expect(validateDeploymentIdentity(config("staging", "https://wrufczusfopgvwvxsmjk.supabase.co"), "app", "staging")).toBe(true);
    expect(validateDeploymentIdentity(config("production", "https://xuhyodtmgwteyslhrkfx.supabase.co/"), "app", "production")).toBe(true);
  });
  it("accepts only the complete intended private production migration", () => {
    const c = config("production", "http://172.20.100.3:8000", "https://sigap.marisoncloud.com/supabase", {
      STORAGE_SUPABASE_URL: "http://172.20.100.5:8000", STORAGE_PUBLIC_BASE_URL: "https://sigap.marisoncloud.com/storage/v1/object/public",
    });
    expect(validateDeploymentIdentity(c, "app", "production")).toBe(true);
    c.services.app.build.args.VITE_SUPABASE_URL = "https://wrufczusfopgvwvxsmjk.supabase.co";
    expect(validateDeploymentIdentity(c, "app", "production")).toBe(false);
  });
  it("rejects mixed environments, credentials, suffix spoofing and unrecognized private hosts", () => {
    for (const url of ["https://wrufczusfopgvwvxsmjk.supabase.co", "https://xuhyodtmgwteyslhrkfx.supabase.co.evil", "https://user:secret@xuhyodtmgwteyslhrkfx.supabase.co", "http://172.20.100.4:8000"]) {
      expect(validateDeploymentIdentity(config("production", url), "app", "production")).toBe(false);
    }
    expect(validateDeploymentIdentity(config("production", "http://172.20.100.3:8000", "https://sigap.marisoncloud.com/supabase"), "app", "production")).toBe(false);
  });
});

