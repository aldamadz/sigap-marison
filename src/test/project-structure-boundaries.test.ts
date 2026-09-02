import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const exists = (path: string) => existsSync(join(root, path));

describe("project structure boundaries", () => {
  it("keeps the maintainability guide discoverable", () => {
    expect(exists("docs/PROJECT_STRUCTURE_GUIDE.md")).toBe(true);
    expect(read("docs/README.md")).toContain("PROJECT_STRUCTURE_GUIDE.md");
  });

  it("keeps BFF runtime outside the domain-runtime shell", () => {
    const runtime = read("backend/src/domain-runtime.ts");
    const bffRuntime = read("backend/src/modules/bff/bff-runtime.ts");

    expect(runtime).toContain('createBffRuntime({');
    expect(runtime).toContain('from "./modules/bff/bff-runtime.js"');
    expect(runtime).not.toContain("const BFF_QUERY_METHODS = new Set");
    expect(runtime).not.toContain("const handleBffQuery = async");
    expect(bffRuntime).toContain("export const createBffRuntime");
    expect(bffRuntime).toContain("const BFF_QUERY_METHODS = new Set");
  });

  it("routes surat page dependencies through feature API facades", () => {
    const suratForm = read("src/components/surat/SuratForm.tsx");
    const inboxPage = read("src/pages/surat/InboxPage.tsx");

    expect(suratForm).toContain("@/features/surat/registration/services/surat-registration-api");
    expect(suratForm).toContain("@/features/surat/recommendation/services/surat-recommendation-api");
    expect(suratForm).not.toContain("suratService.");
    expect(inboxPage).toContain("@/features/surat/inbox/services/surat-inbox-api");
    expect(inboxPage).toContain("@/features/surat/inbox/services/surat-approval-api");
    expect(inboxPage).not.toContain("suratService.");
  });

  it("keeps pure surat helpers out of the largest page files", () => {
    const suratForm = read("src/components/surat/SuratForm.tsx");
    const inboxPage = read("src/pages/surat/InboxPage.tsx");
    const signerAssignments = read("src/features/surat/registration/lib/signer-assignments.ts");
    const inboxTaskState = read("src/features/surat/inbox/lib/inbox-task-state.ts");

    expect(suratForm).toContain("buildSignerAssignments");
    expect(suratForm).not.toContain("const normalizeRoleName =");
    expect(signerAssignments).toContain("const normalizeRoleName =");
    expect(inboxPage).toContain("getTaskAction");
    expect(inboxPage).not.toContain("const getTaskAction =");
    expect(inboxTaskState).toContain("export const getTaskAction");
  });

  it("keeps pure surat-service helpers out of the god service", () => {
    const suratService = read("src/services/surat.service.ts");
    const formHelpers = read("src/services/surat/form-helpers.ts");
    const pdfBuilders = read("src/services/surat/pdf-builders.ts");
    const notification = read("src/services/surat/notification.ts");

    expect(exists("src/services/surat/form-helpers.ts")).toBe(true);
    expect(exists("src/services/surat/pdf-builders.ts")).toBe(true);
    expect(exists("src/services/surat/notification.ts")).toBe(true);

    // Form-helpers module owns these functions; the facade must not
    // redefine them inline.
    expect(formHelpers).toContain("export const cleanUuid");
    expect(formHelpers).toContain("export const normalizeRoleName");
    expect(formHelpers).toContain("export const formatDateForDocument");
    expect(formHelpers).toContain("export const normalizeRecommendationItems");
    expect(formHelpers).toContain("export const normalizeFormInputData");
    expect(formHelpers).toContain("export const getUnitCode");
    expect(formHelpers).toContain("export const getUnitType");
    expect(formHelpers).toContain("export const parseMoney");
    expect(formHelpers).toContain("export const formatRupiah");
    expect(formHelpers).toContain("export const buildProductionCode");
    expect(formHelpers).toContain("export const formatProductionDate");
    expect(formHelpers).toContain("export const getVerifierIdsFromSnapshot");
    expect(formHelpers).toContain("export const buildDataSnapshot");

    expect(pdfBuilders).toContain("export const createUnitRecapAttachment");
    expect(pdfBuilders).toContain("export const createProductionCodeAttachment");
    expect(pdfBuilders).toContain("export const getSignerSnapshots");

    expect(notification).toContain("export const sendNotification");
    expect(notification).toContain("export const notifyInboxStepTasks");

    // The facade still exposes the same method names (callers depend on them)
    // but must not carry the original inline implementations.
    expect(suratService).toContain("cleanUuid(...args: Parameters<typeof cleanUuid>)");
    expect(suratService).toContain("normalizeRoleName(...args: Parameters<typeof normalizeRoleName>)");
    expect(suratService).toContain("formatDateForDocument(...args: Parameters<typeof formatDateForDocument>)");
    expect(suratService).toContain("normalizeRecommendationItems(...args: Parameters<typeof normalizeRecommendationItems>)");
    expect(suratService).toContain("normalizeFormInputData(...args: Parameters<typeof normalizeFormInputData>)");
    expect(suratService).toContain("createUnitRecapAttachment(...args: Parameters<typeof createUnitRecapAttachment>)");
    expect(suratService).toContain("createProductionCodeAttachment(...args: Parameters<typeof createProductionCodeAttachment>)");
    expect(suratService).toContain("buildDataSnapshot(...args: Parameters<typeof buildDataSnapshot>)");
    expect(suratService).toContain("notifyInboxStepTasks(");
  });

  it("keeps inbox pagination + lifecycle out of InboxPage", () => {
    const inbox = read("src/pages/surat/InboxPage.tsx");
    const hook = read("src/features/surat/inbox/lib/use-inbox-pagination.ts");

    expect(exists("src/features/surat/inbox/lib/use-inbox-pagination.ts")).toBe(true);
    expect(hook).toContain("export const useInboxPagination");
    expect(hook).toContain("useQuery");
    expect(hook).toContain("setInboxCursor(null)");
    expect(hook).toContain("setInboxAllItems(page.items)");
    expect(hook).toContain("queryClient.invalidateQueries");
    expect(hook).toContain("finishTaskLocally");
    expect(hook).toContain("refreshAfterAction");
    expect(hook).toContain("resetPagination");

    // InboxPage must consume the hook and not redeclare the inline state,
    // the cursor useQuery, or the lifecycle helpers.
    expect(inbox).toContain("useInboxPagination");
    expect(inbox).not.toContain("inboxFilterKey");
    expect(inbox).not.toContain("prevFilterKeyRef");
    expect(inbox).not.toContain("const [inboxCursor");
    expect(inbox).not.toContain("const [inboxAllItems");
    expect(inbox).not.toContain("const [inboxHasMore");
    expect(inbox).not.toContain("const [inboxTotal");
    expect(inbox).not.toContain("refetchInboxFull =");
    expect(inbox).not.toContain("finishInboxTaskLocally =");
    expect(inbox).not.toContain("refreshInboxAfterAction =");
  });

  it("keeps surat autosave logic out of SuratForm.tsx", () => {
    // Pass C: autosave debounce + draftSaveState moved to a hook.
    const hookPath = "src/features/surat/registration/lib/use-surat-autosave.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(hookPath)).toBe(true);
    const hook = read(hookPath);
    expect(hook).toContain("export const useSuratAutosave");
    // 900ms debounce is the contract; do not let it drift.
    expect(hook).toContain("900");
    // The save call site must live in the hook, not in the component.
    expect(hook).toContain("suratRegistrationApi");
    expect(hook).toContain("saveRegistrationDraft");

    // SuratForm must consume the hook and not redeclare the inline state
    // or its own debounce timer.
    expect(form).toContain("useSuratAutosave");
    expect(form).not.toContain('useState<"idle" | "saving" | "saved" | "error">');
    expect(form).not.toContain("window.setTimeout(() => {");
    // The original autosave useEffect has been removed; the
    // `}, 900);` debounce close must not appear inline any more.
    expect(form).not.toContain("}, 900);");
  });

  it("keeps surat draft restore lifecycle out of SuratForm.tsx", () => {
    // Pass D: activeDrafts, draftToRestore, draftLoading, refreshActiveDrafts
    // and the URL→fetch useEffect moved to a hook. The hydrate effect stays
    // in the component because it writes 12+ form-state setters.
    const hookPath = "src/features/surat/registration/lib/use-surat-draft-lifecycle.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(hookPath)).toBe(true);
    const hook = read(hookPath);
    expect(hook).toContain("export const useSuratDraftLifecycle");
    // The hook owns the list, the restore target, the loading flag, the
    // refresh callback, and the URL→fetch effect.
    expect(hook).toContain("getActiveRegistrationDrafts");
    expect(hook).toContain("getRegistrationDraft");
    expect(hook).toContain("refreshActiveDrafts");
    expect(hook).toContain("draftToRestore");

    // SuratForm must consume the hook and not redeclare the inline state
    // or its own URL→fetch useEffect.
    expect(form).toContain("useSuratDraftLifecycle");
    expect(form).not.toContain("useState<SuratRegistrationDraft[]>([])");
    expect(form).not.toContain('useState<SuratRegistrationDraft | null>(null)');
    // The local refreshActiveDrafts useCallback must be gone; the hook owns it.
    expect(form).not.toContain("suratRegistrationApi.getActiveRegistrationDrafts()");
    // The original URL→fetch useEffect opening is also gone.
    expect(form).not.toContain("const draftId = searchParams.get(\"draft\");");
  });

  it("keeps linked recommendation context out of SuratForm.tsx", () => {
    // Pass E: linkedDocumentContext state + recommendation parent summary
    // fetch + parentRecommendationItems memo + URL→state effect moved
    // to `useLinkedRecommendationContext`. The hydrate effect (Pass D)
    // and the form-reset path still call `setLinkedDocumentContext`,
    // so the setter stays exposed by the hook.
    const hookPath = "src/features/surat/registration/lib/use-linked-recommendation-context.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(hookPath)).toBe(true);
    const hook = read(hookPath);
    expect(hook).toContain("export const useLinkedRecommendationContext");
    expect(hook).toContain("export const parseLinkedDocumentContext");
    // The hook owns the parent summary fetch + the items memo.
    expect(hook).toContain("getRecommendationParentSummary");
    expect(hook).toContain("parentRecommendationItems");
    // The hook exposes the setter for the hydrate effect + reset path.
    expect(hook).toContain("setLinkedDocumentContext");

    // SuratForm must consume the hook and not redeclare the inline state,
    // the parent-summary fetch, the URL→state useEffect, the items memo,
    // or the multi-detail derivation. The setter call sites stay — only
    // the *declarations* must move.
    expect(form).toContain("useLinkedRecommendationContext");
    expect(form).not.toContain("const parseLinkedDocumentContext =");
    expect(form).not.toContain("const linkedDocumentContextEquals =");
    expect(form).not.toContain("useState<RecommendationParentSummaryData | null>(null)");
    expect(form).not.toContain("setRecommendationParentSummary(");
    expect(form).not.toContain("setRecommendationParentLoading(");
    expect(form).not.toContain("setRecommendationParentError(");
    expect(form).not.toContain("const loadRecommendationParentSummary = useCallback");
    expect(form).not.toContain("const parentRecommendationItems = useMemo");
    // The original URL→state useEffect opening is gone; the hook owns it.
    expect(form).not.toContain("const nextContext = parseLinkedDocumentContext(searchParams);");
  });

  it("keeps active-draft-id lifecycle out of SuratForm.tsx", () => {
    // Pass F: the `activeDraftId` / `activeDraftReservationId`
    // useState pair + their inline setters moved to a hook. The
    // write sites use the named wrappers (`markDraftCreated`,
    // `markDraftRestored`, `markDraftVoided`, `clearActiveDraftId`).
    // Reads of the destructured `activeDraftId` stay raw — only
    // the *declarations* and the inline setter sequences move.
    const hookPath = "src/features/surat/registration/lib/use-active-draft-lifecycle.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(hookPath)).toBe(true);
    const hook = read(hookPath);
    expect(hook).toContain("export const useActiveDraftLifecycle");
    expect(hook).toContain("markDraftCreated");
    expect(hook).toContain("markDraftRestored");
    expect(hook).toContain("markDraftVoided");
    expect(hook).toContain("clearActiveDraftId");

    // SuratForm must consume the hook and not redeclare the inline
    // state pair or the four setter sequences at L1449/L1857/L1896/L1998.
    expect(form).toContain("useActiveDraftLifecycle");
    expect(form).not.toContain('const [activeDraftId, setActiveDraftId]         = useState<string | null>(null);');
    expect(form).not.toContain('const [activeDraftReservationId, setActiveDraftReservationId] = useState<string | null>(null);');
    // No paired setter sequence at the four write sites — the wrappers
    // collapse each into a single call.
    expect(form).not.toContain("setActiveDraftId(draftToRestore.id);");
    expect(form).not.toContain("setActiveDraftId(draft.id);");
    expect(form).not.toContain("setActiveDraftId(null);");
  });

  it("keeps the auto-title formatter out of SuratForm.tsx", () => {
    // Pass I: the inline `buildAutoTitle` definition moved to
    // `src/features/surat/registration/lib/surat-title-formatters.ts`
    // as a pure helper. The form imports the helper and calls it
    // with a snapshot; the body of the title computation (the
    // category branching, the `formatIndonesianList` join, the
    // parent summary suffix derivation) lives in the helper only.
    const hookPath = "src/features/surat/registration/lib/surat-title-formatters.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(hookPath)).toBe(true);
    const hook = read(hookPath);
    expect(hook).toContain("export const buildAutoTitle");

    // The form must consume the helper and not redeclare the inline
    // closure that originally held the title-computation body.
    expect(form).toContain('import { buildAutoTitle }');
    expect(form).not.toContain("const buildAutoTitle = () => {");
    // The dead helper imports removed during the extraction must
    // not creep back: `formatIndonesianList`, `buildNonUnitRequestTitle`,
    // `getDepartmentTitlePart`, `getOfficeTitleSuffix` were only used
    // by the inline buildAutoTitle and now live in the helper.
    expect(form).not.toContain("formatIndonesianList,");
    expect(form).not.toContain("buildNonUnitRequestTitle,");
    expect(form).not.toContain("getDepartmentTitlePart,");
    expect(form).not.toContain("getOfficeTitleSuffix,");
  });

  it("keeps recommendation multi-detail builder imported from feature registration lib", () => {
    // Pass L: the recommendation multi-detail builder and helpers
    // are modularized under `src/features/surat/registration/lib/recommendation-multi-detail-builder.ts`.
    // SuratForm.tsx must import buildRecommendationMultiDetail,
    // syncRecommendationMultiDetailInput, and recommendationMultiDetailErrors from this feature lib.
    const builderPath = "src/features/surat/registration/lib/recommendation-multi-detail-builder.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(builderPath)).toBe(true);
    const builderCode = read(builderPath);
    expect(builderCode).toContain("export function buildRecommendationMultiDetail");
    expect(builderCode).toContain("export function syncRecommendationMultiDetailInput");
    expect(builderCode).toContain("export function recommendationMultiDetailErrors");

    expect(form).toContain('from "@/features/surat/registration/lib/recommendation-multi-detail-builder"');
    expect(form).not.toMatch(/from\s+["']@\/components\/surat\/recommendation-multi-detail["']/);
  });

  it("keeps wizard step constants out of SuratForm.tsx", () => {
    // Pass J1: step definitions and navigation logic moved to feature lib.
    const form = read("src/components/surat/SuratForm.tsx");
    expect(form).not.toContain("const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);");
    expect(form).not.toContain("activeWizardStep: 0 | 1 | 2 | 3");
    expect(form).toContain("useSuratWizardStepper");
  });

  it("keeps wizard stepper hook out of SuratForm.tsx", () => {
    // Pass J2A: The wizard stepper state and orchestration are extracted into a hook.
    // SuratForm.tsx must not declare the step state locally.
    const form = read("src/components/surat/SuratForm.tsx");
    expect(form).not.toContain("const [wizardStep, setWizardStep] = useState<WizardStep>");
    expect(form).not.toContain("const [wizardStep, setWizardStep] = useState");
    expect(form).toContain("useSuratWizardStepper");
    expect(form).toContain('from "@/features/surat/registration/lib/use-surat-wizard-stepper"');
  });

  it("keeps step-1 validation in canonical wizard-validation module", () => {
    // Pass J2B: step-1 pre-flight validation extracted to pure module.
    const validationPath = "src/features/surat/registration/lib/surat-wizard-validation.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(validationPath)).toBe(true);
    const validationCode = read(validationPath);
    expect(validationCode).toContain("export function validateStep1ForNumberGeneration");
    expect(validationCode).toContain("export interface Step1ValidationInput");
    expect(validationCode).toContain("export interface WizardValidationResult");

    // SuratForm imports the validator
    expect(form).toContain('from "@/features/surat/registration/lib/surat-wizard-validation"');
    expect(form).toContain("validateStep1ForNumberGeneration");

    // Inline step-1 validation blocks must not reappear in SuratForm
    expect(form).not.toContain('"Profil Sedang Diselaraskan"');
    expect(form).not.toContain('"Klasifikasi Belum Dipilih"');
    expect(form).not.toContain('"Kegunaan Form Belum Dipilih"');

    // Submit validation stays in SuratForm (not moved)
    expect(form).toContain("validateRegistration");
    expect(form).not.toContain('"Upload Belum Selesai"');
  });

  it("keeps final submit validation in canonical submit-validation module", () => {
    // Pass K1: final submit validation extracted to pure module.
    const validationPath = "src/features/surat/registration/lib/surat-submit-validation.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(validationPath)).toBe(true);
    const validationCode = read(validationPath);
    expect(validationCode).toContain("export function validateSuratSubmit");
    expect(validationCode).toContain("export interface SuratSubmitValidationInput");
    expect(validationCode).toContain("export interface SuratSubmitValidationResult");

    // SuratForm imports the validator
    expect(form).toContain('from "@/features/surat/registration/lib/surat-submit-validation"');
    expect(form).toContain("validateSuratSubmit(");

    // Inline validateRegistration blocks must not reappear in SuratForm
    expect(form).not.toContain('"Upload Belum Selesai"');
    expect(form).not.toContain('"Nomor Surat Belum Siap"');
    expect(form).not.toContain('"Tempat Wajib Diisi"');
    expect(form).not.toContain('"Pejabat Belum Lengkap"');

    // Submit handler stays in SuratForm (not moved)
    expect(form).toContain("const handleSubmit = async");
    expect(form).toContain("const validateRegistration = (signerAssignments");
    expect(validationCode).not.toContain("handleSubmit");
    expect(validationCode).not.toContain("toast(");
  });

  it("keeps pure submit command builder out of SuratForm", () => {
    // Pass K2A: pure submit payload builder extracted to pure module.
    const commandPath = "src/features/surat/registration/lib/surat-submit-command.ts";
    const form = read("src/components/surat/SuratForm.tsx");

    expect(exists(commandPath)).toBe(true);
    const commandCode = read(commandPath);
    expect(commandCode).toContain("export function buildInitialAttachmentMeta");
    expect(commandCode).toContain("export function buildRegistrationSubmitPayload");
    
    // SuratForm imports the pure helpers
    expect(form).toContain('from "@/features/surat/registration/lib/surat-submit-command"');
    expect(form).toContain("buildInitialAttachmentMeta(");
    expect(form).toContain("buildRegistrationSubmitPayload(");

    // Inline build logic must not reappear in SuratForm
    expect(form).not.toContain("const initialAttachmentMeta = Object.fromEntries(");
    expect(form).not.toMatch(/no_surat:\s*generatedNoSurat,/);
    expect(form).not.toMatch(/draft_id:\s*activeDraftId,/);
    expect(form).not.toMatch(/initial_attachment_meta:\s*initialAttachmentMeta,/);

    // Pure module constraints
    expect(commandCode).not.toContain("import React");
    expect(commandCode).not.toContain("import { supabase }");
    expect(commandCode).not.toContain("suratService");
    expect(commandCode).not.toContain("toast(");
  });
});
