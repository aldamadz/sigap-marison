import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fundModule } from "@/features/surat/registration/usages/fund/fund-module";
import type { UsageModuleContext } from "@/features/surat/registration/usages/usage-contract";
import type { UsageDetailRecord } from "@/components/surat/form/surat-form-types";
import { effectiveFundRabRequirements, hasRequesterRab, usesRequesterRabChoice, withRequesterRabRequirement } from "@/lib/fund-rab";
import { validateInitialRegistrationAttachments } from "@/lib/registration-attachment-validation";
import { classifyRegistrationDraftAttachments } from "@/lib/registration-draft-attachment-classification";

const rule = { id: "rab", stage_order: 2, requirement_key: "rab", label: "RAB hasil pemeriksaan",
  is_required: true, allow_multiple: false, min_files: 1, max_files: 1, allowed_types: ["application/pdf"], max_size_bytes: 10485760 };
const usage: UsageDetailRecord = { id: "planning-fund", master_forms: { nomor_form: "FM-UAI.PGD-01-00" },
  form_usage_steps: [{ id: "planning", step_order: 2, role_name: "memeriksa", label: "Mgr. Perencanaan" }],
  form_usage_attachment_requirements: [rule] };
const attachment = { stage: "initial", requirement_key: "rab", signature_id: null };
function context(input: UsageModuleContext["input"] = {}): UsageModuleContext {
  return { usage, usageKey: "non_asset", category: "non_asset", input,
    formData: { office_id: "", dept_id: "", entity_id: "", letter_type_id: "", project_id: "" },
    isPusatSelected: true, requesterDepartmentId: "", linkedDocumentContext: null, externalRevision: null,
    generatedNoSurat: "001/UAI/X/2026", master: { users: [], offices: [], depts: [], entities: [], types: [], projects: [] },
    marisonProject: null, unitAvailability: null, recommendationIO: null, setInputValue: vi.fn(), setSelection: vi.fn(),
    requestExternalOptions: async () => [] };
}

describe("requester RAB choice", () => {
  it("shows unchecked Ada RAB only for PGD Dana with planning examination", () => {
    const ctx = context();
    render(fundModule.renderDetailsPanel?.(ctx));
    const checkbox = screen.getByRole("checkbox", { name: "Ada RAB" });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("RAB akan dilengkapi oleh tim pemeriksa Perencanaan.")).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(ctx.setInputValue).toHaveBeenCalledWith("requester_has_rab", true);
  });
  it.each(["FM-UAI.KEU-01-00", "FM-UAI.KEU-10-00"])("does not enable RAB waiver for %s", nomor_form => {
    expect(usesRequesterRabChoice({ ...usage, master_forms: { nomor_form } }, "non_asset")).toBe(false);
  });
  it("does not enable for assets or fund without planning", () => {
    expect(usesRequesterRabChoice(usage, "asset")).toBe(false);
    expect(usesRequesterRabChoice({ ...usage, form_usage_steps: [] }, "non_asset")).toBe(false);
  });
  it("requires a separately classified requester attachment when checked", () => {
    const rules = withRequesterRabRequirement([], usage, { request_category: "non_asset", requester_has_rab: true });
    expect(rules).toMatchObject([{ requirement_key: "rab", stage_order: 0, is_required: true, label: "RAB dari pemohon" }]);
    expect(() => validateInitialRegistrationAttachments({ requirements: rules, newFiles: [], newFileMetadata: {}, persistedFiles: [] })).toThrow(/RAB/);
    expect(withRequesterRabRequirement([], usage, { request_category: "non_asset", requester_has_rab: false })).toEqual([]);
    expect(withRequesterRabRequirement([{ ...rule, stage_order: 0 }], usage, { request_category: "non_asset", requester_has_rab: false })).toEqual([]);
  });
  it("does not trust checked flag without a persisted initial RAB", () => {
    const input = { requester_has_rab: true };
    expect(hasRequesterRab(input, [])).toBe(false);
    expect(hasRequesterRab(input, [{ ...attachment, stage: "approval", signature_id: "checker" }])).toBe(false);
    expect(hasRequesterRab(input, [{ ...attachment, requirement_key: "requester_additional" }])).toBe(false);
    expect(effectiveFundRabRequirements([rule], true, input, [])).toEqual([rule]);
  });
  it("waives only RAB, not other required evidence, without mutating snapshot", () => {
    const other = { ...rule, requirement_key: "other" };
    const result = effectiveFundRabRequirements([rule, other], true, { requester_has_rab: true }, [attachment]);
    expect(result[0]).toMatchObject({ is_required: false, min_files: 0 });
    expect(result[1]).toEqual(other);
    expect(rule.is_required).toBe(true);
    expect(effectiveFundRabRequirements([rule], false, { requester_has_rab: true }, [attachment])).toEqual([rule]);
    expect(effectiveFundRabRequirements([rule], true, { requester_has_rab: false }, [attachment])).toEqual([rule]);
  });
  it("preserves the boolean in eligible drafts and removes it on usage/form change", () => {
    const ctx = context({ requester_has_rab: true });
    expect(fundModule.normalizeInput(ctx.input, ctx).requester_has_rab).toBe(true);
    const other = { ...ctx, usage: { ...usage, form_usage_steps: [] } };
    expect(fundModule.normalizeInput(ctx.input, other)).not.toHaveProperty("requester_has_rab");
    expect(fundModule.reconcileInputForContext?.(ctx.input, other)).not.toHaveProperty("requester_has_rab");
    expect(fundModule.cleanup(ctx, "usage_change").inputKeysToDelete).toContain("requester_has_rab");
    expect(fundModule.buildSummaryFields?.(ctx)).toContainEqual({ key: "requester_has_rab", label: "RAB", value: "Dari pemohon" });
  });
  it("supplies a default checker RAB rule for new planning fund submissions, not historical documents", () => {
    expect(effectiveFundRabRequirements([], true, { requester_has_rab: false }, [])).toMatchObject([{ requirement_key: "rab", is_required: true }]);
    expect(effectiveFundRabRequirements([], true, {}, [])).toEqual([]);
    expect(effectiveFundRabRequirements([{ ...rule, is_required: false, min_files: 0 }], true, { requester_has_rab: false }, [])).toMatchObject([{ is_required: true, min_files: 1 }]);
  });
  it("retains a stored RAB as optional after unchecking, without losing it or waiving checker evidence", () => {
    const input = { request_category: "non_asset", requester_has_rab: false };
    const rules = withRequesterRabRequirement([], usage, input, true);
    expect(rules).toMatchObject([{ requirement_key: "rab", is_required: false, min_files: 0 }]);
    const file = { id: "stored-rab", draft_id: "draft", file_url: "stored.pdf", file_name: "RAB.pdf",
      file_type: "application/pdf", file_size: 100, requirement_key: "rab", requirement_label: "RAB", created_at: "2026-10-07" };
    const result = classifyRegistrationDraftAttachments({ files: [file], initialRequirementKeys: new Set(rules.map(r => r.requirement_key)), formInputData: input });
    expect(result.initialAttachments).toEqual([file]);
    expect(effectiveFundRabRequirements([rule], true, input, [attachment])[0].is_required).toBe(true);
  });
});
