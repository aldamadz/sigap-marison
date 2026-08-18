import { describe, expect, it } from "vitest";
import { buildDocsHtml, docsClientScript } from "../../external-api/docs-page.mjs";

describe("external API docs portal", () => {
  it("shows only the submission decision integration surface", () => {
    const html = buildDocsHtml();

    expect(html).toContain("SIGAP External API Docs");
    expect(html).toContain("Authorization: Bearer &lt;token&gt;");
    expect(html).toContain("/api/v1/submission-decisions");
    expect(html).toContain("Try Request");
    expect(html).toContain("Export OpenAPI");
    expect(html).not.toContain("/api/surat");
    expect(html).not.toContain("master/offices");
  });

  it("keeps the bearer token ephemeral and sends the documented five-field payload", () => {
    expect(docsClientScript).toContain('Authorization: "Bearer " + token.value.trim()');
    expect(docsClientScript).toContain('"/api/v1/submission-decisions"');
    expect(docsClientScript).not.toContain("localStorage");
    expect(docsClientScript).not.toContain("sessionStorage");
    for (const field of ["event_id", "document_number", "decision", "reason", "decided_at"]) {
      expect(docsClientScript).toContain(field);
    }
  });
});
