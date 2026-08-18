import { describe, expect, it } from "vitest";
import {
  mapSuratRejectionRpcError,
  normalizeSuratRejectionRequest,
} from "../../backend/src/lib/surat-rejection";

describe("surat rejection API boundary", () => {
  it("normalizes the canonical payload", () => {
    expect(normalizeSuratRejectionRequest({
      document_number: " 001/UAI/PBO/VIII/2026 ",
      reason: " Tidak sesuai anggaran ",
      note: " Ajukan ulang bulan depan ",
    })).toEqual({
      documentNumber: "001/UAI/PBO/VIII/2026",
      reason: "Tidak sesuai anggaran",
      note: "Ajukan ulang bulan depan",
    });
  });

  it("accepts request number and Indonesian aliases", () => {
    expect(normalizeSuratRejectionRequest({
      request_number: "REQ-1",
      alasan: "Ditolak",
      catatan: "Perbaiki rincian",
    })).toEqual({ documentNumber: "REQ-1", reason: "Ditolak", note: "Perbaiki rincian" });
  });

  it.each([
    [null, "object JSON"],
    [{ document_number: "", reason: "x" }, "Nomor dokumen wajib"],
    [{ document_number: "DOC-1", reason: "" }, "Alasan penolakan wajib"],
    [{ document_number: "DOC-1", request_number: "DOC-2", reason: "x" }, "nilai alias yang berbeda"],
    [{ document_number: 123, reason: "x" }, "harus berupa teks"],
    [{ document_number: "DOC-1", reason: "x", note: "a".repeat(2001) }, "maksimal 2000"],
  ])("rejects invalid payload %#", (payload, message) => {
    expect(() => normalizeSuratRejectionRequest(payload)).toThrow(message);
  });

  it("maps database errors without exposing unexpected internals", () => {
    expect(mapSuratRejectionRpcError({ code: "P0002", message: "secret" })).toEqual({
      status: 404,
      message: "Dokumen tidak ditemukan atau tidak tersedia untuk ditolak.",
    });
    expect(mapSuratRejectionRpcError({ code: "42501", message: "secret" }).status).toBe(403);
    expect(mapSuratRejectionRpcError({ code: "55000", message: "already rejected" }).status).toBe(409);
    expect(mapSuratRejectionRpcError({ code: "XX000", message: "database detail" })).toEqual({
      status: 503,
      message: "Gagal memproses penolakan dokumen.",
    });
  });
});
