import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
const mock=vi.hoisted(()=>({getSession:vi.fn(),origin:vi.fn(),profile:vi.fn()}));
vi.mock('../../backend/src/lib/session.js',()=>({getSession:mock.getSession,assertSameOrigin:mock.origin}));
vi.mock('../../backend/src/lib/supabase.js',()=>({createUserSupabaseClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:mock.profile})})})})}));
import { registerMaintenanceRoutes } from '../../backend/src/routes/maintenance.routes';
beforeEach(()=>{vi.clearAllMocks();mock.getSession.mockResolvedValue({access_token:'private',user:{id:'admin'}});mock.profile.mockResolvedValue({data:{id:'admin',role:'admin',is_active:true,deleted_at:null},error:null});});
describe('maintenance admin boundary',()=>{
  it('denies ordinary, inactive and deleted profiles even with a session',async()=>{
    const app=Fastify();await registerMaintenanceRoutes(app);
    for(const profile of [{role:'user',is_active:true,deleted_at:null},{role:'admin',is_active:false,deleted_at:null},{role:'admin',is_active:true,deleted_at:'2026-10-19'}]){
      mock.profile.mockResolvedValue({data:{id:'admin',...profile},error:null});expect((await app.inject({url:'/api/maintenance/access'})).statusCode).toBe(403);
    }await app.close();
  });
  it('requires same origin and server-derived actor, signs without exposing key, rejects supplied actor',async()=>{
    const pair=generateKeyPairSync('ed25519');vi.stubEnv('MAINTENANCE_EDGE_ORIGIN','https://sigap.marison-testing.biz.id');vi.stubEnv('MAINTENANCE_SIGNING_KEY_PKCS8',pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'));
    const fetcher=vi.fn(async(input:URL,init:RequestInit)=>{
      expect(input.hostname).toBe('sigap.marison-testing.biz.id');const h=init.headers as Record<string,string>;const body=String(init.body);
      expect(JSON.parse(body).actorId).toBe('admin');expect(verify(null,Buffer.from(`${h['X-SIGAP-Timestamp']}\nsigap.marison-testing.biz.id\n${body}`),pair.publicKey,Buffer.from(h['X-SIGAP-Signature'],'hex'))).toBe(true);
      return Response.json({revision:1,schedule:null});
    });vi.stubGlobal('fetch',fetcher);
    const app=Fastify();await registerMaintenanceRoutes(app);
    const response=await app.inject({method:'POST',url:'/api/maintenance/admin',payload:{action:'cancel',expectedRevision:0}});
    expect(response.statusCode).toBe(200);expect(mock.origin).toHaveBeenCalled();expect(response.body).not.toContain('private');
    mock.origin.mockImplementation(()=>{throw Object.assign(new Error('Cross site'),{statusCode:403});});
    expect((await app.inject({method:'POST',url:'/api/maintenance/admin',payload:{action:'cancel',expectedRevision:0}})).statusCode).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);await app.close();vi.unstubAllEnvs();vi.unstubAllGlobals();
  });
});
