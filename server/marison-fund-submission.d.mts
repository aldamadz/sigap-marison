export interface MarisonFundSubmissionInput {
  request?: {
    submissionNumber?: unknown;
    type?: unknown;
    title?: unknown;
    description?: unknown;
    amount?: unknown;
    items?: unknown[];
  };
  projectId?: unknown;
  branchId?: unknown;
  division?: unknown;
  attachments?: unknown[];
  approvals?: unknown[];
}

export function mapMarisonFundSubmission(input: MarisonFundSubmissionInput): {
  endpoint: "/fund-submissions";
  kind: "fund";
  contractVersion: "vendor-openapi-fund-2026-08-26-branch-items";
  payload: Record<string, unknown>;
};

export function mapKeu1ItemsForFund(items: unknown): Array<{
  nama_barang: string;
  jumlah: number;
  satuan: string;
  nominal: number;
}>;

export function resolveMarisonFundDivision(input: {
  employees?: Array<{ nik?: unknown; division?: unknown }>;
  requesterNik?: unknown;
}): string;

export function resolveMarisonFundBranch(input: {
  employees?: Array<{ nik?: unknown; branch?: { id?: unknown; name?: unknown } }>;
  requesterNik?: unknown;
}): number;

export function normalizeMarisonFundApprovalRole(value: unknown): "staff" | "manager" | "director";
