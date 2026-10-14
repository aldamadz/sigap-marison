import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSuratDraftLifecycle } from "@/features/surat/registration/lib/use-surat-draft-lifecycle";
import { suratRegistrationApi } from "@/features/surat/registration/services/surat-registration-api";

vi.mock("@/features/surat/registration/services/surat-registration-api", () => ({
  suratRegistrationApi: { getActiveRegistrationDrafts: vi.fn(), getRegistrationDraft: vi.fn(), finishRegistrationDraft: vi.fn() },
}));

beforeEach(() => { vi.resetAllMocks(); vi.mocked(suratRegistrationApi.getActiveRegistrationDrafts).mockResolvedValue([]); });

describe("closed cancelled-number drafts", () => {
  it("Buat Baru stays fresh when the server has closed expired drafts", async () => {
    const setSearchParams = vi.fn();
    const params = { currentProfile: { id: "owner" }, isCurrentUserAdmin: false,
      searchParams: new URLSearchParams(), setSearchParams, toast: vi.fn() };
    const { result } = renderHook(() => useSuratDraftLifecycle(params));
    await waitFor(() => expect(suratRegistrationApi.getActiveRegistrationDrafts).toHaveBeenCalled());
    expect(result.current.activeDrafts).toEqual([]);
    expect(result.current.draftToRestore).toBeNull();
    expect(setSearchParams).not.toHaveBeenCalled();
    expect(suratRegistrationApi.getRegistrationDraft).not.toHaveBeenCalled();
  });

  it("a stale URL is cleared and cannot hydrate a dead reservation", async () => {
    const message = "Draft tidak ditemukan atau nomor sudah tidak aktif. Mulai pengajuan baru.";
    vi.mocked(suratRegistrationApi.getRegistrationDraft).mockRejectedValue(new Error(message));
    const toast = vi.fn(), setSearchParams = vi.fn();
    const params = { currentProfile: { id: "owner" }, isCurrentUserAdmin: false,
      searchParams: new URLSearchParams("draft=old"), setSearchParams, toast };
    const { result } = renderHook(() => useSuratDraftLifecycle(params));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Draft tidak dapat dibuka", description: message })));
    expect(setSearchParams).toHaveBeenCalledWith({}, { replace: true });
    expect(result.current.draftToRestore).toBeNull();
    expect(suratRegistrationApi.finishRegistrationDraft).not.toHaveBeenCalled();
  });
});
