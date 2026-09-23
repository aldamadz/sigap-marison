import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSuratDraftLifecycle } from "@/features/surat/registration/lib/use-surat-draft-lifecycle";
import { suratRegistrationApi } from "@/features/surat/registration/services/surat-registration-api";

vi.mock("@/features/surat/registration/services/surat-registration-api", () => ({
  suratRegistrationApi: {
    getActiveRegistrationDrafts: vi.fn(),
    getRegistrationDraft: vi.fn(),
    finishRegistrationDraft: vi.fn(),
  },
}));

describe("useSuratDraftLifecycle — finishSubmittedDraft (Pass K2C2)", () => {
  let toastMock: any;
  let setSearchParamsMock: any;
  let searchParamsMock: URLSearchParams;

  beforeEach(() => {
    vi.resetAllMocks();
    toastMock = vi.fn();
    setSearchParamsMock = vi.fn();
    searchParamsMock = new URLSearchParams();

    // Default mock setup for initialization
    vi.mocked(suratRegistrationApi.getActiveRegistrationDrafts).mockResolvedValue([
      { id: "draft-1" } as any,
      { id: "draft-2" } as any,
    ]);
  });

  const defaultProfile = { id: "u1" };

  const setupHook = () => {
    return renderHook(() =>
      useSuratDraftLifecycle({
        currentProfile: defaultProfile,
        isCurrentUserAdmin: false,
        searchParams: searchParamsMock,
        setSearchParams: setSearchParamsMock,
        toast: toastMock,
      })
    );
  };

  it("1. Null draft ID menjadi no-op", async () => {
    const { result } = setupHook();
    await act(async () => {
      await result.current.finishSubmittedDraft(null);
    });
    expect(suratRegistrationApi.finishRegistrationDraft).not.toHaveBeenCalled();
  });

  it("2. Null draft ID tidak mengubah activeDrafts dan resolve tanpa error", async () => {
    const { result } = setupHook();
    // wait for initial fetch to settle
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.activeDrafts).toHaveLength(2);

    await act(async () => {
      await result.current.finishSubmittedDraft(null);
    });
    expect(result.current.activeDrafts).toHaveLength(2);
  });

  it("3. Draft ID valid memanggil API tepat sekali", async () => {
    vi.mocked(suratRegistrationApi.finishRegistrationDraft).mockResolvedValue(undefined);
    const { result } = setupHook();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.finishSubmittedDraft("draft-1");
    });
    expect(suratRegistrationApi.finishRegistrationDraft).toHaveBeenCalledTimes(1);
    expect(suratRegistrationApi.finishRegistrationDraft).toHaveBeenCalledWith("draft-1", "SUBMITTED");
  });

  it("4. Draft berhasil dihapus dari activeDrafts setelah API resolve", async () => {
    vi.mocked(suratRegistrationApi.finishRegistrationDraft).mockResolvedValue(undefined);
    const { result } = setupHook();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    await act(async () => {
      await result.current.finishSubmittedDraft("draft-1");
    });

    await waitFor(() => {
      expect(result.current.activeDrafts).toHaveLength(1);
    }, { timeout: 2000 });
    expect(result.current.activeDrafts[0].id).toBe("draft-2");
  });

  it("5. API pending belum menghapus draft lokal", async () => {
    let resolveApi: any;
    const promise = new Promise((resolve) => { resolveApi = resolve; });
    vi.mocked(suratRegistrationApi.finishRegistrationDraft).mockReturnValue(promise as any);

    const { result } = setupHook();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Fire without waiting for resolution
    let finished = false;
    act(() => {
      result.current.finishSubmittedDraft("draft-1").then(() => { finished = true; });
    });

    // The draft is still there
    expect(result.current.activeDrafts).toHaveLength(2);
    expect(finished).toBe(false);

    // Resolve API
    await act(async () => {
      resolveApi();
    });

    // Now it's removed
    await waitFor(() => {
      expect(result.current.activeDrafts).toHaveLength(1);
    }, { timeout: 2000 });
    expect(finished).toBe(true);
  });

  it("6. API reject mempertahankan seluruh activeDrafts dan error diteruskan", async () => {
    vi.mocked(suratRegistrationApi.finishRegistrationDraft).mockRejectedValue(new Error("API Failed"));
    const { result } = setupHook();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await expect(async () => {
      await act(async () => {
        await result.current.finishSubmittedDraft("draft-1");
      });
    }).rejects.toThrow("API Failed");

    // activeDrafts should be unchanged
    expect(result.current.activeDrafts).toHaveLength(2);
  });
});
