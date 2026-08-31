import { useCallback, useEffect, useMemo, useState } from "react";
import { suratRecommendationApi } from "@/features/surat/recommendation/services/surat-recommendation-api";
import type { RecommendationParentSummary as RecommendationParentSummaryData } from "@/services/surat.service";
import type { TableRow, LinkedDocumentContext } from "@/components/surat/form/surat-form-types";
import { normalizeTableRows } from "@/components/surat/form/surat-form-schema";

export type { LinkedDocumentContext } from "@/components/surat/form/surat-form-types";

/**
 * Build a `LinkedDocumentContext` from a URL's search params, or return
 * `null` if the URL does not describe a recommendation link.
 *
 * Mirrors the inline `parseLinkedDocumentContext` helper that previously
 * lived at the top of `SuratForm.tsx`. Identical behaviour, including the
 * "only returns non-null when `linked_type=recommendation` AND
 * `parent_surat` is present" guard.
 */
export const parseLinkedDocumentContext = (
  params: URLSearchParams,
): LinkedDocumentContext | null => {
  const type = params.get("linked_type");
  const parentSuratId = params.get("parent_surat");
  if (type !== "recommendation" || !parentSuratId) return null;
  const requiredBeforeStep = Number(params.get("required_before_step") || "");
  return {
    type: "recommendation",
    parentSuratId,
    parentNoSurat: params.get("parent_no_surat") || undefined,
    requiredBeforeStep:
      Number.isFinite(requiredBeforeStep) && requiredBeforeStep > 0
        ? requiredBeforeStep
        : null,
    formId: params.get("form_id") || undefined,
    usageId: params.get("usage_id") || undefined,
    departmentId: params.get("dept_id") || undefined,
    letterTypeId: params.get("letter_type_id") || undefined,
    taskId: params.get("task_id") || undefined,
  };
};

const linkedDocumentContextEquals = (
  left: LinkedDocumentContext | null,
  right: LinkedDocumentContext | null,
) => JSON.stringify(left || null) === JSON.stringify(right || null);

export type UseLinkedRecommendationContextParams = {
  /** react-router URLSearchParams (read-only access by the hook). */
  searchParams: URLSearchParams;
};

export type UseLinkedRecommendationContextResult = {
  /** The currently-resolved linked recommendation context, or null. */
  linkedDocumentContext: LinkedDocumentContext | null;
  /** Setter exposed so the draft-restore effect and the reset path can mutate it. */
  setLinkedDocumentContext: React.Dispatch<
    React.SetStateAction<LinkedDocumentContext | null>
  >;
  /** Server-returned summary of the recommendation parent document. */
  recommendationParentSummary: RecommendationParentSummaryData | null;
  /** True while the parent summary request is in flight. */
  recommendationParentLoading: boolean;
  /** Last error message from the parent summary request, if any. */
  recommendationParentError: string | null;
  /**
   * Table rows extracted from the parent summary's `form_input_data`.
   * Empty when the parent summary is missing or has no tabular payload.
   */
  parentRecommendationItems: TableRow[];
  /** Re-run the parent summary fetch (used by the retry button on the summary panel). */
  loadRecommendationParentSummary: () => Promise<void>;
  /** Convenience: `linkedDocumentContext.parentNoSurat ?? null`. */
  parentNoSurat: string | null;
  /** Convenience: `linkedDocumentContext?.type === "recommendation"`. */
  isRecommendationFlow: boolean;
};

/**
 * Linked-recommendation context controller for SuratForm.
 *
 * Owns:
 *   - `linkedDocumentContext` (initial value derived from searchParams;
 *      the URL→state effect re-syncs when the URL changes)
 *   - `recommendationParentSummary` / `loading` / `error` (the result of
 *      `suratRecommendationApi.getRecommendationParentSummary(taskId)`)
 *   - `parentRecommendationItems` (memoized table rows extracted from
 *      the parent's `form_input_data`; same key-preference order as the
 *      original inline memo: items → detail_barang → barang →
 *      request_items → any field with nama_barang/nama/barang/name)
 *   - the URL→state effect that re-parses `?linked_*=...` whenever the
 *      URL changes (and clears the context if the URL loses its link)
 *   - the auto-fire useEffect that re-fetches the parent summary
 *      whenever `linkedDocumentContext` changes
 *
 * Pass E refactor: behaviour-preserving extraction only. Every guard,
 * every effect dependency, every derivation rule is copied verbatim from
 * `SuratForm.tsx`. The hook does NOT touch:
 *   - `activeDraftId` (Pass C / Pass D scope)
 *   - autosave (Pass C)
 *   - draft restore / `?draft=` lifecycle (Pass D)
 *   - submit / signers / PDF
 *   - the `formData.form_input_data[RECOMMENDATION_MULTI_DETAIL_KEY]`
 *      `useMemo` (component-owned; depends on local form data)
 *
 * `setLinkedDocumentContext` is exposed because the draft-restore
 * effect (Pass D) and the form-reset path still need to write it
 * directly when re-hydrating a saved draft or clearing the form.
 */
export const useLinkedRecommendationContext = (
  params: UseLinkedRecommendationContextParams,
): UseLinkedRecommendationContextResult => {
  const { searchParams } = params;

  const [linkedDocumentContext, setLinkedDocumentContext] =
    useState<LinkedDocumentContext | null>(() => parseLinkedDocumentContext(searchParams));
  const [recommendationParentSummary, setRecommendationParentSummary] =
    useState<RecommendationParentSummaryData | null>(null);
  const [recommendationParentLoading, setRecommendationParentLoading] = useState(false);
  const [recommendationParentError, setRecommendationParentError] = useState<string | null>(null);

  useEffect(() => {
    const nextContext = parseLinkedDocumentContext(searchParams);
    if (nextContext) {
      setLinkedDocumentContext((previous) =>
        linkedDocumentContextEquals(previous, nextContext) ? previous : nextContext,
      );
      return;
    }
    if (!searchParams.get("draft")) {
      setLinkedDocumentContext(null);
    }
  }, [searchParams]);

  const loadRecommendationParentSummary = useCallback(async () => {
    const taskId =
      linkedDocumentContext?.type === "recommendation" ? linkedDocumentContext.taskId : null;
    if (!taskId) {
      setRecommendationParentSummary(null);
      setRecommendationParentError(null);
      return;
    }
    setRecommendationParentLoading(true);
    setRecommendationParentError(null);
    try {
      setRecommendationParentSummary(
        await suratRecommendationApi.getRecommendationParentSummary(taskId),
      );
    } catch (error) {
      setRecommendationParentSummary(null);
      setRecommendationParentError(
        error instanceof Error ? error.message : "Ringkasan pengajuan induk gagal dimuat.",
      );
    } finally {
      setRecommendationParentLoading(false);
    }
  }, [linkedDocumentContext]);

  useEffect(() => {
    void loadRecommendationParentSummary();
  }, [loadRecommendationParentSummary]);

  const parentRecommendationItems = useMemo(() => {
    if (!recommendationParentSummary?.form_input_data) return [] as TableRow[];
    const input = recommendationParentSummary.form_input_data;
    const toRows = (value: unknown) =>
      Array.isArray(value)
        ? value.filter(
            (row): row is TableRow =>
              Boolean(row) && typeof row === "object" && !Array.isArray(row),
          )
        : [];
    const preferredKeys = ["items", "detail_barang", "barang", "request_items"];
    const preferred = preferredKeys.map((key) => toRows(input[key])).find((rows) => rows.length > 0);
    const rows =
      preferred ||
      Object.values(input)
        .map(toRows)
        .find((candidate) =>
          candidate.some((row) =>
            Boolean(String(row.nama_barang || row.nama || row.barang || row.name || "").trim()),
          ),
        ) ||
      [];

    return rows
      .map((row, index) => ({
        ...row,
        parent_item_index: index + 1,
        parent_item_name: String(
          row.nama_barang || row.nama || row.barang || row.name || "",
        ).trim(),
      }))
      .filter((row) => Boolean(row.parent_item_name));
  }, [recommendationParentSummary]);

  return {
    linkedDocumentContext,
    setLinkedDocumentContext,
    recommendationParentSummary,
    recommendationParentLoading,
    recommendationParentError,
    parentRecommendationItems,
    loadRecommendationParentSummary,
    parentNoSurat: linkedDocumentContext?.parentNoSurat ?? null,
    isRecommendationFlow: linkedDocumentContext?.type === "recommendation",
  };
};

// Re-export so the component can keep importing `normalizeTableRows` for
// its own consumer without an extra import path.
export { normalizeTableRows };
