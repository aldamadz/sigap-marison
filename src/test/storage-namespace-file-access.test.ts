import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(join(process.cwd(), "server.mjs"), "utf8");

describe("storage namespace file access", () => {
  it("validates consumed file tokens with their actual object path", () => {
    expect(server).toContain("const tokenStorageRef = {");
    expect(server).toContain("path: tokenData.object_path");
    expect(server).toContain("storageClientForRef(tokenStorageRef)");
    expect(server).not.toContain("storageClientForRef({ origin: tokenData.storage_origin })");
  });
});
