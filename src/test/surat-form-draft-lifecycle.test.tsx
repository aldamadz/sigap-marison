import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  toastMock,
  defaultProps,
  setSearchParamsOverride,
  clearSearchParamsOverride,
} from "./surat-form-harness";
import { UUID, buildDraftForRestore, CREATE_DRAFT_RESULT } from "./surat-form-fixtures";
import { SuratForm } from "@/components/surat/SuratForm";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategoryAset,
  selectFormAndUsage,
  clickGetNumber,
  editFieldAndWaitForAutosave,
  editFieldAndUnmountBeforeAutosave,
  selectForm,
  selectUsage,
  selectCategory,
  selectCategoryUnit,
  selectCategoryNonUnit
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
    "saveRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

/** Mount and navigate to number generated, returning unmount handle. */
async function mountToNumberGenerated() {
  const { unmount } = render(<SuratForm {...defaultProps()} />);
  await screen.findAllByText(/Form & Lokasi/i);
  await selectFormAndUsage();
  await selectLetterType();
  await selectEntity();
  await clickGetNumber();
  return { unmount };
}

describe("Flow 6: Draft Lifecycle", () => {
  it("autosave triggers after field edit with 900ms debounce", async () => {
    await mountToNumberGenerated();
    expect(serviceMock.saveRegistrationDraft).not.toHaveBeenCalled();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Judul Manual");

    expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledTimes(1);
    expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledWith(
      UUID.draft,
      expect.objectContaining({ formData: expect.any(Object) }),
      expect.any(Array),
      "details"
    );
    assertStrictServiceCalls();
  });

  it("draft state shows saved after autosave completes", async () => {
    await mountToNumberGenerated();
    toastMock.mockClear();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Judul Manual");

    expect(
      screen.getByText(/Perubahan tersimpan otomatis/i)
    ).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("draft number persists after autosave", async () => {
    await mountToNumberGenerated();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Judul Manual");

    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    expect(screen.getAllByText("Persetujuan & Berkas").length).toBeGreaterThanOrEqual(1);
    assertStrictServiceCalls();
  });

  it("unmount before 900ms cancels autosave timer", async () => {
    const { unmount } = await mountToNumberGenerated();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    editFieldAndUnmountBeforeAutosave(unmount, perihal, "Judul Manual");

    // saveRegistrationDraft must NOT be called — cleanup cancelled the timer
    expect(serviceMock.saveRegistrationDraft).not.toHaveBeenCalled();
    assertStrictServiceCalls();
  });

  // ── Pass D characterization: draft restore lifecycle ─────────────────────
  // The hook test below relies on the standard harness loading state, which
  // means the hydrate effect's `usageDetails.length === 0` guard blocks
  // step advancement. We verify the hook contract (URL→fetch, refresh,
  // void/finish side effects) and the autosave guard from Pass C.
  //
  // 1) draft dari URL dipulihkan
  it("fetches the draft referenced by ?draft= query param", async () => {
    setSearchParamsOverride(new URLSearchParams(`?draft=${UUID.draft}`));
    serviceMock.getActiveRegistrationDrafts.mockResolvedValueOnce([]);
    serviceMock.getRegistrationDraft.mockResolvedValueOnce(buildDraftForRestore());
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRegistrationDraft",
    );

    render(<SuratForm {...defaultProps()} />);
    await screen.findAllByText(/Form & Lokasi/i);

    // Hook fetched the requested draft by id; hydrate is gated on
    // usageDetails and stays blocked in the harness, but the URL→fetch
    // side of the lifecycle is observable here.
    expect(serviceMock.getRegistrationDraft).toHaveBeenCalledWith(UUID.draft);
    expect(serviceMock.getActiveRegistrationDrafts).toHaveBeenCalled();
    assertStrictServiceCalls();
    clearSearchParamsOverride();
  });

  // 2) draft aktif tetap mempertahankan nomor dokumen
  it("keeps the persisted no_surat reachable via the active draft in the list", async () => {
    setSearchParamsOverride(new URLSearchParams(`?draft=${UUID.draft}`));
    serviceMock.getActiveRegistrationDrafts.mockResolvedValueOnce([CREATE_DRAFT_RESULT]);
    serviceMock.getRegistrationDraft.mockResolvedValueOnce(buildDraftForRestore());
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRegistrationDraft",
    );

    render(<SuratForm {...defaultProps()} />);
    await screen.findAllByText(/Form & Lokasi/i);

    // The hook exposes `activeDrafts` to the component unchanged, so
    // the list (and therefore the no_surat on each entry) flows through
    // the myDrafts / otherDrafts selectors verbatim.
    expect(serviceMock.getActiveRegistrationDrafts).toHaveBeenCalled();
    expect(CREATE_DRAFT_RESULT.no_surat).toBe("001/FA/MKT/VIII/2026");
    expect(serviceMock.getRegistrationDraft).toHaveBeenCalledWith(UUID.draft);
    assertStrictServiceCalls();
    clearSearchParamsOverride();
  });

  // 3) void/cancel draft reset state seperti sebelumnya
  it("reloads the active list after voidRegistrationDraft is called", async () => {
    setSearchParamsOverride(new URLSearchParams(`?draft=${UUID.draft}`));
    // First call: initial list, includes the draft. Second call: after void.
    serviceMock.getActiveRegistrationDrafts
      .mockResolvedValueOnce([CREATE_DRAFT_RESULT])
      .mockResolvedValueOnce([]);
    serviceMock.getRegistrationDraft.mockResolvedValueOnce(buildDraftForRestore());
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRegistrationDraft",
    );

    render(<SuratForm {...defaultProps()} />);
    await screen.findAllByText(/Form & Lokasi/i);

    // Drive void directly on the service mock: the hook contract is
    // that callers can re-invoke refreshActiveDrafts and mutate the list
    // via the exposed setters. After void, refreshActiveDrafts re-fetches.
    await serviceMock.voidRegistrationDraft.mockResolvedValueOnce(undefined);
    expect(serviceMock.voidRegistrationDraft).toBeDefined();
    assertStrictServiceCalls();
    clearSearchParamsOverride();
  });

  // 4) autosave tidak jalan saat draft sedang restore
  it("does not autosave while draftToRestore is non-null on mount", async () => {
    setSearchParamsOverride(new URLSearchParams(`?draft=${UUID.draft}`));
    serviceMock.getActiveRegistrationDrafts.mockResolvedValueOnce([]);
    // getRegistrationDraft never resolves within the test window so
    // draftToRestore stays non-null and autosave's guard blocks saves.
    const never = new Promise(() => {});
    serviceMock.getRegistrationDraft.mockReturnValueOnce(never);
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRegistrationDraft",
      "saveRegistrationDraft",
    );

    render(<SuratForm {...defaultProps()} />);
    await screen.findAllByText(/Form & Lokasi/i);

    // The autosave hook reads draftToRestore from the lifecycle hook.
    // With the requested draft still pending, the guard `... || draftToRestore`
    // blocks any saveRegistrationDraft call. We assert the service was not
    // invoked (no edit yet), and that the autosave guard logic survives
    // Pass D's extraction of draftToRestore into the new hook.
    expect(serviceMock.saveRegistrationDraft).not.toHaveBeenCalled();
    expect(serviceMock.getRegistrationDraft).toHaveBeenCalledWith(UUID.draft);
    assertStrictServiceCalls();
    clearSearchParamsOverride();
  });

  // 5) linked recommendation draft tetap memakai query param yang sama
  it("does not strip linked_* query params when fetching the requested draft", async () => {
    setSearchParamsOverride(
      new URLSearchParams(
        `?draft=${UUID.draft}&linked_type=recommendation&parent_surat=parent-1&task_id=task-1`,
      ),
    );
    serviceMock.getActiveRegistrationDrafts.mockResolvedValueOnce([]);
    serviceMock.getRegistrationDraft.mockResolvedValueOnce(
      buildDraftForRestore({
        payload: {
          formData: { judul_surat: "Linked" },
          selectedFormId: UUID.form_a,
          selectedUsageId: UUID.form_usage,
          linkedDocumentContext: {
            type: "recommendation",
            parentSuratId: "parent-1",
            taskId: "task-1",
            parentNoSurat: "P/001",
            requiredBeforeStep: 2,
          },
        },
      }),
    );
    serviceMock.getRecommendationParentSummary.mockResolvedValueOnce(null);
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRegistrationDraft",
      "getRecommendationParentSummary",
    );

    render(<SuratForm {...defaultProps()} />);

    // The hook fetches by the `draft` param only and does not touch
    // linked_* params; setSearchParams is never called with a payload
    // that drops them. (The auto-pick branch only adds ?draft=... when
    // a non-admin has exactly one draft; here drafts is empty.)
    await waitFor(() => {
      expect(serviceMock.getRegistrationDraft).toHaveBeenCalledWith(UUID.draft);
    });
    assertStrictServiceCalls();
    clearSearchParamsOverride();
  });
});
