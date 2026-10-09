import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSuratAutosave } from "@/features/surat/registration/lib/use-surat-autosave";

const save = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/features/surat/registration/services/surat-registration-api", () => ({
  suratRegistrationApi: { saveRegistrationDraft: save },
}));
afterEach(() => { vi.useRealTimers(); save.mockClear(); });

it("preserves the active revision context in autosaved drafts", async () => {
  vi.useFakeTimers();
  const externalRevision = { eventId: "active-revision" };
  const params = {
    activeDraftId: "draft", generatedNoSurat: "001/TEST", draftToRestore: null,
    selectedUsage: { id: "usage" }, linkedDocumentContext: null, externalRevision,
    effectiveFormData: { project_id: "new-project" }, selectedFormId: "form", signers: [],
  };
  const { result, unmount } = renderHook(() => useSuratAutosave(params));
  await act(async () => { await vi.advanceTimersByTimeAsync(900); });
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith("draft", expect.objectContaining({ externalRevision,
    formData: { project_id: "new-project" } }), [], "details");
  expect(result.current[0]).toBe("saved");
  unmount();
});
