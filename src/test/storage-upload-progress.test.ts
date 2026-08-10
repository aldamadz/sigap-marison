import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

import { appStorageService } from "@/services/storage.service";
import { supabase } from "@/lib/supabase";

type Listener = (event: ProgressEvent) => void;

class FakeXMLHttpRequest {
  static lastInstance: FakeXMLHttpRequest | null = null;

  status = 200;
  response: Record<string, string> = {
    bucket: "lampiran_surat",
    path: "drafts/test/file.pdf",
    origin: "app",
    publicUrl: "drafts/test/file.pdf",
  };
  responseType = "";
  private listeners = new Map<string, Listener>();
  private uploadListeners = new Map<string, Listener>();

  upload = {
    addEventListener: (type: string, listener: Listener) => {
      this.uploadListeners.set(type, listener);
    },
  };

  constructor() {
    FakeXMLHttpRequest.lastInstance = this;
  }

  open() {}
  setRequestHeader() {}

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, listener);
  }

  send() {
    this.uploadListeners.get("progress")?.({
      lengthComputable: true,
      loaded: 2,
      total: 4,
    } as ProgressEvent);
    this.listeners.get("load")?.({} as ProgressEvent);
  }
}

const originalXMLHttpRequest = globalThis.XMLHttpRequest;

afterEach(() => {
  globalThis.XMLHttpRequest = originalXMLHttpRequest;
  FakeXMLHttpRequest.lastInstance = null;
});

describe("appStorageService upload progress", () => {
  it("reports initial, byte, and completed progress", async () => {
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    const percentages: number[] = [];

    const result = await appStorageService.upload({
      bucket: "lampiran_surat",
      path: "drafts/test/file.pdf",
      file: new Blob(["test"], { type: "application/pdf" }),
      onProgress: progress => percentages.push(progress.percent),
    });

    expect(percentages).toEqual([0, 50, 100]);
    expect(result.publicUrl).toBe("drafts/test/file.pdf");
    expect(supabase.auth.getSession).toHaveBeenCalledWith();
  });
});
