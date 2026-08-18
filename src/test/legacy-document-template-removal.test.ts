import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("legacy document templates are retired", () => {
  it("keeps the request and approval services free of workbook generation", () => {
    const service = read("src/services/surat.service.ts");

    expect(service).not.toMatch(/ExcelJS|\.xlsx|buildFilledTemplateFile|transformApprovalExcel/);
    expect(service).not.toMatch(/link_form|signature_layout|request_sentence_cell/);
    expect(service).toContain("getRegistrationContext");
  });

  it("removes dormant template screens and workbook modules", () => {
    const removed = [
      "src/pages/admin/FormManagementPage.tsx",
      "src/pages/admin/TemplateDesignerPage.tsx",
      "src/services/signature-layout.service.ts",
      "src/services/template-builder.service.ts",
      "src/pages/admin/UnitDepartmentConfigurationPage.tsx",
      "src/pages/admin/WorkflowDetailManagementPage.tsx",
      "document-workbook-normalizer.mjs",
    ];

    removed.forEach((path) => expect(existsSync(resolve(path)), path).toBe(false));
    expect(read("src/App.tsx")).not.toContain("template-designer");
    expect(read("src/components/configuration/ConfigurationLayout.tsx")).not.toContain("Template Builder");
  });

  it("drops only legacy layout storage while preserving native form routing", () => {
    const migration = read("supabase/migrations/20260818140000_retire_legacy_document_templates.sql");

    expect(migration).toContain("drop column if exists link_form");
    expect(migration).toContain("drop column if exists unit_config");
    expect(migration).toContain("drop column if exists signature_layout");
    expect(migration).toContain("drop column if exists signature_position_snapshot");
    expect(migration).toContain("drop table if exists public.document_template_builder_versions");
    expect(migration).toContain("drop table if exists public.master_form_presets");
    expect(migration).not.toMatch(/drop table.*form_usages/i);
    expect(migration).not.toContain("cascade");
  });

  it("retains Excel only for explicit import and export utilities", () => {
    const runtimeSources = [
      read("src/lib/excel.ts"),
      read("src/services/export.service.ts"),
    ].join("\n");

    expect(runtimeSources).toContain('from "exceljs"');
    expect(read("backend/package.json")).not.toContain('"exceljs"');
  });
});
