import { describe, expect, it } from "vitest";
import { buildExternalOpenApi } from "../../external-api/openapi.mjs";

describe("external API OpenAPI document", () => {
  it("publishes the current submission decision contract on the SIGAP application domain", () => {
    const document = buildExternalOpenApi("https://external.marison-testing.biz.id");

    const operation = document.paths["/api/v1/submission-decisions"].post;
    const schema = operation.requestBody.content["application/json"].schema;

    expect(document.info.version).toBe("1.0.0");
    expect(document.servers).toEqual([{ url: "https://external.marison-testing.biz.id", description: "SIGAP External API staging" }]);
    expect(operation.security).toEqual([{ submissionDecisionBearer: [] }]);
    expect(document.info.description).toContain("Authorization: Bearer <token>");
    expect(document.info.description).toContain("Content-Type: application/json");
    expect(operation.description).toContain("Header wajib");
    expect(document.components.securitySchemes.submissionDecisionBearer.description).toContain("Masukkan token saja");
    expect(schema.required).toEqual(["event_id", "document_number", "decision", "reason", "decided_at"]);
    expect(Object.keys(schema.properties)).toEqual(schema.required);
    expect(schema.properties.decision.enum).toEqual(["rejected", "revision_required"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("does not publish obsolete decision fields or the internal rejection endpoint", () => {
    const document = buildExternalOpenApi("https://external.marison-testing.biz.id");
    const serialized = JSON.stringify(document);

    expect(Object.keys(document.paths)).toEqual(["/api/v1/submission-decisions"]);
    expect(serialized).not.toContain("/api/surat");
    expect(serialized).not.toContain("/master/offices");
    expect(serialized).not.toContain("revision_scope");
    expect(serialized).not.toContain("affected_items");
    expect(serialized).not.toContain("external_reference");
    expect(serialized).not.toContain("/api/surat/rejections");
  });
});
