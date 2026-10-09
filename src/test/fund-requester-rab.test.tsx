import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fundModule } from "@/features/surat/registration/usages/fund/fund-module";
import type { UsageModuleContext } from "@/features/surat/registration/usages/usage-contract";
import type { UsageDetailRecord } from "@/components/surat/form/surat-form-types";
import { effectiveFundRabRequirements, hasRequesterRab, usesRequesterRabChoice, withRequesterRabRequirement } from "@/lib/fund-rab";
import { validateInitialRegistrationAttachments } from "@/lib/registration-attachment-validation";
import { classifyRegistrationDraftAttachments } from "@/lib/registration-draft-attachment-classification";

const rule = { id: "rab", stage_order: 2, requirement_key: "rab", label: "RAB",
  is_required: true, allow_multiple: false, min_files: 1, max_files: 1, allowed_types: ["application/pdf"], max_size_bytes: 10485760 };
const usage: UsageDetailRecord = { id: "fund", master_forms: { nomor_form: "FM-UAI.PGD-01-00" },
  form_usage_steps: [{ id: "review", step_order: 2, role_name: "memeriksa", label: "Mgr. Perencanaan" }],
  form_usage_attachment_requirements: [rule] };
function context(input: UsageModuleContext["input"] = {}): UsageModuleContext {
  return { usage, usageKey: "non_asset", category: "non_asset", input,
    formData: { office_id: "", dept_id: "", entity_id: "", letter_type_id: "", project_id: "" },
    isPusatSelected: true, requesterDepartmentId: "", linkedDocumentContext: null, externalRevision: null,
    generatedNoSurat: "001/UAI/X/2026", master: { users: [], offices: [], depts: [], entities: [], types: [], projects: [] },
    marisonProject: null, unitAvailability: null, recommendationIO: null, setInputValue: vi.fn(), setSelection: vi.fn(),
    requestExternalOptions: async () => [] };
}

describe("optional PGD Fund RAB", () => {
  it.each(["Mgr. Perencanaan", "Mgr. HRD & GA"])("offers explicit no-RAB intent for %s without claiming a file exists", label => {
    const ctx = { ...context(), usage: { ...usage, form_usage_steps: [{ id: "review", step_order: 2, role_name: "memeriksa", label }] } };
    render(fundModule.renderDetailsPanel?.(ctx));
    const checkbox = screen.getByRole("checkbox", { name: "Tidak memerlukan RAB" });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(ctx.setInputValue).toHaveBeenCalledWith("rab_not_required", true);
  });
  it.each(["FM-UAI.KEU-01-00", "FM-UAI.KEU-10-00"])("does not change RAB rules for %s", nomor_form => {
    expect(usesRequesterRabChoice({ ...usage, master_forms: { nomor_form } }, "non_asset")).toBe(false);
  });
  it.each([{}, { requester_has_rab: true }, { rab_not_required: true }])("never requires an initial RAB for input %j", input => {
    const rules = withRequesterRabRequirement([], usage, { request_category: "non_asset", ...input });
    expect(rules).toMatchObject([{ requirement_key: "rab", is_required: false, min_files: 0 }]);
    expect(() => validateInitialRegistrationAttachments({ requirements: rules, newFiles: [], newFileMetadata: {}, persistedFiles: [] })).not.toThrow();
  });
  it.each([true, false])("keeps RAB optional on both review paths, planning=%s", planning => {
    const other = { ...rule, requirement_key: "quotation" };
    const result = effectiveFundRabRequirements([rule, other], planning, !planning);
    expect(result[0]).toMatchObject({ is_required: false, min_files: 0 });
    expect(result[1]).toEqual(other);
    expect(rule.is_required).toBe(true);
    expect(effectiveFundRabRequirements([], planning, !planning)).toMatchObject([{ requirement_key: "rab", is_required: false }]);
  });
  it("preserves no-RAB intent in drafts and clears it on another form", () => {
    const ctx = context({ rab_not_required: true });
    expect(fundModule.normalizeInput(ctx.input, ctx).rab_not_required).toBe(true);
    const other = { ...ctx, usage: { ...usage, master_forms: { nomor_form: "FM-UAI.KEU-01-00" } } };
    expect(fundModule.normalizeInput(ctx.input, other)).not.toHaveProperty("rab_not_required");
    expect(fundModule.buildSummaryFields?.(ctx)).toContainEqual({ key: "rab_not_required", label: "Kebutuhan RAB", value: "Tidak memerlukan RAB" });
  });
  it("does not delete a stored requester RAB when no-RAB intent is checked", () => {
    const input = { request_category: "non_asset", rab_not_required: true };
    const rules = withRequesterRabRequirement([], usage, input);
    const file = { id: "stored-rab", draft_id: "draft", file_url: "stored.pdf", file_name: "RAB.pdf",
      file_type: "application/pdf", file_size: 100, requirement_key: "rab", requirement_label: "RAB", created_at: "2026-10-09" };
    const result = classifyRegistrationDraftAttachments({ files: [file], initialRequirementKeys: new Set(rules.map(r => r.requirement_key)), formInputData: input });
    expect(result.initialAttachments).toEqual([file]);
    expect(hasRequesterRab([{ stage: "initial", requirement_key: "rab", signature_id: null }])).toBe(true);
    expect(hasRequesterRab([{ stage: "approval", requirement_key: "rab", signature_id: "checker" }])).toBe(false);
  });
});
