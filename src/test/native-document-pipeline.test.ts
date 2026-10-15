import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("native document pipeline", () => {
  const service = read("src/services/surat.service.ts");
  const worker = read("pdf-worker.mjs");
  const runtime = read("backend/src/domain-runtime.ts");
  const app = read("src/App.tsx");
  const createBody = service.slice(
    service.indexOf("async createRegistrasi("),
    service.indexOf("async cancelRegistration(", service.indexOf("async createRegistrasi(")),
  );
  const approveBody = service.slice(
    service.indexOf("async approveSurat("),
    service.indexOf("async rejectSurat(", service.indexOf("async approveSurat(")),
  );

  it("stores registration data without creating or uploading a spreadsheet", () => {
    expect(createBody).toContain("native://document/");
    expect(createBody).not.toContain("buildFilledTemplateFile(");
    expect(createBody).not.toContain(".xlsx");
    expect(createBody).not.toContain("ExcelJS");
  });

  it("uses atomic KEU10 registration without replacing its server generation or inserting signers twice", () => {
    expect(createBody).toContain('supabase.rpc("create_keu10_registration"');
    expect(createBody).toContain("registrationResult?.surat");
    expect(createBody).toContain("registrationResult.created !== true");
    expect(createBody).toContain("Link only missing stored files");
    expect(createBody).toMatch(/if \(!keu10Registration\) \{\s+const dataSnapshot/);
    expect(createBody).toMatch(/if \(!keu10Registration\) \{\s+const \{ error: signerInsertError \}/);
  });

  it("keeps approval database-native and generates only the final PDF asynchronously", () => {
    expect(approveBody).toContain("handle_approve_surat_v2");
    expect(approveBody).toContain("native://document/${suratId}/approval/${signatureId}");
    expect(approveBody).not.toContain("transformApprovalExcel(");
    expect(approveBody).not.toContain("signatureId })");
    expect(approveBody).not.toContain("Gagal enqueue PDF final rekomendasi");
    expect(approveBody).toContain("Gagal enqueue PDF final dokumen");
  });

  it("renders worker output directly as PDF without LibreOffice or XLSX sources", () => {
    const dockerfile = read("dockerfile");
    expect(worker).toContain("renderDirectPgdJob");
    expect(worker).toContain("renderDirectRecommendationJob");
    expect(worker).not.toContain("soffice");
    expect(worker).not.toContain("source.xlsx");
    expect(worker).not.toContain("appendRecommendationPagesToFile");
    expect(dockerfile).not.toContain("libreoffice");
    expect(dockerfile).not.toContain("document-workbook-normalizer.mjs");
  });

  it("never exposes a native source marker as an outbound attachment", () => {
    const attachmentBody = runtime.slice(
      runtime.indexOf("const buildMarisonDocumentLinks"),
      runtime.indexOf("const buildMarisonUnitPayload"),
    );
    expect(attachmentBody).toContain('startsWith("native://document/")');
    expect(attachmentBody).toContain("PDF final sedang disiapkan");
    expect(attachmentBody).toContain("finalPdfPath,");
    expect(attachmentBody).toContain("buildMarisonDocumentBundle");
    expect(attachmentBody).not.toContain("surat.pdf_path || surat.file_path");
  });

  it("retires the legacy Forms and Workflows screens in favor of Form Usages", () => {
    expect(app).not.toContain('path="/admin/forms"');
    expect(app).not.toContain('path="/admin/workflow-details"');
    expect(app).not.toContain('path="forms"');
    expect(app).not.toContain('path="workflows"');
    expect(app).not.toContain("TemplateDesignerPage");
    expect(existsSync(resolve("src/pages/admin/FormManagementPage.tsx"))).toBe(false);
    expect(existsSync(resolve("src/pages/admin/TemplateDesignerPage.tsx"))).toBe(false);
    expect(existsSync(resolve("document-workbook-normalizer.mjs"))).toBe(false);
  });
});
