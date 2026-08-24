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
  it("locks every security header name and value", () => {
    expect(securityHeaders).toEqual({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
  });

  it("locks every CSP directive", () => {
    const csp = securityHeaders["Content-Security-Policy"];
    for (const directive of [
      "default-src 'self'",
      "script-src 'self' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
  });

  it("withSecurityHeaders gives precedence to extraHeaders", () => {
    const merged = withSecurityHeaders({
      "Content-Type": "application/json",
      "X-Frame-Options": "SAMEORIGIN",
    });
    // extraHeaders override security defaults
    expect(merged["Content-Type"]).toBe("application/json");
    expect(merged["X-Frame-Options"]).toBe("SAMEORIGIN");
    // untouched security headers still present
    expect(merged["X-Content-Type-Options"]).toBe("nosniff");
    expect(merged["Strict-Transport-Security"]).toContain("max-age=31536000");
  });

  it("withSecurityHeaders default (no arg) returns only security headers", () => {
    const merged = withSecurityHeaders();
    expect(merged).toEqual(securityHeaders);
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

  it("sendJson gives precedence to extraHeaders over security defaults", () => {
    const { out, res } = fakeRes();
    sendJson(res as any, 200, { ok: true }, { "X-Frame-Options": "SAMEORIGIN" });
    expect(out.headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(out.headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("lib/http assertRequestSize", () => {
  it("accepts a request under the limit", () => {
    expect(() => assertRequestSize({ headers: { "content-length": "100" } }, 1024)).not.toThrow();
  });

  it("accepts a request exactly at the limit", () => {
    expect(() => assertRequestSize({ headers: { "content-length": "1024" } }, 1024)).not.toThrow();
  });

  it("throws 413 with exact MB message when over the limit", () => {
    let thrown: any;
    try {
      assertRequestSize({ headers: { "content-length": String(2 * 1024 * 1024) } }, 1024 * 1024);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.status).toBe(413);
    expect(thrown.message).toBe("Ukuran file terlalu besar. Maksimal 1 MB.");
  });

  it("throws 413 with multi-MB message", () => {
    let thrown: any;
    try {
      assertRequestSize({ headers: { "content-length": "30000000" } }, 25 * 1024 * 1024);
    } catch (e) {
      thrown = e;
    }
    expect(thrown.status).toBe(413);
    expect(thrown.message).toBe("Ukuran file terlalu besar. Maksimal 25 MB.");
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
