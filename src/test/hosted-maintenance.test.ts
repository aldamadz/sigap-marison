import {describe,it,expect,vi} from 'vitest';
vi.mock('../../backend/src/routes/maintenance.routes.js',()=>({requireMaintenanceAdmin:vi.fn(async()=>{throw Error('Unauthorized');})}));
import Fastify from 'fastify';
import {createHostedMaintenanceReader,parseHostedMaintenance,publicHostedMaintenance} from '../../backend/src/lib/hosted-maintenance';
import {registerHostedMaintenanceGuard} from '../../backend/src/plugins/hosted-maintenance';
import {publicState} from '../../ops/maintenance/schedule.mjs';
const host='sigap.marisoncloud.com',now=Date.parse('2026-11-17T06:00:00Z');
const schedule={id:'fixture',category:'repair',impact:'full',message:'Pemeliharaan sintetis',startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+60000).toISOString(),duration:1,unit:'minutes',status:'published'};
const data=(patch={})=>({host,revision:11,schedule:null,...patch});
describe('hosted maintenance authority',()=>{
  it('validates host, revision, schedule and bounded response; strips private fields',async()=>{
    for(const value of [data({host:'other.example'}),data({revision:-1}),data({schedule:{}}),data({schedule:{...schedule,impact:'anything'}})])expect(()=>parseHostedMaintenance(value,host)).toThrow();
    const parsed=parseHostedMaintenance(data({schedule:{...schedule,whatsNew:'draft',actorId:'private'},history:['private']}),host);
    expect(JSON.stringify(parsed)).not.toContain('private');expect(JSON.stringify(parsed)).not.toContain('draft');
    const reader=createHostedMaintenanceReader(host,vi.fn(async()=>new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}})) as typeof fetch);
    await expect(reader.read()).rejects.toThrow('too large');
    expect(()=>createHostedMaintenanceReader('attacker.example')).toThrow();
  });
  it('coalesces concurrent reads, expires after five seconds and never serves stale healthy state on failure',async()=>{
    let time=now;const fetcher=vi.fn<typeof fetch>(async()=>Response.json(data()));
    const reader=createHostedMaintenanceReader(host,fetcher as typeof fetch,()=>time);
    await Promise.all(Array.from({length:20},()=>reader.read()));expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`https://status.marisoncloud.com/sigap-maintenance/state?host=${host}`);
    time+=5001;fetcher.mockImplementation(async()=>new Response('down',{status:503}));await expect(reader.read()).rejects.toThrow();
    fetcher.mockImplementation(async()=>Response.json(data({revision:10})));await expect(reader.read()).rejects.toThrow('regressed');
    fetcher.mockImplementation(async()=>Response.json(data({revision:12})));reader.invalidate();expect((await reader.read()).revision).toBe(12);
  });
  it('has the same phase semantics as canonical edge scheduling, including full hold beyond ETA',()=>{
    for(const status of ['published','completed','cancelled'])for(const impact of ['full','disruption'])for(const time of [now-172800000,now-86400000,now,now+3600000]) {
      const state=data({schedule:{...schedule,status,impact}});
      expect(publicHostedMaintenance(parseHostedMaintenance(state,host),time).phase).toBe(publicState(state,time).phase);
    }
    expect(publicHostedMaintenance(parseHostedMaintenance(data({schedule}),host),now+3600000).phase).toBe('maintenance');
  });
  it('blocks unsigned API writes BEFORE hijacked domain handlers; preserves authenticated recovery',async()=>{
    const app=Fastify();let writes=0;
    registerHostedMaintenanceGuard(app,`https://${host}`,{fetcher:vi.fn(async()=>Response.json(data({schedule}))) as typeof fetch,now:()=>now,
      admin:async request=>{if(request.headers.cookie!=='fixture-admin')throw Error('Unauthorized');}});
    app.post('/api/write',{onRequest:async(_request,reply)=>{writes++;reply.hijack();reply.raw.end('executed');}},async()=>undefined);
    app.get('/health/ready',async()=>({ok:true}));app.get('/api/auth/session',async()=>({session:null}));
    expect((await app.inject({method:'POST',url:'/api/write',payload:{secret:'untouched'}})).statusCode).toBe(503);expect(writes).toBe(0);
    expect((await app.inject({url:'/health/ready',remoteAddress:'192.0.2.1',headers:{cookie:'fixture-admin'}})).statusCode).toBe(503);
    expect((await app.inject({url:'/health/ready',remoteAddress:'127.0.0.1'})).statusCode).toBe(200);
    expect((await app.inject({url:'/api/maintenance/status'})).json().phase).toBe('maintenance');
    expect((await app.inject({url:'/api/auth/session'})).statusCode).toBe(200);
    expect((await app.inject({method:'POST',url:'/api/write',headers:{cookie:'fixture-admin'}})).statusCode).toBe(200);expect(writes).toBe(1);
    await app.close();
  });
  it('does not replace normal API authentication, and fails closed when hosting is unavailable',async()=>{
    const app=Fastify();let available=true;
    const reader=registerHostedMaintenanceGuard(app,`https://${host}`,{fetcher:vi.fn(async()=>available?Response.json(data()):new Response('offline',{status:503})) as typeof fetch});
    app.get('/api/private',async(_request,reply)=>reply.code(401).send({error:'Unauthorized'}));
    app.get('/api/internal/private',async(_request,reply)=>reply.code(401).send({error:'Service token required'}));
    expect((await app.inject({url:'/api/private'})).statusCode).toBe(401);
    available=false;reader!.invalidate();expect((await app.inject({url:'/api/private'})).statusCode).toBe(503);
    expect((await app.inject({url:'/api/internal/private'})).statusCode).toBe(401);
    await app.close();
  });
});
