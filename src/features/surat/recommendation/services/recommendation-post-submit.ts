/**
 * Extracted orchestration for the recommendation post-submit flow.
 *
 * Pass K2C1 — extracted from SuratForm.tsx handleSubmit.
 */
import { suratRecommendationApi } from "@/features/surat/recommendation/services/surat-recommendation-api";

export interface RecommendationPostSubmitContext {
  type?: string;
  parentSuratId?: string | null;
  taskId?: string | null;
  requiredBeforeStep?: number | null;
}

export interface RecommendationPostSubmitCommand {
  linkedDocumentContext: RecommendationPostSubmitContext | null | undefined;
  recommendationSuratId: string;
}

/**
 * Executes the post-registration orchestration for a recommendation document.
 * Includes task completion, document linking, and auto-approval.
 * Returns the autoSignWarning string (empty if successful or N/A).
 */
export async function executeRecommendationPostSubmit(
  command: RecommendationPostSubmitCommand,
  dependencies = {
    completeTask: suratRecommendationApi.completeRecommendationTask,
    linkDocument: suratRecommendationApi.linkRecommendationDocument,
    autoApprove: suratRecommendationApi.autoApproveRecommendationFirstStep,
  }
): Promise<string> {
  const context = command.linkedDocumentContext;
  if (!context || context.type !== "recommendation" || !context.parentSuratId) {
    return "";
  }

  let autoSignWarning = "";

  if (context.taskId) {
    await dependencies.completeTask(context.taskId, command.recommendationSuratId);
  } else {
    await dependencies.linkDocument(
      context.parentSuratId,
      command.recommendationSuratId,
      context.requiredBeforeStep ?? null
    );
  }

  try {
    await dependencies.autoApprove(command.recommendationSuratId);
  } catch (autoSignError: unknown) {
    autoSignWarning = autoSignError instanceof Error
      ? ` Tanda tangan otomatis belum berhasil: ${autoSignError.message}`
      : " Tanda tangan otomatis belum berhasil.";
  }

  return autoSignWarning;
}
