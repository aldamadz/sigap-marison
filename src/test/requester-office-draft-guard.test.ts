import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSuratDraftLifecycle } from "@/features/surat/registration/lib/use-surat-draft-lifecycle";
import { suratRegistrationApi } from "@/features/surat/registration/services/surat-registration-api";
import type { SuratRegistrationDraft } from "@/services/surat.service";

vi.mock("@/features/surat/registration/services/surat-registration-api", () => ({
  suratRegistrationApi: { getActiveRegistrationDrafts: vi.fn(), getRegistrationDraft: vi.fn(), finishRegistrationDraft: vi.fn() },
}));

const profile = { id: "requester", office_id: "kc-magelang", department_id: "tech" };
const draft = (office = profile.office_id): SuratRegistrationDraft => ({
  id: "draft", created_by: profile.id, reservation_id: "reservation", no_surat: "001/old-office",
  status: "DRAFT", payload: { formData: { office_id: office, dept_id: profile.department_id } },
  signer_assignments: [], current_section: "details", expires_at: "2099-01-01", created_at: "", updated_at: "",
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(suratRegistrationApi.getActiveRegistrationDrafts).mockResolvedValue([]);
});

const setup = (restored: SuratRegistrationDraft, isAdmin = false, url = "draft=draft") => {
  vi.mocked(suratRegistrationApi.getRegistrationDraft).mockResolvedValue(restored);
  const toast = vi.fn();
  const setSearchParams = vi.fn();
  const params = { currentProfile: profile, isCurrentUserAdmin: isAdmin,
    searchParams: new URLSearchParams(url), toast, setSearchParams };
  return { ...renderHook(() => useSuratDraftLifecycle(params)), toast, setSearchParams };
};

describe("requester office draft hydration boundary", () => {
  it("blocks a concrete stale-office restore before the form can overwrite the current profile location", async () => {
    const old = draft("kc-bandung");
    const { result, toast, setSearchParams } = setup(old);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Draft tidak dapat dibuka", description: expect.stringContaining("Batalkan draft lama"),
    })));
    expect(result.current.draftToRestore).toBeNull();
    expect(setSearchParams).toHaveBeenCalledWith({}, { replace: true });
    expect(old.payload.formData.office_id).toBe("kc-bandung");
    expect(old.no_surat).toBe("001/old-office");
    expect(suratRegistrationApi.finishRegistrationDraft).not.toHaveBeenCalled();
  });

  it("does not auto-pick the same incompatible draft after clearing its URL", async () => {
    vi.mocked(suratRegistrationApi.getActiveRegistrationDrafts).mockResolvedValue([draft("kc-bandung")]);
    const { result, setSearchParams } = setup(draft(), false, "");
    await waitFor(() => expect(result.current.activeDrafts).toHaveLength(1));
    expect(setSearchParams).not.toHaveBeenCalled();
    expect(result.current.draftToRestore).toBeNull();
  });

  it("restores a matching draft and retains its identity and signer assignments", async () => {
    const matching = draft();
    const { result } = setup(matching);
    await waitFor(() => expect(result.current.draftToRestore).toBe(matching));
  });

  it.each(["department", "owner", "fake-revision"])("blocks %s mismatch", async kind => {
    const invalid = draft();
    if (kind === "department") invalid.payload.formData.dept_id = "foreign";
    if (kind === "owner") invalid.created_by = "someone-else";
    if (kind === "fake-revision") {
      invalid.payload.formData.office_id = "kc-bandung";
      invalid.payload.externalRevision = { eventId: "untrusted-event" };
    }
    const { result, toast } = setup(invalid);
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(result.current.draftToRestore).toBeNull();
  });

  it.each(["admin", "revision"])("preserves the %s document office, not today's profile", async kind => {
    const historic = draft("kc-bandung");
    if (kind === "revision") historic.revision_event_id = "event";
    const { result } = setup(historic, kind === "admin");
    await waitFor(() => expect(result.current.draftToRestore).toBe(historic));
  });

  it("discards a stale asynchronous response when the requested draft changes", async () => {
    let resolveOld!: (value: SuratRegistrationDraft) => void;
    const pending = new Promise<SuratRegistrationDraft>(resolve => { resolveOld = resolve; });
    vi.mocked(suratRegistrationApi.getRegistrationDraft).mockReturnValueOnce(pending).mockResolvedValueOnce(draft());
    const params = { currentProfile: profile, isCurrentUserAdmin: false,
      toast: vi.fn(), setSearchParams: vi.fn() };
    const { result, rerender } = renderHook(({ searchParams }) => useSuratDraftLifecycle({ ...params, searchParams }),
      { initialProps: { searchParams: new URLSearchParams("draft=old") } });
    rerender({ searchParams: new URLSearchParams("draft=new") });
    await waitFor(() => expect(result.current.draftToRestore?.payload.formData.office_id).toBe("kc-magelang"));
    await act(async () => resolveOld(draft("kc-bandung")));
    expect(result.current.draftToRestore?.payload.formData.office_id).toBe("kc-magelang");
    expect(params.toast).not.toHaveBeenCalled();
  });
});
