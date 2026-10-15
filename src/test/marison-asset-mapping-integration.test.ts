import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(join(process.cwd(), "backend/src/domain-runtime.ts"), "utf8");

describe("REC-03 Marison asset runtime integration", () => {
  it("prefers active recommendation child canonical data over stale parent data", () => {
    const start = runtime.indexOf("const getMarisonRecommendationRows");
    const end = runtime.indexOf("const getMarisonRecommendationDocument", start);
    const resolver = runtime.slice(start, end);

    expect(resolver.indexOf("childInput.recommendation_multi_detail")).toBeGreaterThan(-1);
    expect(resolver.indexOf("childInput.recommendation_multi_detail")).toBeLessThan(resolver.indexOf("input.recommendation_multi_detail"));
    expect(resolver.indexOf("childInput.recommendation_items")).toBeLessThan(resolver.indexOf("snapshot.recommendation_items"));
  });

  it("maps and validates asset items before durable prepare", () => {
    const buildStart = runtime.indexOf("const buildMarisonOutboundJob");
    const buildEnd = runtime.indexOf("const listMarisonOutboundDispatches", buildStart);
    const build = runtime.slice(buildStart, buildEnd);
    const mapper = runtime.indexOf("mapMarisonAssetRequest", runtime.indexOf("const buildMarisonAssetPayload"));
    const prepare = runtime.indexOf('supabase.rpc("prepare_marison_outbound_dispatch_with_sources"', buildStart);

    expect(mapper).toBeGreaterThan(-1);
    expect(prepare).toBeGreaterThan(mapper);
    expect(build).toContain("await buildMarisonDispatchPayload");
  });

  it("uses applicant items and request attachments when recommendation is not required", () => {
    const start = runtime.indexOf("const buildMarisonAssetPayload");
    const end = runtime.indexOf("const buildMarisonFundPayload", start);
    const builder = runtime.slice(start, end);

    expect(builder).toContain("input.requires_recommendation === true");
    expect(builder).toContain("await buildMarisonDocumentLinks(surat, actorId)");
    expect(builder).toContain("recommendationRequired,");
    expect(builder).toContain("applicantAttachments,");
  });

  it("treats an active recommendation child as authoritative even when the parent flag is absent", () => {
    const start = runtime.indexOf("const buildMarisonAssetPayload");
    const end = runtime.indexOf("const buildMarisonFundPayload", start);
    const builder = runtime.slice(start, end);
    const documentLookup = builder.indexOf("await getMarisonRecommendationDocument(surat.id)");
    const requirementDecision = builder.indexOf("Boolean(recommendationDocument)");

    expect(documentLookup).toBeGreaterThan(-1);
    expect(requirementDecision).toBeGreaterThan(documentLookup);
  });

  it("separates the main document and retains examination attachments when a recommendation is required", () => {
    const start = runtime.indexOf("const buildMarisonAssetPayload");
    const end = runtime.indexOf("const buildMarisonFundPayload", start);
    const builder = runtime.slice(start, end);

    expect(builder).toContain("const documents = await buildMarisonDocumentLinks(surat, actorId)");
    expect(builder).toContain("main_document: documents.mainDocument");
    expect(builder).toContain("const applicantAttachments = documents.attachments");
    expect(builder).not.toMatch(/recommendationRequired\s*\?\s*\[\]/);
    expect(builder).toContain("applicantAttachments,");
  });

  it("maps typed mapper errors to safe HTTP 422 responses", () => {
    expect(runtime).toContain("error instanceof MarisonAssetItemsError ? 422");
    expect(runtime).toContain('sendJson(res, status, { error: error.message || "Internal server error", requestId })');
  });
});
