import { describe, expect, it } from "vitest";
import { diagnoseVendorRejection, buildSafeContext, comparePayloads, collectSensitiveValues } from "../../server/marison-rejection-diagnosis.mjs";

describe("diagnoseVendorRejection", () => {
  it.each(["unit_submissions", "fund_submissions", "asset_purchase_requests"])("identifies missing main_document on %s without exposing SQL/private details", table => {
    const result = diagnoseVendorRejection(JSON.stringify({message:"Pengajuan gagal.",error:`SQLSTATE[42703]: Undefined column: column "main_document" of relation "${table}" does not exist (Connection: secret-db-host, SQL: insert into ${table}; nik=1234567890123456; https://private.example/file/TOKEN)`}));
    expect(result.reasonCode).toBe("VENDOR_MAIN_DOCUMENT_SCHEMA_MISSING");
    expect(result.summary).toContain("main_document");
    expect(result.specificity).toBe("generic");
    expect(JSON.stringify(result)).not.toMatch(/secret-db-host|1234567890123456|SQLSTATE|insert into|private.example|unit_submissions|fund_submissions|asset_purchase_requests/);
  });

  it("does not mistake a different missing column or input validation for the vendor schema defect", () => {
    expect(diagnoseVendorRejection({message:'SQLSTATE[42703]: column "other_field" does not exist; SQL: insert into table (main_document)'}).reasonCode).toBeUndefined();
    expect(diagnoseVendorRejection({message:'main_document is required',errors:{main_document:['required']}}).reasonCode).toBeUndefined();
    expect(diagnoseVendorRejection('not JSON; private details').detailsAvailable).toBe(false);
  });
  it("returns generic when response is null", () => {
    const result = diagnoseVendorRejection(null);
    expect(result.detailsAvailable).toBe(false);
    expect(result.specificity).toBe("generic");
    expect(result.issues).toHaveLength(0);
  });

  it("returns generic when response is empty object", () => {
    const result = diagnoseVendorRejection({});
    expect(result.detailsAvailable).toBe(false);
    expect(result.specificity).toBe("generic");
  });

  it("diagnoses NIK rejection with area specificity", () => {
    const result = diagnoseVendorRejection({ message: "NIK tidak terdaftar." });
    expect(result.detailsAvailable).toBe(true);
    expect(result.specificity).toBe("area");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].label).toBe("Identitas external");
    expect(result.issues[0].message).toBe("NIK tidak terdaftar.");
    expect(result.issues[0].specificity).toBe("area");
  });

  it("diagnoses unit type rejection with area specificity", () => {
    const result = diagnoseVendorRejection({ message: "Tipe unit tidak ditemukan di referensi." });
    expect(result.detailsAvailable).toBe(true);
    expect(result.specificity).toBe("area");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].label).toBe("Tipe unit");
    expect(result.issues[0].message).toBe("Tipe unit tidak ditemukan di referensi.");
  });

  it("masks 16-digit NIK values in messages", () => {
    const result = diagnoseVendorRejection({ message: "NIK 1234567890123456 tidak terdaftar." });
    expect(result.issues[0].message).not.toContain("1234567890123456");
    expect(result.issues[0].message).toContain("****");
  });

  it("masks alphanumeric NIK-like values like A 114", () => {
    const result = diagnoseVendorRejection({ message: "NIK A 114 tidak terdaftar." });
    expect(result.issues[0].message).not.toContain("A 114");
    expect(result.issues[0].message).toContain("***");
  });

  it("parses FastAPI detail array with field specificity", () => {
    const result = diagnoseVendorRejection({
      detail: [
        { loc: ["body", "submitted_by"], msg: "NIK tidak terdaftar", type: "value_error" },
        { loc: ["body", "units", 0, "type"], msg: "Tipe unit tidak ditemukan", type: "value_error" },
      ],
    });
    expect(result.detailsAvailable).toBe(true);
    expect(result.specificity).toBe("field");
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].path).toBe("body.submitted_by");
    expect(result.issues[0].label).toBe("Pemohon");
    expect(result.issues[1].path).toBe("body.units.0.type");
  });

  it("does not guess which NIK was rejected when vendor only says NIK tidak terdaftar", () => {
    const result = diagnoseVendorRejection({ message: "NIK tidak terdaftar." });
    expect(result.specificity).toBe("area");
    expect(result.issues[0].path).toBe("");
  });

  it("classifies project-related messages", () => {
    const result = diagnoseVendorRejection({ message: "Project ID tidak valid." });
    expect(result.issues[0].label).toBe("Proyek external");
    expect(result.specificity).toBe("area");
  });

  it("classifies branch-related messages", () => {
    const result = diagnoseVendorRejection({ message: "Branch ID tidak ditemukan." });
    expect(result.issues[0].label).toBe("Branch external");
    expect(result.specificity).toBe("area");
  });

  it("falls back to generic for unknown messages without misleading links", () => {
    const result = diagnoseVendorRejection({ message: "Internal server error." });
    expect(result.specificity).toBe("generic");
    expect(result.issues[0].label).toBe("");
    expect(result.summary).toBe("Penolakan vendor belum spesifik.");
  });

  it("summary is area-specific for area issues", () => {
    const result = diagnoseVendorRejection({ message: "NIK tidak terdaftar." });
    expect(result.summary).toBe("Identitas external ditolak vendor");
  });

  it("summary is field-specific for detail array issues", () => {
    const result = diagnoseVendorRejection({ detail: [{ loc: ["body", "submitted_by"], msg: "invalid", type: "value_error" }] });
    expect(result.summary).toBe("Vendor menolak field tertentu pada payload.");
  });
});

describe("buildSafeContext", () => {
  it("returns null for null payload", () => {
    expect(buildSafeContext(null, "unit")).toBeNull();
  });

  it("extracts roles without NIK", () => {
    const payload = {
      submitted_by: "1234567890123456",
      approvals: [
        { nik: "1111222233334444", role: "signer", action: "approved", actioned_at: "2026-01-01T00:00:00Z" },
        { nik: "5555666677778888", role: "signer", action: "approved", actioned_at: "2026-01-02T00:00:00Z" },
      ],
    };
    const context = buildSafeContext(payload, "unit");
    expect(context?.roles).toEqual(["Pemohon", "Penandatangan tahap 1", "Penandatangan tahap 2"]);
  });

  it("extracts unit types for unit kind", () => {
    const payload = { units: [{ type: "60" }, { type: "60/72" }, { type: "60" }] };
    const context = buildSafeContext(payload, "unit");
    expect(context?.unitTypes).toEqual(["60", "60/72"]);
  });

  it("extracts item names for non_unit kind", () => {
    const payload = { items: [{ item_name: "Pekerjaan A" }, { item_name: "Pekerjaan B" }] };
    const context = buildSafeContext(payload, "non_unit");
    expect(context?.itemNames).toEqual(["Pekerjaan A", "Pekerjaan B"]);
  });

  it("limits unit types to 10", () => {
    const payload = { units: Array.from({ length: 15 }, (_, i) => ({ type: `type-${i}` })) };
    const context = buildSafeContext(payload, "unit");
    expect(context?.unitTypes).toHaveLength(10);
  });

  it("does not expose NIK values in safe context", () => {
    const payload = {
      submitted_by: "1234567890123456",
      approvals: [{ nik: "1111222233334444", role: "signer", action: "approved", actioned_at: "2026-01-01T00:00:00Z" }],
    };
    const context = buildSafeContext(payload, "unit");
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("1234567890123456");
    expect(serialized).not.toContain("1111222233334444");
  });

  it("does not expose alphanumeric NIK like A 114", () => {
    const payload = { submitted_by: "A 114" };
    const context = buildSafeContext(payload, "unit");
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("A 114");
  });
});

describe("collectSensitiveValues", () => {
  it("collects submitted_by and approval NIKs", () => {
    const payload = {
      submitted_by: "1234567890123456",
      approvals: [
        { nik: "1111222233334444", role: "signer" },
        { nik: "A 114", role: "signer" },
      ],
    };
    const values = collectSensitiveValues(payload);
    expect(values.has("1234567890123456")).toBe(true);
    expect(values.has("1111222233334444")).toBe(true);
    expect(values.has("A 114")).toBe(true);
  });

  it("returns empty set for null payload", () => {
    expect(collectSensitiveValues(null).size).toBe(0);
  });
});

describe("comparePayloads", () => {
  it("detects requester mapping change", () => {
    const old = { submitted_by: "NIK_OLD" };
    const current = { submitted_by: "NIK_NEW" };
    const changes = comparePayloads(old, current, "unit");
    expect(changes).toContain("Mapping pemohon berubah.");
  });

  it("detects approval mapping change", () => {
    const old = { approvals: [{ nik: "A", role: "s", action: "approved", actioned_at: "2026-01-01T00:00:00Z" }] };
    const current = { approvals: [{ nik: "B", role: "s", action: "approved", actioned_at: "2026-01-01T00:00:00Z" }] };
    const changes = comparePayloads(old, current, "unit");
    expect(changes).toContain("Mapping penandatangan tahap 1 berubah.");
  });

  it("detects unit type change without extra quote", () => {
    const old = { units: [{ type: "60" }] };
    const current = { units: [{ type: "60/72" }] };
    const changes = comparePayloads(old, current, "unit");
    expect(changes.some((c) => c.includes("Tipe unit berubah dari 60 menjadi 60/72."))).toBe(true);
    expect(changes.some((c) => c.includes('".') && !c.includes('."'))).toBe(false);
  });

  it("detects project ID change", () => {
    const old = { project_id: 1 };
    const current = { project_id: 2 };
    const changes = comparePayloads(old, current, "unit");
    expect(changes).toContain("Proyek external berubah.");
  });

  it("detects branch ID change", () => {
    const old = { branch_id: 10 };
    const current = { branch_id: 20 };
    const changes = comparePayloads(old, current, "unit");
    expect(changes).toContain("Branch external berubah.");
  });

  it("detects attachment count change", () => {
    const old = { attachments: [{ name: "a", link: "https://x" }] };
    const current = { attachments: [{ name: "a", link: "https://x" }, { name: "b", link: "https://y" }] };
    const changes = comparePayloads(old, current, "unit");
    expect(changes).toContain("Lampiran aktif berubah.");
  });

  it("does not expose NIK or URLs in changes", () => {
    const old = { submitted_by: "1234567890123456" };
    const current = { submitted_by: "9876543210987654" };
    const changes = comparePayloads(old, current, "unit");
    const serialized = JSON.stringify(changes);
    expect(serialized).not.toContain("1234567890123456");
    expect(serialized).not.toContain("9876543210987654");
  });

  it("returns empty array for identical payloads", () => {
    const payload = { submitted_by: "A", project_id: 1, branch_id: 2 };
    expect(comparePayloads(payload, payload, "unit")).toEqual([]);
  });

  it("returns empty array when old payload is null", () => {
    expect(comparePayloads(null, { project_id: 1 }, "unit")).toEqual([]);
  });
});
