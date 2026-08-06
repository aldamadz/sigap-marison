import { describe, it, expect } from "vitest";
import {
  securityHeaders,
  withSecurityHeaders,
  sendJson,
  assertRequestSize,
  contentTypes,
  sanitizeDownloadFilename,
  sanitizeFilenameStem,
  filenameHeaderValue,
  contentTypeForFile,
  buildDocumentFilename,
} from "../../backend/src/lib/http.js";

describe("lib/http security headers", () => {
  it("securityHeaders contains the security contract", () => {
    expect(securityHeaders["X-Content-Type-Options"]).toBe("nosniff");
    expect(securityHeaders["X-Frame-Options"]).toBe("DENY");
    expect(securityHeaders["Strict-Transport-Security"]).toContain("includeSubDomains");
    expect(securityHeaders["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(securityHeaders["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("withSecurityHeaders merges extra headers and preserves security defaults", () => {
    const merged = withSecurityHeaders({ "Content-Type": "application/json" });
    expect(merged["Content-Type"]).toBe("application/json");
    expect(merged["X-Content-Type-Options"]).toBe("nosniff");
    expect(merged["X-Frame-Options"]).toBe("DENY");
  });

  it("withSecurityHeaders default (no arg) returns only security headers", () => {
    const merged = withSecurityHeaders();
    expect(merged["X-Frame-Options"]).toBe("DENY");
    expect(merged["Content-Type"]).toBeUndefined();
  });
});

describe("lib/http sendJson", () => {
  const fakeRes = () => {
    const out: { status: number; headers: Record<string, string>; body: string } = {
      status: 0,
      headers: {},
      body: "",
    };
    return {
      out,
      res: {
        writeHead: (status: number, headers: Record<string, string>) => {
          out.status = status;
          out.headers = headers;
        },
        end: (body: string) => {
          out.body = body;
        },
      },
    };
  };

  it("writes status, JSON body, content-type and security headers", () => {
    const { out, res } = fakeRes();
    sendJson(res as any, 200, { ok: true });
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ ok: true });
    expect(out.headers["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(out.headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("supports extra headers and error status", () => {
    const { out, res } = fakeRes();
    sendJson(res as any, 404, { error: "Not found" }, { "X-Request-Id": "req-1" });
    expect(out.status).toBe(404);
    expect(out.headers["X-Request-Id"]).toBe("req-1");
    expect(JSON.parse(out.body)).toEqual({ error: "Not found" });
  });
});

describe("lib/http assertRequestSize", () => {
  it("accepts a request under the limit", () => {
    expect(() => assertRequestSize({ headers: { "content-length": "100" } }, 1024)).not.toThrow();
  });

  it("throws 413 when over the limit", () => {
    expect(() => assertRequestSize({ headers: { "content-length": "2048" } }, 1024))
      .toThrow("Ukuran file terlalu besar");
  });

  it("accepts missing content-length", () => {
    expect(() => assertRequestSize({ headers: {} }, 1024)).not.toThrow();
  });
});

describe("lib/http content types", () => {
  it("maps known extensions", () => {
    expect(contentTypes[".pdf"]).toBe("application/pdf");
    expect(contentTypes[".xlsx"]).toContain("spreadsheetml");
    expect(contentTypes[".html"]).toBe("text/html; charset=utf-8");
  });

  it("contentTypeForFile uses extension when file type is generic", () => {
    expect(contentTypeForFile({ type: "application/octet-stream" }, "a.pdf")).toBe("application/pdf");
    expect(contentTypeForFile({ type: "application/octet-stream" }, "a.unknown")).toBe("application/octet-stream");
    expect(contentTypeForFile({ type: "image/png" }, "a.pdf")).toBe("image/png");
  });
});

describe("lib/http filename helpers", () => {
  it("sanitizeDownloadFilename strips CR/LF/quotes and slashes", () => {
    expect(sanitizeDownloadFilename('a\r\n"b"')).not.toMatch(/[\r\n"]/);
    expect(sanitizeDownloadFilename("a/b\\c.pdf")).toBe("a_b_c.pdf");
    expect(sanitizeDownloadFilename("")).toBe("file");
  });

  it("sanitizeFilenameStem normalizes and truncates", () => {
    expect(sanitizeFilenameStem("Pengajuan Unit #1")).toBe("Pengajuan_Unit_1");
    expect(sanitizeFilenameStem("")).toBe("dokumen");
  });

  it("filenameHeaderValue builds RFC 5987 header", () => {
    const v = filenameHeaderValue("laporan.pdf");
    expect(v).toContain('filename="laporan.pdf"');
    expect(v).toContain("filename*=UTF-8''");
  });

  it("buildDocumentFilename uses surat title/fallback", () => {
    expect(buildDocumentFilename({ judul_surat: "Laporan" }, "x.pdf")).toBe("Laporan.pdf");
    expect(buildDocumentFilename(undefined, "path/a.pdf")).toBe("a.pdf");
  });
});
