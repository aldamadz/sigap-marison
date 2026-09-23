import { suratService } from "@/services/surat.service";

export const suratRecommendationApi = {
  getMyRecommendationTasks: (...args: Parameters<typeof suratService.getMyRecommendationTasks>) =>
    suratService.getMyRecommendationTasks(...args),
  getRecommendationParentSummary: (...args: Parameters<typeof suratService.getRecommendationParentSummary>) =>
    suratService.getRecommendationParentSummary(...args),
  claimRecommendationTask: (...args: Parameters<typeof suratService.claimRecommendationTask>) =>
    suratService.claimRecommendationTask(...args),
  completeRecommendationTask: (...args: Parameters<typeof suratService.completeRecommendationTask>) =>
    suratService.completeRecommendationTask(...args),
  finalizeRecommendationRevisionIfNeeded: (
    ...args: Parameters<typeof suratService.finalizeRecommendationRevisionIfNeeded>
  ) => suratService.finalizeRecommendationRevisionIfNeeded(...args),
  autoApproveRequesterFirstStep: (...args: Parameters<typeof suratService.autoApproveRequesterFirstStep>) =>
    suratService.autoApproveRequesterFirstStep(...args),
  autoApproveRecommendationFirstStep: (
    ...args: Parameters<typeof suratService.autoApproveRecommendationFirstStep>
  ) => suratService.autoApproveRecommendationFirstStep(...args),
  linkRecommendationDocument: (...args: Parameters<typeof suratService.linkRecommendationDocument>) =>
    suratService.linkRecommendationDocument(...args),
};
