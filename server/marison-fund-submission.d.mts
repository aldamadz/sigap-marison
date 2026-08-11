export interface MarisonFundSubmissionInput {
  request?: {
    submissionNumber?: unknown;
    type?: unknown;
    title?: unknown;
    description?: unknown;
  };
  projectId?: unknown;
  division?: unknown;
  attachments?: unknown[];
  approvals?: unknown[];
}

export function mapMarisonFundSubmission(input: MarisonFundSubmissionInput): {
  endpoint: "/fund-submissions";
  kind: "fund";
  contractVersion: "vendor-openapi-fund-2026-08-11";
  payload: Record<string, unknown>;
};
