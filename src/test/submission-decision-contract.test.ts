import { describe, expect, it } from "vitest";
import {
  isValidSubmissionDecisionToken,
  mapSubmissionDecisionRpcError,
  normalizeSubmissionDecision,
} from "../../backend/src/lib/submission-decision";

const validRequest = {
  event_id: "b03a2bcd-83ea-4ff8-8bb9-02829192ed85",
  document_number: "041/UAI/MKT.1/VIII/2026",
  decision: "revision_required",
  reason: "Jumlah barang perlu disesuaikan.",
  decided_at: "2026-08-18T14:00:00+07:00",
};

describe("external submission decision contract", () => {
  it("normalizes the strict five-field contract deterministically", () => {
    const first = normalizeSubmissionDecision(validRequest);
    const second = normalizeSubmissionDecision({ ...validRequest });
    expect(first).toMatchObject({
      eventId: validRequest.event_id,
      documentNumber: validRequest.document_number,
      decision: "revision_required",
      reason: validRequest.reason,
      decidedAt: "2026-08-18T07:00:00.000Z",
    });
    expect(first.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.payloadHash).toBe(first.payloadHash);
  });

  it.each(["note", "revision_scope", "affected_items", "external_reference"])("rejects unsupported field %s", (field) => {
    expect(() => normalizeSubmissionDecision({ ...validRequest, [field]: "forbidden" })).toThrow("Field tidak didukung");
  });

  it("requires a UUID event id and timezone-aware timestamp", () => {
    expect(() => normalizeSubmissionDecision({ ...validRequest, event_id: "event-1" })).toThrow("UUID");
    expect(() => normalizeSubmissionDecision({ ...validRequest, decided_at: "2026-08-18T14:00:00" })).toThrow("ISO 8601");
  });

  it("compares machine tokens without accepting short or mismatched values", () => {
    const token = "a".repeat(32);
    expect(isValidSubmissionDecisionToken(token, token)).toBe(true);
    expect(isValidSubmissionDecisionToken("short", token)).toBe(false);
    expect(isValidSubmissionDecisionToken("b".repeat(32), token)).toBe(false);
  });

  it("maps conflicts and validation errors without exposing generic database failures", () => {
    expect(mapSubmissionDecisionRpcError({ code: "55000", message: "Event sudah digunakan" })).toEqual({ status: 409, message: "Event sudah digunakan" });
    expect(mapSubmissionDecisionRpcError({ code: "22023", message: "Dokumen belum dikirim" })).toEqual({ status: 422, message: "Dokumen belum dikirim" });
    expect(mapSubmissionDecisionRpcError({ code: "XX000", message: "secret detail" })).toEqual({ status: 500, message: "Keputusan sistem departemen gagal diproses." });
  });
});
