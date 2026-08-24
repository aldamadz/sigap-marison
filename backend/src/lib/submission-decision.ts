import { createHash, timingSafeEqual } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_KEYS = new Set(["event_id", "document_number", "decision", "reason", "decided_at"]);

export type SubmissionDecision = "rejected" | "revision_required";

export type SubmissionDecisionInput = {
  eventId: string;
  documentNumber: string;
  decision: SubmissionDecision;
  reason: string;
  decidedAt: string;
  payloadHash: string;
};

const invalid = (message: string) => {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  return error;
};

export const normalizeSubmissionDecision = (value: unknown): SubmissionDecisionInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Body keputusan harus berupa object JSON.");
  }

  const input = value as Record<string, unknown>;
  const unknownKeys = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw invalid(`Field tidak didukung: ${unknownKeys.join(", ")}.`);
  }

  const eventId = String(input.event_id ?? "").trim();
  const documentNumber = String(input.document_number ?? "").trim();
  const decision = String(input.decision ?? "").trim() as SubmissionDecision;
  const reason = String(input.reason ?? "").trim();
  const decidedAt = String(input.decided_at ?? "").trim();

  if (!UUID_PATTERN.test(eventId)) throw invalid("event_id harus UUID yang valid.");
  if (!documentNumber || documentNumber.length > 160) throw invalid("document_number wajib diisi dan maksimal 160 karakter.");
  if (!/^[0-9A-Za-z./_-]+$/.test(documentNumber)) throw invalid("document_number mengandung karakter yang tidak didukung.");
  if (decision !== "rejected" && decision !== "revision_required") throw invalid("decision harus rejected atau revision_required.");
  if (reason.length < 5 || reason.length > 1000) throw invalid("reason wajib berisi 5 sampai 1000 karakter.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(decidedAt) || Number.isNaN(Date.parse(decidedAt))) {
    throw invalid("decided_at harus timestamp ISO 8601 dengan zona waktu.");
  }

  const canonical = JSON.stringify({
    event_id: eventId,
    document_number: documentNumber,
    decision,
    reason,
    decided_at: new Date(decidedAt).toISOString(),
  });

  return {
    eventId,
    documentNumber,
    decision,
    reason,
    decidedAt: new Date(decidedAt).toISOString(),
    payloadHash: createHash("sha256").update(canonical).digest("hex"),
  };
};

export const isValidSubmissionDecisionToken = (provided: unknown, configured: unknown): boolean => {
  const actual = Buffer.from(String(provided ?? ""));
  const expected = Buffer.from(String(configured ?? ""));
  return expected.length >= 32 && actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const mapSubmissionDecisionRpcError = (error: { code?: string; message?: string }) => {
  const message = String(error?.message || "Keputusan sistem departemen gagal diproses.");
  if (error?.code === "P0002") return { status: 404, message };
  if (error?.code === "23505" || error?.code === "40001" || error?.code === "55000") return { status: 409, message };
  if (error?.code === "22023" || error?.code === "23514") return { status: 422, message };
  if (error?.code === "42501") return { status: 403, message };
  return { status: 500, message: "Keputusan sistem departemen gagal diproses." };
};
