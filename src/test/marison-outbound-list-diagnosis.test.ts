import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,expect,it,vi} from 'vitest';
import {diagnoseVendorRejection} from '../../server/marison-rejection-diagnosis.mjs';
const source=readFileSync('backend/src/domain-runtime.ts','utf8');
const handler=source.slice(source.indexOf('const listMarisonOutboundDispatches ='),source.indexOf('export const generateCurrentMarisonPayloadPreview ='));
function harness(forbidden=false) {
  const rows=['fund','unit','asset'].map(kind=>({id:kind,kind,status:'failed_terminal',environment:'production',generation:1,error_code:'marison_http_422',error_message:'HTTP 422',response:{error:`SQLSTATE[42703]: column "main_document" of relation "private_table" does not exist; SQL: nik=1234567890123456; https://private.example/token`},payload:{secret:'private-body'},surat_registrasi:{no_surat:kind,judul_surat:'UJI'}}));
  const original=structuredClone(rows);
  const query:any={select:vi.fn(()=>query),eq:vi.fn(()=>query),order:vi.fn(()=>query),range:vi.fn(()=>query),in:vi.fn(()=>query),then:(resolve:any)=>Promise.resolve({data:rows,error:null,count:rows.length}).then(resolve)};
  const from=vi.fn(()=>query),rpc=vi.fn();
  const requireAdminUser=vi.fn(async()=>{if(forbidden)throw Object.assign(Error('Forbidden'),{status:403});return{id:'admin'};});
  const context={supabase:{from,rpc},requireAdminUser,getBearerToken:()=>'',marisonDeploymentEnvironment:'production',diagnoseVendorRejection};
  return {...vm.runInNewContext(handler+'\n({listMarisonOutboundDispatches});',context),from,rpc,query,rows,original};
}
describe('admin outbound list diagnosis',()=>{
  it('returns only sanitized historical diagnosis for all three kinds without mutating jobs',async()=>{
    const h=harness();const result=await h.listMarisonOutboundDispatches({},new URL('https://sigap.example/api/integrations/marison/dispatches'));
    expect(result.items).toHaveLength(3);
    for(const item of result.items){expect(item.lastVendorDiagnosis.reasonCode).toBe('VENDOR_MAIN_DOCUMENT_SCHEMA_MISSING');expect(item.failureReason).toContain('main_document');expect(item.response).toBeUndefined();expect(item.payload).toBeUndefined();}
    expect(JSON.stringify(result)).not.toMatch(/SQLSTATE|private_table|1234567890123456|private.example|private-body/);
    expect(h.rows).toEqual(h.original);expect(h.rpc).not.toHaveBeenCalled();expect(h.query.eq).toHaveBeenCalledWith('environment','production');
  });
  it('requires administrator authority before accessing responses',async()=>{
    const h=harness(true);await expect(h.listMarisonOutboundDispatches({},new URL('https://sigap.example/api/integrations/marison/dispatches'))).rejects.toMatchObject({status:403});expect(h.from).not.toHaveBeenCalled();
  });
  it('keeps unrelated or successful responses out of schema diagnosis',async()=>{
    const h=harness();h.rows[0].response={error:'Tipe tidak sesuai'};h.rows[1].status='succeeded';
    const result=await h.listMarisonOutboundDispatches({},new URL('https://sigap.example/api/integrations/marison/dispatches'));
    expect(result.items[0].lastVendorDiagnosis).toBeNull();expect(result.items[0].failureReason).toBe('HTTP 422');expect(result.items[1].lastVendorDiagnosis).toBeNull();
  });
});
