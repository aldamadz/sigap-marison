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
});
