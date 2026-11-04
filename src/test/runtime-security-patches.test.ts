import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { resolve4 } from "node:dns";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const parseAddress = require("nodemailer/lib/addressparser") as (
  value: string,
) => Array<{ address: string; name: string }>;
const read = (name: string) => readFileSync(resolve(process.cwd(), name), "utf8");

describe("SEC-04 compatible runtime security patches", () => {
  it("uses the reviewed Node22 security release in application and API images", () => {
    for (const file of ["dockerfile", "external-api/Dockerfile"]) {
      const stages = read(file).split(/\r?\n/).filter(line => line.startsWith("FROM node:"));
      expect(stages).toHaveLength(2);
      expect(stages.every(line => /^FROM node:22\.23\.4-alpine(?: AS builder)?$/.test(line))).toBe(true);
    }
  });

  it("rejects a NUL DNS name before resolution", async () => {
    await expect(new Promise((done, fail) => {
      resolve4("fixture.invalid\0.example.invalid", (error, result) => error ? fail(error) : done(result));
    })).rejects.toMatchObject({ code: "ERR_INVALID_ARG_VALUE" });
  });

  it("keeps an address inside a nested comment out of the recipient list", () => {
    expect(parseAddress("Victim (x(y) <other@example.invalid>) <allowed@example.invalid>")
      .map(value => value.address)).toEqual(["allowed@example.invalid"]);
  });

  it("normalizes canonical-case header names in a propertyNames deny-list", async () => {
    const app = Fastify();
    app.get("/fixture", {
      schema: {
        headers: { type: "object", propertyNames: { not: { enum: ["X-Debug-Override"] } } },
      },
    }, async () => ({ ok: true }));
    try {
      expect((await app.inject({ method: "GET", url: "/fixture" })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/fixture", headers: { "X-Debug-Override": "1" } })).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
