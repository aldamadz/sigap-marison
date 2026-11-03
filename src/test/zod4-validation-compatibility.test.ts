import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import { bffIdentifierSchema, bffOperationSchema, bffQuerySchema, loginSchema } from "@sigap/shared";
import { registerErrorHandler } from "../../backend/src/plugins/errors";
import { agendaSchema } from "../types/agenda";
import { assertMarisonOutboundContract } from "../../server/marison-outbound-contract.mjs";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Zod4 migration retains SIGAP validation contracts", () => {
  it("normalizes login identity without trimming or exposing the password", () => {
    expect(loginSchema.parse({email:" Nama@Perusahaan.COM ",password:" secret "}))
      .toEqual({email:"nama@perusahaan.com",password:" secret "});
    for (const input of [{email:"invalid",password:"secret"},{email:"a@company.com",password:""},{email:"a@company.com",password:"x".repeat(4097)}])
      expect(loginSchema.safeParse(input).success).toBe(false);
  });
  it("keeps BFF defaults and arbitrary JSON record values, including null", () => {
    expect(bffQuerySchema.parse({name:"surat_registrasi"})).toEqual({kind:"table",name:"surat_registrasi",operations:[]});
    expect(bffOperationSchema.parse({method:"select"})).toEqual({method:"select",args:[]});
    const input={kind:"rpc",name:"lookup",args:{p_null:null,p_list:[1,"a"],p_nested:{ok:true}},options:{count:"exact"}};
    expect(bffQuerySchema.parse(input)).toEqual({...input,operations:[]});
    expect(bffQuerySchema.safeParse({name:"lookup",args:[]}).success).toBe(false);
    expect(bffIdentifierSchema.safeParse("surat;drop table").success).toBe(false);
  });
  it("preserves agenda date ordering and Indonesian validation paths", () => {
    const valid={title:"Pemeriksaan",startTime:"2026-11-03T08:00:00+07:00",endTime:"2026-11-03T09:00:00+07:00"};
    expect(agendaSchema.parse(valid).status).toBe("Scheduled");
    const invalid=agendaSchema.safeParse({...valid,endTime:valid.startTime});
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues).toContainEqual(expect.objectContaining({path:["endTime"],message:"Waktu selesai harus setelah waktu mulai"}));
  });
  it.each(["unit","non_unit","asset","fund"])("preserves valid %s fixture bytes and rejects extra fields", kind => {
    const names={unit:"unit-submission",non_unit:"non-unit-submission",asset:"asset-purchase-request",fund:"fund-submission"};
    const fixture=JSON.parse(readFileSync(`docs/contracts/marison/v1/${names[kind as keyof typeof names]}.example.json`,"utf8"));
    // Captured with the pinned Zod3 parser before upgrading, including schema key order.
    const legacyHashes={unit:"8184bf5d71c8b883915aae431122aca18e0800b6b1be06b471d12d4462cab0ff",non_unit:"724c18c74faf5992f7c2e255bc8308c1e6b6ddbe6f5800d842f43bd71e7cbfa5",asset:"1b70072cbadacadfca09907eb943584f58d8550f61634c704b4ff5811ac535e4",fund:"958416f343e868aafee6e5b494c6c014cd2be1815292b18909e5ff7e5dcbccd3"};
    const before=JSON.stringify(fixture);
    const parsed=assertMarisonOutboundContract(kind,fixture);
    expect(parsed).toEqual(fixture);
    expect(createHash("sha256").update(JSON.stringify(parsed)).digest("hex")).toBe(legacyHashes[kind as keyof typeof legacyHashes]);
    expect(JSON.stringify(fixture)).toBe(before);
    expect(()=>assertMarisonOutboundContract(kind,{...fixture,not_a_vendor_field:true})).toThrow();
  });
  it("keeps API validation errors at 400 with fieldErrors, not stack traces or values", async () => {
    const app=Fastify({logger:false});
    registerErrorHandler(app);
    app.post("/validate",async request=>loginSchema.parse(request.body));
    try {
      const response=await app.inject({method:"POST",url:"/validate",payload:{email:"bad",password:""}});
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({error:"Payload tidak valid.",details:{fieldErrors:{email:expect.any(Array),password:expect.any(Array)}}});
      expect(response.body).not.toContain("ZodError");
      expect(response.body).not.toContain('"input"');
    } finally { await app.close(); }
  });
  it("keeps shared schemas and the API error handler on the same Zod class", () => {
    try { loginSchema.parse({}); throw Error("must reject"); }
    catch (error) { expect(error).toBeInstanceOf(ZodError); }
  });
  it("preserves backend environment defaults and reports only invalid field names", async () => {
    for(const [key,value] of Object.entries({NODE_ENV:"test",PORT:"80",SUPABASE_URL:"https://database.test",SUPABASE_PUBLISHABLE_KEY:"test-public",SESSION_SECRET:"a".repeat(40),STORAGE_MODE:"self_hosted_supabase",STORAGE_SUPABASE_URL:"https://storage.test",STORAGE_SUPABASE_SERVICE_ROLE_KEY:"test-storage",STORAGE_PUBLIC_BASE_URL:"https://storage.test/public"})) vi.stubEnv(key,value);
    const valid=await import("../../backend/src/config/env");
    expect(valid.getEnvironment()).toMatchObject({PORT:80,TRUST_PROXY:false,MAX_UPLOAD_BYTES:25*1024*1024});
    vi.resetModules(); vi.stubEnv("PORT","not-a-port");
    const invalid=await import("../../backend/src/config/env");
    expect(()=>invalid.getEnvironment()).toThrow("Konfigurasi backend tidak valid: PORT");
    try { invalid.getEnvironment(); } catch(error) { expect(String(error)).not.toContain("test-storage"); }
  });
  it("rejects oversized constrained collections before collecting per-element issues", () => {
    const result=z.array(z.object({name:z.string()})).max(4).safeParse(Array.from({length:65},()=>({name:42})));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].code).toBe("too_big");
    }
  });
  it("pins patched Zod across runtime workspaces and documentation dependencies", () => {
    for(const path of ["package.json","backend/package.json","shared/package.json"])
      expect(JSON.parse(readFileSync(path,"utf8")).dependencies.zod).toBe("4.6.7");
    expect(JSON.parse(readFileSync("external-api/docs-zudoku/package.json","utf8")).overrides.zod).toBe("4.6.7");
    for(const path of ["package-lock.json","external-api/docs-zudoku/package-lock.json"]) {
      const packages=JSON.parse(readFileSync(path,"utf8")).packages;
      const entries=Object.entries(packages).filter(([name])=>name.endsWith("node_modules/zod"));
      expect(entries.length).toBeGreaterThan(0);
      for(const [,pkg] of entries) expect((pkg as {version:string}).version).toBe("4.6.7");
    }
  });
});
