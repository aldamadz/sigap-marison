import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("unit allocation unit-type reference lockdown", () => {
  it("exposes reference unit-type helper and locks single-option choices", () => {
    const inbox = read("src/pages/surat/InboxPage.tsx");
    expect(inbox).toContain("const REFERENCE_UNIT_TYPE_KEYS");
    expect(inbox).toContain("collectReferenceUnitTypeOptions");
    expect(inbox).toContain("unitTypeLocked");
  });

  it("renders Tipe Unit as a Select sourced from the vendor reference", () => {
    const inbox = read("src/pages/surat/InboxPage.tsx");
    const selectBlock = inbox.match(/<Select[\s\S]*?<\/Select>/);
    expect(selectBlock).not.toBeNull();
    const body = selectBlock ? selectBlock[0] : "";
    expect(body).toContain("referenceUnitTypes.map");
    expect(body).toContain("<SelectItem key={option}");
    expect(body).toContain("updateAllocationDetail(item.id, unit.value, \"unit_type\", next)");
  });

  it("auto-fills unit_type from reference when the verifier has not entered one", () => {
    const inbox = read("src/pages/surat/InboxPage.tsx");
    expect(inbox).toMatch(/toggleAllocatedUnit[\s\S]*collectReferenceUnitTypeOptions\(option\)/);
    expect(inbox).toContain("if (String(existing.unit_type || \"\").trim()) return previous;");
    expect(inbox).toContain("unit_type: nextValue");
  });
});
