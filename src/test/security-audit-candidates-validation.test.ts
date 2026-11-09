// SEC-04 validation fixtures for the 2026-11-04 private audit candidates.
//
// Every fixture below is synthetic: no production data, no SMTP server, no
// push service, no Supabase, and no outbound network. The real raw dispatcher
// (backend/src/domain-runtime.ts) is exercised through a fake service client so
// the failing behavior is reproduced from the shipped source, not from prose.
import { readFileSync } from "node:fs";
import { Readable, Transform } from "node:stream";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mailCapture = vi.hoisted(() => ({ messages: [] as Array<Record<string, unknown>>, failure: null as Error | null }));
const pushCapture = vi.hoisted(() => ({ sent: [] as Array<Record<string, unknown>> }));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (options: Record<string, unknown>) => {
        mailCapture.messages.push(options);
        if (mailCapture.failure) throw mailCapture.failure;
        return { messageId: "fixture" };
      },
    }),
  },
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    generateRequestDetails: (subscription: {endpoint:string}, payload: string) => {
      pushCapture.sent.push({subscription,payload});
      return {endpoint:subscription.endpoint,method:'POST',headers:{'content-encoding':'aes128gcm'},body:Buffer.from('encrypted-fixture')};
    },
    sendNotification: async (subscription: unknown, payload: string) => {
      pushCapture.sent.push({ subscription, payload });
      return {};
    },
  },
}));

type FakeOptions = {
  user?: { id: string; email?: string } | null;
  profiles?: Record<string, Record<string, unknown> | null>;
  recipientProfiles?: Array<Record<string, unknown>>;
  surat?: Record<string, unknown> | null;
  signatures?: Array<Record<string, unknown>>;
  attachments?: Array<Record<string, unknown>>;
  recoveryLinkMissing?: boolean;
  downloadPrimary?: (bucket: string, path: string) => Promise<unknown>;
  downloadExternal?: (bucket: string, path: string) => Promise<unknown>;
};

const fixtureFile = (text: string) => ({ type: "application/pdf", arrayBuffer: async () => Buffer.from(text) });

const createFakeSupabase = (options: FakeOptions) => {
  const writes: Array<{ table: string; op: string; payload: unknown }> = [];

  const resolve = async (query: any) => {
    const { table, op, payload } = query;
    if (op !== "select") {
      writes.push({ table, op, payload });
      return { data: null, error: null };
    }
    if (table === "profiles") {
      if (query.inFilters.length > 0) return { data: options.recipientProfiles || [], error: null };
      const id = query.filters.find(([column]: [string, unknown]) => column === "id")?.[1] as string;
      return { data: options.profiles?.[id] ?? null, error: null };
    }
    if (table === "master_departments" || table === "master_offices") return { data: [], error: null };
    if (table === "surat_registrasi") return { data: options.surat ?? null, error: null };
    if (table === "surat_signatures") return { data: options.signatures || [], error: null };
    if (table === "surat_attachments") return { data: options.attachments || [], error: null };
    if (table === "surat_requester_revision_history") return { data: [], error: null };
    if (table === "surat_attachment_file_history") return { data: [], error: null };
    if (table === "document_pdf_jobs") return { data: [], error: null };
    return { data: [], error: null };
  };

  const from = (table: string) => {
    const query: any = { table, op: "select", payload: null, filters: [], inFilters: [], limit: null };
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        query.filters.push([column, value]);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        query.inFilters.push([column, values]);
        return builder;
      },
      is: (column: string, value: unknown) => {
        query.filters.push([column, value]);
        return builder;
      },
      not: () => builder,
      order: () => builder,
      limit: (value: number) => {
        query.limit = value;
        return builder;
      },
      insert: (payload: unknown) => {
        query.op = "insert";
        query.payload = payload;
        return builder;
      },
      upsert: (payload: unknown) => {
        query.op = "upsert";
        query.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        query.op = "update";
        query.payload = payload;
        return builder;
      },
      delete: () => {
        query.op = "delete";
        return builder;
      },
      maybeSingle: async () => {
        const result = await resolve(query);
        const data = Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
        return { data, error: result.error ?? null };
      },
      single: async () => {
        const result = await resolve(query);
        const data = Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
        return { data, error: result.error ?? (data ? null : { message: "not found" }) };
      },
      then: (onFulfilled: any, onRejected: any) => resolve(query).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const storageFor = (download?: FakeOptions["downloadPrimary"]) => ({
    from: () => ({
      download: async (path: string) => download
        ? { data: await download("bucket", path), error: null }
        : { data: fixtureFile("fixture"), error: null },
      upload: async () => ({ data: null, error: null }),
    }),
  });

  const client: any = {
    auth: {
      admin: { generateLink: async () => options.recoveryLinkMissing
        ? { data: null, error: { message: 'Fixture user not found' } }
        : { data: { properties: { hashed_token: 'fixture-recovery-token' } }, error: null } },
      getUser: async () => options.user
        ? { data: { user: options.user }, error: null }
        : { data: { user: null }, error: { message: "Unauthorized" } },
    },
    from,
    rpc: async () => ({ data: true, error: null }),
    storage: storageFor(options.downloadPrimary),
  };
  const storageClient: any = {
    ...client,
    storage: storageFor(options.downloadExternal),
  };
  return { client, storageClient, writes };
};

const jsonRequest = (
  method: string,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) => {
  const stream: any = Readable.from([Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.url = url;
  stream.headers = {
    host: "sigap.test",
    origin: "https://sigap.test",
    authorization: "Bearer fixture-token",
    "content-type": "application/json",
    ...headers,
  };
  return stream;
};

const getRequest = (url: string, headers: Record<string, string> = {}) => {
  const stream: any = Readable.from([]);
  stream.method = "GET";
  stream.url = url;
  stream.headers = { host: "sigap.test", authorization: "Bearer fixture-token", ...headers };
  return stream;
};

const makeResponse = () => {
  const chunks: Buffer[] = [];
  const response: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: Buffer.alloc(0),
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(status: number, headers: Record<string, string> = {}) {
      this.statusCode = status;
      for (const [key, value] of Object.entries(headers)) this.headers[key.toLowerCase()] = String(value);
      return this;
    },
    end(chunk?: Buffer | string) {
      if (chunk) chunks.push(Buffer.from(chunk));
      this.body = Buffer.concat(chunks);
    },
  };
  return response;
};

const boot = async (options: FakeOptions) => {
  const runtime = await import("../../backend/src/domain-runtime.ts");
  const fake = createFakeSupabase(options);
  runtime.setDomainRuntimeDependenciesForTest({
    supabase: fake.client,
    storageSupabase: fake.storageClient,
  });
  return { runtime, fake };
};

const activeProfile = { role: "staff", is_active: true, deleted_at: null };

beforeEach(() => {
  mailCapture.messages.length = 0;
  mailCapture.failure = null;
  pushCapture.sent.length = 0;
  vi.resetModules();
  for (const [key, value] of Object.entries({
    SUPABASE_URL: "https://database.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
    STORAGE_MODE: "self_hosted_supabase",
    STORAGE_SUPABASE_URL: "https://storage.test",
    STORAGE_SUPABASE_SERVICE_ROLE_KEY: "storage-service-role-key",
    STORAGE_PUBLIC_BASE_URL: "https://storage.test/storage/v1/object/public",
    STORAGE_PATH_PREFIX: "",
    APP_PUBLIC_URL: "https://sigap.test",
    SMTP_HOST: "smtp.fixture.test",
    SMTP_USER: "noreply@fixture.test",
    SMTP_PASS: "fixture-pass",
    SMTP_FROM: "noreply@fixture.test",
    WEB_PUSH_PUBLIC_KEY: "fixture-public",
    WEB_PUSH_PRIVATE_KEY: "fixture-private",
    MAX_UPLOAD_BYTES: "1024",
    MARISON_DEPLOYMENT_ENVIRONMENT: "staging",
    MARISON_OUTBOUND_INTERNAL_TOKEN: "fixture-outbound-internal-token-32-characters-min",
    NODE_ENV: "test",
  })) {
    vi.stubEnv(key, value);
  }
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("FAIL-CLOSED: no outbound network allowed in validation fixtures");
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('password recovery SMTP failure privacy', () => {
  it('retains the failure status but never logs provider replies, secrets or recovery URLs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mailCapture.failure = Object.assign(new Error('private-provider-detail fixture-password-secret'), {
      code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535,
      response: '535 private-provider-detail fixture-password-secret',
    });
    const { runtime } = await boot({});
    const response = makeResponse();
    await runtime.handleRequest(jsonRequest('POST', '/api/auth/password-reset', { email: 'tester@fixture.test' }), response);
    expect(response.statusCode).toBe(503);
    expect(log).toHaveBeenCalledWith('Password reset email failed:', { code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 });
    const output = JSON.stringify(log.mock.calls) + response.body.toString();
    for (const value of ['private-provider-detail', 'fixture-password-secret', 'fixture-recovery-token']) expect(output).not.toContain(value);
  });

  it('preserves successful-send cooldown and generic account-independent feedback', async () => {
    const { runtime } = await boot({});
    const first = makeResponse();
    const second = makeResponse();
    await runtime.handleRequest(jsonRequest('POST', '/api/auth/password-reset', { email: 'tester@fixture.test' }), first);
    await runtime.handleRequest(jsonRequest('POST', '/api/auth/password-reset', { email: 'tester@fixture.test' }), second);
    expect(first.statusCode).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(mailCapture.messages).toHaveLength(1);
    expect(mailCapture.messages[0].text).toContain('https://sigap.test/reset-password?token_hash=fixture-recovery-token&type=recovery');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missing = await boot({ recoveryLinkMissing: true });
    const unknown = makeResponse();
    await missing.runtime.handleRequest(jsonRequest('POST', '/api/auth/password-reset', { email: 'unknown@fixture.test' }), unknown);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).toEqual(first.body);
    expect(mailCapture.messages).toHaveLength(1);
    expect(warning).toHaveBeenCalled();
  });

  it('keeps IP rate limits even for unknown recipients', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { runtime } = await boot({ recoveryLinkMissing: true });
    for (let attempt = 0; attempt < 7; attempt++) {
      const response = makeResponse();
      await runtime.handleRequest(jsonRequest('POST', '/api/auth/password-reset', { email: `unknown${attempt}@fixture.test` }), response);
      expect(response.statusCode).toBe(attempt < 6 ? 200 : 429);
    }
    expect(mailCapture.messages).toHaveLength(0);
  });
});

describe("audit candidate: legacy notification email recipient context", () => {
  it("does not let an ordinary account email an unrelated user", async () => {
    const { runtime } = await boot({
      user: { id: "actor-1", email: "actor@fixture.test" },
      profiles: { "actor-1": activeProfile, "victim-1": activeProfile },
      recipientProfiles: [{ id: "victim-1", email: "victim@fixture.test", department_id: null, office_id: null }],
    });
    const request = jsonRequest("POST", "/api/notifications/email", {
      user_ids: ["victim-1"],
      title: "Fixture",
      message: "Fixture message",
    });
    const response = makeResponse();
    await runtime.handleRequest(request, response);

    expect(response.statusCode, response.body.toString("utf8")).toBe(403);
    expect(mailCapture.messages).toHaveLength(0);
  });
});

describe("audit candidate: notification email HTML construction", () => {
  it("keeps attacker-controlled title and link as data, not HTML", async () => {
    const { runtime } = await boot({
      user: { id: "actor-1", email: "actor@fixture.test" },
      profiles: { "actor-1": activeProfile },
      recipientProfiles: [{ id: "actor-1", email: "actor@fixture.test", department_id: null, office_id: null }],
    });
    const request = jsonRequest("POST", "/api/notifications/email", {
      user_ids: ["actor-1"],
      title: "<img src=x onerror=alert(1)>",
      message: "Fixture message",
      link: "javascript:alert(1)",
    });
    const response = makeResponse();
    await runtime.handleRequest(request, response);

    expect(response.statusCode).toBe(200);
    expect(mailCapture.messages).toHaveLength(1);
    const html = String(mailCapture.messages[0].html || "");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain('href="javascript:');
  });
});

describe("audit candidate: raw multipart aggregate cap", () => {
  it("rejects a chunked multipart body beyond the cap before buffering it all", async () => {
    const { runtime } = await boot({
      user: { id: "actor-1" },
      profiles: { "actor-1": activeProfile },
    });
    const boundary = "----sigapFixtureBoundary";
    const filler = "A".repeat(2 * 1024 * 1024);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="path"',
      "",
      filler,
      `--${boundary}`,
      'Content-Disposition: form-data; name="bucket"',
      "",
      "lampiran_surat",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    let bytesRead = 0;
    const metered = new Transform({
      transform(chunk, _encoding, callback) {
        bytesRead += chunk.length;
        callback(null, chunk);
      },
    });
    const bodyBuffer = Buffer.from(body);
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < bodyBuffer.length; offset += 64 * 1024) {
      chunks.push(bodyBuffer.subarray(offset, offset + 64 * 1024));
    }
    Readable.from(chunks).pipe(metered);
    const request: any = metered;
    request.method = "POST";
    request.url = "/api/storage/upload";
    request.headers = {
      host: "sigap.test",
      origin: "https://sigap.test",
      authorization: "Bearer fixture-token",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    };

    const response = makeResponse();
    await runtime.handleRequest(request, response);

    expect(response.statusCode).toBe(413);
    expect(bytesRead).toBeLessThan(body.length);
    expect(bytesRead).toBeLessThan(1536 * 1024);
  });

  it("does not reject a small multipart body before field validation", async () => {
    const { runtime } = await boot({
      user: { id: "actor-1" },
      profiles: { "actor-1": activeProfile },
    });
    const boundary = "----sigapSmallBoundary";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="bucket"',
      "",
      "lampiran_surat",
      `--${boundary}`,
      'Content-Disposition: form-data; name="path"',
      "",
      "fixture/small.txt",
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const request: any = Readable.from([Buffer.from(body)]);
    request.method = "POST";
    request.url = "/api/storage/upload";
    request.headers = {
      host: "sigap.test",
      origin: "https://sigap.test",
      authorization: "Bearer fixture-token",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    };
    const response = makeResponse();
    await runtime.handleRequest(request, response);

    expect(response.statusCode, response.body.toString("utf8")).toBe(400);
    expect(response.body.toString("utf8")).toContain("File wajib dikirim");
  });
});

describe("audit candidate: inactive participant document access", () => {
  it("rejects a deactivated direct participant before reading the document", async () => {
    const { runtime } = await boot({
      user: { id: "actor-1" },
      profiles: { "actor-1": { role: "staff", is_active: false, deleted_at: null } },
      surat: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        no_surat: "001/FIX/2026",
        judul_surat: "Fixture",
        status: "proses",
        created_by: "owner-1",
        file_path: "https://database.test/storage/v1/object/public/dokumen_surat/fixture.pdf",
        pdf_path: null,
        lampiran_path: null,
      },
      signatures: [{ id: "sig-1", user_id: "actor-1", is_signed: false, verifier_snapshot: null, file_path_snap: null, pdf_path_snap: null }],
    });
    const request = getRequest(
      "/api/documents/123e4567-e89b-12d3-a456-426614174000/file?path=dokumen_surat%2Ffixture.pdf",
    );
    const response = makeResponse();
    await runtime.handleRequest(request, response);

    expect(response.statusCode, response.body.toString("utf8")).toBe(401);
  });
});

describe("audit candidate: storage origin dropped from ownership comparison", () => {
  it("does not treat a primary-origin document reference as authorization for external storage", async () => {
    const { runtime } = await boot({
      user: { id: "actor-1" },
      profiles: { "actor-1": activeProfile },
      surat: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        no_surat: "001/FIX/2026",
        judul_surat: "Fixture",
        status: "proses",
        created_by: "owner-1",
        file_path: "https://database.test/storage/v1/object/public/dokumen_surat/fixture.pdf",
        pdf_path: null,
        lampiran_path: null,
      },
      signatures: [{ id: "sig-1", user_id: "actor-1", is_signed: false, verifier_snapshot: null, file_path_snap: null, pdf_path_snap: null }],
      downloadPrimary: async () => fixtureFile("PRIMARY"),
      downloadExternal: async () => fixtureFile("EXTERNAL"),
    });
    const request = getRequest(
      "/api/documents/123e4567-e89b-12d3-a456-426614174000/file?path=https%3A%2F%2Fstorage.test%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fdokumen_surat%2Ffixture.pdf",
    );
    const response = makeResponse();
    await runtime.handleRequest(request, response);

    expect(response.statusCode, response.body.toString("utf8")).toBe(403);
    expect(response.body.toString("utf8")).not.toContain("EXTERNAL");
  });
});

describe("audit candidate: unrestricted web push endpoint", () => {
  it.each([
    "https://127.0.0.1/push",
    "https://localhost/push",
    "https://10.0.0.5/push",
    "https://attacker.example/push",
  ])("rejects an endpoint outside the known push providers: %s", async (endpoint) => {
    const { runtime } = await boot({
      user: { id: "actor-1" },
      profiles: { "actor-1": activeProfile },
    });
    const request = jsonRequest("POST", "/api/push/subscribe", {
      subscription: { endpoint, keys: { p256dh: "fixture-key", auth: "fixture-auth" } },
    });
    const response = makeResponse();
    await runtime.handleRequest(request, response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).code).toBe('push_provider_unsupported');
    expect(pushCapture.sent).toHaveLength(0);
  });

  it("accepts a real push-provider host", async () => {
    const { runtime } = await boot({
      user: { id: "actor-1" },
      profiles: { "actor-1": activeProfile },
    });
    const request = jsonRequest("POST", "/api/push/subscribe", {
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/fixture",
        keys: { p256dh: "fixture-key", auth: "fixture-auth" },
      },
    });
    const response = makeResponse();
    await runtime.handleRequest(request, response);

    expect(response.statusCode).toBe(200);
  });
});

describe('durable push provider revalidation',()=>{
  const payload={title:'SIGAP',message:'Generic',link:'/notifications/open?id=fixture',tag:'fixture',notificationId:'00000000-0000-4000-8000-000000000001'};
  it.each(['https://127.0.0.1/push','https://attacker.example/push','https://fcm.googleapis.com.attacker.example/push','http://fcm.googleapis.com/push'])("rejects persisted untrusted endpoint before encryption or network: %s",async(endpoint)=>{
    const {runtime}=await boot({});
    await expect(runtime.sendQueuedBrowserPush({endpoint,keys:{p256dh:'fixture',auth:'fixture'}},payload)).rejects.toMatchObject({code:'invalid_endpoint'});
    expect(pushCapture.sent).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only the encrypted provider request with a hard deadline and no redirects',async()=>{
    const {runtime}=await boot({}),cancel=vi.fn(async()=>undefined);
    vi.mocked(fetch).mockResolvedValue({ok:true,status:201,body:{cancel}} as unknown as Response);
    await runtime.sendQueuedBrowserPush({endpoint:'https://fcm.googleapis.com/push',keys:{p256dh:'fixture',auth:'fixture'}},payload);
    expect(fetch).toHaveBeenCalledWith('https://fcm.googleapis.com/push',expect.objectContaining({method:'POST',redirect:'error',signal:expect.any(AbortSignal),body:Buffer.from('encrypted-fixture')}));
    expect(cancel).toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue({ok:false,status:410} as Response);
    await expect(runtime.sendQueuedBrowserPush({endpoint:'https://fcm.googleapis.com/push',keys:{p256dh:'fixture',auth:'fixture'}},payload)).rejects.toMatchObject({statusCode:410});
  });
});

describe("audit candidate: production deploy is not bound to the tested commit", () => {
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/deploy-production.yml"), "utf8")
    .replace(/\r\n/g, "\n");

  it("pins every production job to the commit resolved by preflight", () => {
    expect(workflow).toMatch(/outputs:\s*\n\s*ready:.*\n\s*sha:/);
    expect(workflow.match(/ref: \$\{\{ needs\.preflight\.outputs\.sha \}\}/g)).toHaveLength(2);
    expect(workflow).toContain('bash scripts/deploy-app.sh production "${{ needs.preflight.outputs.sha }}"');
  });
});
