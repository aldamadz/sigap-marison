import Fastify from "fastify";
import scalarApiReference from "@scalar/fastify-api-reference";
import { afterEach, describe, expect, it } from "vitest";
import { buildExternalOpenApi } from "../../external-api/openapi.mjs";

describe("external API Scalar documentation", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("renders one standalone Scalar application at the canonical docs route", async () => {
    const app = Fastify();
    apps.push(app);
    await app.register(scalarApiReference, {
      routePrefix: "/docs",
      configuration: {
        content: () => buildExternalOpenApi("https://external.marison-testing.biz.id"),
        pageTitle: "SIGAP External API Docs",
        theme: "moon",
        layout: "modern",
        persistAuth: false,
        hideModels: true,
      },
    });

    const redirect = await app.inject({ method: "GET", url: "/docs" });
    const page = await app.inject({ method: "GET", url: "/docs/" });

    expect(redirect.statusCode).toBe(301);
    expect(redirect.headers.location).toBe("/docs/");
    expect(page.statusCode).toBe(200);
    expect(page.body.match(/Scalar\.createApiReference/g)).toHaveLength(1);
    expect(page.body.match(/<div id="app"><\/div>/g)).toHaveLength(1);
    expect(page.body).toContain("<title>SIGAP External API Docs</title>");
    expect(page.body).not.toContain("swagger-ui");
    expect(page.body).not.toContain("iframe");
  });
});
