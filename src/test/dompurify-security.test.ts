import { describe, expect, it } from "vitest";
import DOMPurify from "dompurify";

describe("DOMPurify release security prerequisite", () => {
  it("loads the patched sanitizer and retains safe text while dropping executable content", () => {
    expect(DOMPurify.version).toBe("3.4.17");
    const clean = DOMPurify.sanitize('<p>Catatan pemohon</p><img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(clean).toContain("Catatan pemohon");
    expect(clean).not.toMatch(/onerror|<script|alert\(/i);
  });
});
