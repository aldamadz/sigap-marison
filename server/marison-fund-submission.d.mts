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
  contractVersion: "vendor-openapi-fund-2026-08-12-complete-fields";
  payload: Record<string, unknown>;
};

export function resolveMarisonFundDivision(input: {
  employees?: Array<{ nik?: unknown; division?: unknown }>;
  requesterNik?: unknown;
}): string;

export function normalizeMarisonFundApprovalRole(value: unknown): "staff" | "manager" | "director";
