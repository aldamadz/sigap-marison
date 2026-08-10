import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("SUR-12 compact master data BFF", () => {
  it("loads initial form data through one dedicated authenticated endpoint", () => {
    const frontend = read("src/services/surat.service.ts");
    const start = frontend.indexOf("async getMasterData()");
    const end = frontend.indexOf("async downloadFilledTemplate", start);
    const method = frontend.slice(start, end);

    expect(method).toContain('fetch("/api/surat/master-data"');
    expect(method).not.toContain('supabase.from("master_');
    expect(method).not.toContain("Promise.all([");
  });

  it("registers the endpoint and validates one BFF session before parallel RLS queries", () => {
    const app = read("backend/src/app.ts");
    const route = read("backend/src/routes/surat.routes.ts");
    const controller = read("backend/src/controllers/surat.controller.ts");
    const service = read("backend/src/services/surat.service.ts");

    expect(app).toContain("registerSuratRoutes(app)");
    expect(app.indexOf("registerSuratRoutes(app)")).toBeLessThan(app.indexOf("registerDomainRoutes(app)"));
    expect(route).toContain('app.get("/api/surat/master-data"');
    expect(route).toContain("controller.masterData");
    expect(controller.match(/getSession\(/g)).toHaveLength(1);
    expect(service).toContain("Promise.all([");
    expect(service.match(/client\.from\(/g)).toHaveLength(8);
    expect(service).toContain('client.from("profiles")');
  });

  it("keeps recommendation picker hidden without creating desktop horizontal overflow", () => {
    const form = read("src/components/surat/SuratForm.tsx");
    const start = form.indexOf("const inputId = `${field.key}-${rowIndex}-recommendation-image`");
    const end = form.indexOf("{isLinkedRecommendation && rows.length > 1", start);
    const picker = form.slice(start, end);

    expect(picker).not.toContain('role="button"');
    expect(picker).not.toContain("tabIndex={0}");
    expect(picker).not.toContain('className="sr-only"');
    expect(picker).toContain('className="hidden"');
    expect(picker).toContain("decoding=\"async\"");
    expect(picker).toContain("loading=\"lazy\"");
    expect(picker).toContain("aria-label={`Hapus lampiran gambar item");
    expect(picker).toContain("aria-label={attachment ? `Ganti gambar item");
  });
});
