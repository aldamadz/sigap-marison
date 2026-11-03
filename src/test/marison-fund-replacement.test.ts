import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { diagnoseVendorRejection } from "../../server/marison-rejection-diagnosis.mjs";
const source=readFileSync("backend/src/domain-runtime.ts","utf8");
const handlers=source.slice(source.indexOf("const createMarisonOutboundReplacement ="),source.indexOf("const getAuthorizedSurat ="));
const job={id:"job",surat_id:"letter",environment:"production",generation:1,kind:"fund",endpoint:"/fund-submissions",status:"failed_terminal",error_code:"marison_http_422",post_started_at:"2026-10-21T00:00:00Z",response:{message:"SQLSTATE[23514] fund_submissions_type_check"},external_reference:null};
function harness(options:{history?:unknown[];payload?:unknown;denied?:boolean;previewError?:Error}={}) {
  const select=vi.fn(),eq=vi.fn(),maybeSingle=vi.fn(async()=>({data:job,error:null}));
  let readingHistory=false;
  const query={select,eq,maybeSingle,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:options.history||[job],error:null}).then(resolve)};
  select.mockImplementation((fields:string)=>{readingHistory=!fields.includes("payload_body");return query;});
  eq.mockReturnValue(query);
  const rpc=vi.fn(async()=>({data:{dispatch_id:"generation-2"},error:null}));
  const preview=vi.fn(async()=>{if(options.previewError)throw options.previewError;return {payload:{type:"marketing_cost",main_document:"https://sigap.test/main.pdf",attachments:[]},sourcePayloadHash:"source-hash",sourceSuratUpdatedAt:"2026-10-21T00:00:00Z",changes:["Dokumen utama dipisahkan"]};});
  const from=vi.fn(()=>{readingHistory=false;return query;});
  const context={supabase:{from,rpc},marisonDeploymentEnvironment:"production",diagnoseVendorRejection,
    assertMarisonProcurementRoute:async()=>{},
    assertSameOrigin:()=>{},requireAdminUser:async()=>{if(options.denied)throw Object.assign(new Error("Forbidden"),{status:403});return{id:"admin"};},
    getBearerToken:()=>"test",readJsonBody:async()=>options.payload||{reason:"Perbaikan vendor dikonfirmasi",confirmProductionSend:true,confirmNotReceived:true,confirmVendorFixed:true},
    getMarisonOutboundPayloadPreview:preview};
  const runtime=vm.runInNewContext(handlers+"\n({createMarisonOutboundReplacement,preflightMarisonOutboundReplacement});",context);
  return {...runtime,rpc,preview,from,get readingHistory(){return readingHistory;}};
}
describe("Fund generation replacement",()=>{
  it("preflights read-only without exposing candidate links/hash on the public result",async()=>{
    const h=harness();const result=await h.preflightMarisonOutboundReplacement({},"job");
    expect(result).toMatchObject({eligible:true,sigapChanged:true});
    expect(result.verifiedFundCandidateBody).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("sigap.test");
    expect(h.preview).toHaveBeenCalledWith({},"job","postman");expect(h.rpc).not.toHaveBeenCalled();
  });
  it("freezes the validated candidate via service RPC only after all confirmations",async()=>{
    const h=harness();expect(await h.createMarisonOutboundReplacement({},"job")).toMatchObject({replacementId:"generation-2"});
    expect(h.rpc).toHaveBeenCalledWith("create_verified_fund_outbound_replacement",expect.objectContaining({
      p_dispatch_id:"job",p_actor_id:"admin",p_expected_payload_hash:"source-hash",p_confirm_not_received:true,p_confirm_vendor_fixed:true,p_confirm_production:true,
      p_candidate_body:JSON.stringify({type:"marketing_cost",main_document:"https://sigap.test/main.pdf",attachments:[]}),
    }));
  });
  it.each([
    {confirmProductionSend:false,confirmNotReceived:true,confirmVendorFixed:true},
    {confirmProductionSend:true,confirmNotReceived:false,confirmVendorFixed:true},
    {confirmProductionSend:true,confirmNotReceived:true,confirmVendorFixed:false},
  ])("rejects missing confirmations %j",async flags=>{
    const h=harness({payload:{reason:"vendor fixed",...flags}});
    await expect(h.createMarisonOutboundReplacement({},"job")).rejects.toBeTruthy();expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([
    [{...job,status:"succeeded",external_reference:"8"}],
    [job,{...job,id:"manual",status:"outcome_unknown"}],
    [job,{...job,id:"new",generation:2,status:"pending"}],
  ].map(history => ({ history })))("blocks any acceptance, uncertain result, or active/newer generation",async ({history})=>{
    const h=harness({history});expect(await h.preflightMarisonOutboundReplacement({},"job")).toMatchObject({eligible:false});
    expect(h.preview).not.toHaveBeenCalled();await expect(h.createMarisonOutboundReplacement({},"job")).rejects.toMatchObject({status:409});expect(h.rpc).not.toHaveBeenCalled();
  });
  it("fails closed for invalid file references and denies nonadmins before reads",async()=>{
    expect(await harness({previewError:new Error("Payload belum siap")}).preflightMarisonOutboundReplacement({},"job")).toMatchObject({eligible:false,reasonCode:"FUND_PAYLOAD_NOT_READY"});
    const h=harness({denied:true});await expect(h.preflightMarisonOutboundReplacement({},"job")).rejects.toMatchObject({status:403});expect(h.from).not.toHaveBeenCalled();
  });
});
