import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suratService } from "@/services/surat.service";

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[], failLink: false,
  upload: vi.fn(async ({ path }: { path: string }) => ({ publicUrl: `https://storage.example/${path}` })),
}));
vi.mock("@/services/storage.service", () => ({ appStorageService: { upload: mocks.upload } }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: () => {
    const query = {
      select: () => query,
      eq: async () => ({ data: mocks.rows, error: null }),
      upsert: (rows: Record<string, unknown>[]) => ({ select: async () => {
        if (mocks.failLink) { mocks.failLink = false; return { data: null, error: new Error("Link failed") }; }
        const added = rows.filter((row) => !mocks.rows.some((existing) => existing.upload_identity === row.upload_identity));
        mocks.rows.push(...added);
        return { data: added, error: null };
      } }),
    };
    return query;
  },
} }));

describe("KEU10 registration upload reconciliation", () => {
  beforeEach(() => { mocks.rows = []; mocks.failLink = false; mocks.upload.mockClear(); vi.stubGlobal("crypto", webcrypto); });
  afterEach(() => vi.unstubAllGlobals());
  it("does not upload a persisted file again when later registration linking fails", async () => {
    const file = new File(["dummy PDF"], "evidence.pdf", { type: "application/pdf" });
    await suratService.uploadAttachmentFiles("surat", [file], "actor", { idempotent: true });
    // Re-entered after a later draft-link/notification failure.
    const second = await suratService.uploadAttachmentFiles("surat", [file], "actor", { idempotent: true });
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.rows).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
  it("retries a successful storage upload with failed DB linking at the same path", async () => {
    const file = new File(["dummy PDF"], "evidence.pdf", { type: "application/pdf" });
    mocks.failLink = true;
    await expect(suratService.uploadAttachmentFiles("surat", [file], "actor", { idempotent: true })).rejects.toThrow("Link failed");
    await suratService.uploadAttachmentFiles("surat", [file], "actor", { idempotent: true });
    expect(mocks.upload.mock.calls[0][0]).toEqual(mocks.upload.mock.calls[1][0]);
    expect(mocks.rows).toHaveLength(1);
  });
  it("preserves distinct content under the same filename", async () => {
    await suratService.uploadAttachmentFiles("surat", [new File(["first"], "evidence.pdf"), new File(["second"], "evidence.pdf")], "actor", { idempotent: true });
    expect(mocks.rows).toHaveLength(2);
    expect(mocks.rows[0].upload_identity).not.toBe(mocks.rows[1].upload_identity);
  });
});
