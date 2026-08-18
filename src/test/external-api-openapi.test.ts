import { describe, expect, it } from "vitest";
import { augmentExternalOpenApi } from "../../external-api/openapi.mjs";

describe("external API OpenAPI document", () => {
  it("publishes the current submission decision contract on the SIGAP application domain", () => {
    const document = augmentExternalOpenApi({
      openapi: "3.1.0",
      info: { title: "SIGAP External Surat API", version: "2.0.0" },
      paths: { "/api/surat": { get: {} } },
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
    }, "https://sigap.marison-testing.biz.id");

    const operation = document.paths["/api/v1/submission-decisions"].post;
    const schema = operation.requestBody.content["application/json"].schema;

    expect(document.info.version).toBe("2.1.0");
    expect(document.paths["/api/surat"]).toBeDefined();
    expect(operation.servers).toEqual([{ url: "https://sigap.marison-testing.biz.id", description: "SIGAP application API" }]);
    expect(operation.security).toEqual([{ submissionDecisionBearer: [] }]);
    expect(schema.required).toEqual(["event_id", "document_number", "decision", "reason", "decided_at"]);
    expect(Object.keys(schema.properties)).toEqual(schema.required);
    expect(schema.properties.decision.enum).toEqual(["rejected", "revision_required"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("does not publish obsolete decision fields or the internal rejection endpoint", () => {
    const document = augmentExternalOpenApi({
      openapi: "3.1.0",
      info: { title: "SIGAP External Surat API", version: "2.0.0" },
      paths: {},
      components: {},
    }, "https://sigap.marison-testing.biz.id");
    const serialized = JSON.stringify(document);

    expect(serialized).not.toContain("revision_scope");
    expect(serialized).not.toContain("affected_items");
    expect(serialized).not.toContain("external_reference");
    expect(serialized).not.toContain("/api/surat/rejections");
  });
});
