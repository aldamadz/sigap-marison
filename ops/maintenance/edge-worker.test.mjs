import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { announcementStart, schedulePhase, validateSchedule, publicState } from './schedule.mjs';
import { createEdgeHandler, MaintenanceControl, renderEdgePage } from './edge-worker.mjs';
const now=Date.now(),host='sigap.marison-testing.biz.id';
const pair=generateKeyPairSync('ed25519');
const publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
const future={category:'update',impact:'full',message:'Pembaruan sistem SIGAP',startsAt:new Date(now+3600000).toISOString(),duration:2,unit:'hours'};
const schedule={...validateSchedule(future,now),id:'schedule-1'};
const stored=(value={revision:0,schedule:null})=>{
  const map=new Map([['state',value]]);
  const storage={get:async key=>map.get(key),put:async(key,value)=>{map.set(key,value);},list:async()=>new Map([...map].filter(([key])=>key.startsWith('audit:'))),transaction:async task=>task(storage)};
  const control=new MaintenanceControl({storage});
  return {control,map,env:{HOSTNAME:host,CONTROL_PUBLIC_KEY:publicKey,CONTROL:{idFromName:x=>x,get:()=>({fetch:(url,init)=>control.fetch(url instanceof Request?url:new Request(url,init))})}}};
};
const request=(path='/',options={})=>new Request(`https://${host}${path}`,{headers:{accept:'text/html'},...options});
const signed=(body,hostName=host,timestamp=String(Date.now()))=>new Request(`https://${host}/.sigap-maintenance/control`,{method:'POST',body,headers:{'x-sigap-timestamp':timestamp,'x-sigap-signature':sign(null,Buffer.from(`${timestamp}\n${hostName}\n${body}`),pair.privateKey).toString('hex')}});
test('notice starts at previous calendar midnight WIB, not exactly 24 hours earlier',()=>{
  assert.equal(announcementStart('2026-10-21T13:00:00+07:00'),'2026-10-19T17:00:00.000Z');
  const s={...schedule,startsAt:'2026-10-21T06:00:00Z',endsAt:'2026-10-21T08:00:00Z'};
  assert.equal(schedulePhase(s,Date.parse('2026-10-19T16:59:59Z')),'scheduled');
  assert.equal(schedulePhase(s,Date.parse('2026-10-19T17:00:00Z')),'announced');
  assert.equal(schedulePhase(s,Date.parse('2026-10-21T06:00:00Z')),'maintenance');
  assert.equal(schedulePhase(s,Date.parse('2026-10-22T06:00:00Z')),'maintenance','ETA never auto-opens full maintenance');
  assert.equal(schedulePhase({...s,impact:'disruption'},Date.parse('2026-10-21T06:00:00Z')),'disruption');
  assert.equal(schedulePhase({...s,impact:'disruption'},Date.parse('2026-10-21T08:00:00Z')),'none');
  assert.equal(schedulePhase({...s,status:'cancelled'},Date.parse('2026-10-21T06:00:00Z')),'none');
});
test('validation rejects invalid fields, unlimited time and moving an active full schedule',()=>{
  for(const patch of [{impact:'anything'},{category:'any'},{duration:0},{duration:1.5},{duration:31,unit:'days'},{message:'x'},{startsAt:'2026-10-21T13:00'},{startsAt:'bad'}])assert.throws(()=>validateSchedule({...future,...patch},now));
  const active={...schedule,startsAt:new Date(now-60000).toISOString()};
  assert.throws(()=>validateSchedule({...active,impact:'disruption'},now,active));
  assert.throws(()=>validateSchedule({...active,startsAt:new Date(now+60000).toISOString()},now,active));
});
test('public state and fallback exclude admin/audit/private data; output is escaped and offline assets are independent',()=>{
  const state=publicState({...{revision:1,schedule},history:[{actorId:'private'}]},now);
  assert(!('history' in state));
  const html=renderEdgePage({...state,schedule:{...schedule,message:'<script>bad</script>'}});
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/prefers-reduced-motion/);
  assert.doesNotMatch(renderEdgePage(state,true),/Perkiraan selesai/,'Unexpected outages have no fabricated ETA');
});
test('signed control requires valid signature, timestamp, exact hostname; stale/replayed writes fail and audit remains',async()=>{
  const {env,map}=stored();const handler=createEdgeHandler(async()=>new Response('origin'));
  const command={action:'publish',expectedRevision:0,actorId:'00000000-0000-0000-0000-000000000001',schedule:future};
  const body=JSON.stringify(command);
  assert.equal((await handler.fetch(request('/.sigap-maintenance/control',{method:'POST',body}),env)).status,401);
  assert.equal((await handler.fetch(signed(body,'sigap.marisoncloud.com'),env)).status,401);
  assert.equal((await handler.fetch(signed(body,host,String(now-120000)),env)).status,401);
  assert.equal((await handler.fetch(signed('x'.repeat(8193)),env)).status,413);
  assert.equal((await handler.fetch(signed('\u00e9'.repeat(5000)),env)).status,413,'body limit counts UTF-8 bytes, not characters');
  assert.equal((await handler.fetch(signed(body),env)).status,200);
  assert.equal((await handler.fetch(signed(body),env)).status,409);
  assert.equal(map.get('state').revision,1);assert.equal(map.get('audit:000000000001').actorId,command.actorId);
  const publicResponse=await handler.fetch(request('/api/maintenance/status'),env);
  assert.equal(publicResponse.status,200);assert(!JSON.stringify(await publicResponse.json()).includes('actorId'));
  assert.equal((await handler.fetch(request('/.sigap-maintenance/control'),env)).status,405);
});
test('normal and disruption traffic remains intact, preserving cookies, POST and streams without replay',async()=>{
  for(const s of [null,{...schedule,impact:'disruption',startsAt:new Date(now-1000).toISOString()}]){
    const {env}=stored({revision:1,schedule:s});let calls=0;
    const handler=createEdgeHandler(async r=>{calls++;assert.equal(r.headers.get('cookie'),'session=private');assert.equal(await r.text(),'original');return new Response('event: original',{headers:{'Content-Type':'text/event-stream'}});});
    const response=await handler.fetch(request('/api/submit',{method:'POST',body:'original',headers:{cookie:'session=private'}}),env);
    assert.equal(response.headers.get('content-type'),'text/event-stream');assert.equal(await response.text(),'event: original');assert.equal(calls,1);
  }
});
test('full maintenance blocks ordinary traffic but permits authenticated administrator recovery and assets',async()=>{
  const {env}=stored({revision:1,schedule:{...schedule,startsAt:new Date(now-1000).toISOString()}});let posts=0;
  const handler=createEdgeHandler(async r=>{if(new URL(r.url).pathname==='/api/maintenance/access')return new Response(null,{status:r.headers.get('cookie')==='admin-session'?200:403});posts++;return new Response('origin');},{'/.sigap-maintenance/static.svg':{body:'svg',type:'image/svg+xml'}});
  const page=await handler.fetch(request(),env);assert.equal(page.status,503);assert.match(await page.text(),/SIGAP sedang dalam pemeliharaan/);
  assert.equal((await handler.fetch(request('/api/submit',{method:'POST',body:'do-not-send'}),env)).status,503);assert.equal(posts,0);
  assert.equal((await handler.fetch(request('/',{headers:{cookie:'admin-session',accept:'text/html'}}),env)).status,503,'Dashboard admins use the same edge page');
  assert.equal((await handler.fetch(request('/admin/configuration/maintenance',{headers:{cookie:'admin-session',accept:'text/html'}}),env)).status,200);
  assert.equal((await handler.fetch(request('/maintenance-admin'),env)).status,200);
  assert.equal((await handler.fetch(request('/.sigap-maintenance/static.svg'),env)).status,200);
  assert.equal((await handler.fetch(request('/api/auth/session'),env)).status,200);
  assert.equal((await handler.fetch(request('/marison-sigap-logo-v2.png'),env)).status,200,'Public login logo must remain available before admin authentication');
  assert.equal((await handler.fetch(request('/favicon.ico'),env)).status,200);
  assert.equal((await handler.fetch(request('/health/ready'),env)).status,503,'Monitoring must not report origin as healthy');
});

test('canonical scheduled page is independent of origin and admin cookies, refresh stays identical, and completion exits without looping',async()=>{
  const state={revision:2,schedule:{...schedule,startsAt:new Date(now-1000).toISOString()}};
  const {env,map}=stored(state);let calls=0;
  const handler=createEdgeHandler(async()=>{calls++;throw Error('origin offline');});
  const direct=await handler.fetch(request('/dashboard'),env);assert.equal(direct.status,503);
  const canonical=await handler.fetch(request('/.sigap-maintenance/page',{headers:{cookie:'admin-session'}}),env);
  assert.equal(canonical.status,503);assert.match(canonical.headers.get('content-type'),/text\/html/);
  assert.equal(await canonical.text(),await direct.text());assert.equal(calls,0,'Scheduled page must not wait for the restarting origin');
  const refresh=await handler.fetch(request('/.sigap-maintenance/page'),env);assert.equal(refresh.status,503);
  assert.equal((await handler.fetch(request('/.sigap-maintenance/page',{method:'HEAD'}),env)).status,503);
  assert.equal(await (await handler.fetch(request('/.sigap-maintenance/page',{method:'HEAD'}),env)).text(),'');
  assert.equal((await handler.fetch(request('/.sigap-maintenance/page',{method:'POST',body:'never forward'}),env)).status,405);assert.equal(calls,0);
  for(const patch of [{status:'completed'},{status:'cancelled'},{startsAt:new Date(now+3600000).toISOString()},{impact:'disruption'}]) {
    map.set('state',{...state,schedule:{...state.schedule,...patch}});
    const exit=await handler.fetch(request('/.sigap-maintenance/page'),env);
    assert.equal(exit.status,303);assert.equal(exit.headers.get('location'),'/');assert.equal(exit.headers.get('cache-control'),'no-store');
  }
});
test('origin failures/tunnel 530 are branded 503, APIs JSON, no replay; security and business errors are not masked',async()=>{
  const {env}=stored();
  for(const status of [502,503,504,520,522,530]){
    let calls=0;const handler=createEdgeHandler(async()=>{calls++;return new Response('Cloudflare error',{status});});
    const response=await handler.fetch(request(),env);assert.equal(response.status,503);assert.match(await response.text(),/SIGAP sementara tidak dapat diakses/);assert.equal(calls,1);
    const api=await handler.fetch(request('/api/send',{method:'POST',body:'original'}),env);assert.equal(api.headers.get('content-type'),'application/json');assert.equal((await api.json()).error,'service_unavailable');
  }
  for(const status of [400,401,403,404,422,500])assert.equal((await createEdgeHandler(async()=>new Response('unchanged',{status})).fetch(request(),env)).status,status);
  const failed=await createEdgeHandler(async()=>{throw Error('private host');}).fetch(request(),env);assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private host/);
  assert.equal((await createEdgeHandler().fetch(new Request('https://other.example/'),env)).status,404);
});

test('release notes are private until actual completion, expire at midnight WIB and survive a new schedule',async()=>{
  const notes='Perbaikan: Notifikasi\nPenambahan fitur: Reminder';
  const active={...schedule,startsAt:new Date(now-60000).toISOString(),whatsNew:notes};
  const {env,map}=stored({revision:1,schedule:active});
  const handler=createEdgeHandler(async()=>new Response('origin'));
  const before=await (await handler.fetch(request('/api/maintenance/status'),env)).json();
  assert(!before.release);assert(!('whatsNew' in before.schedule));
  const command={action:'complete',expectedRevision:1,actorId:'00000000-0000-0000-0000-000000000001'};
  assert.equal((await handler.fetch(signed(JSON.stringify(command)),env)).status,200);
  const state=map.get('state');
  assert.deepEqual(state.release.items,notes.split('\n'));assert.equal(state.release.id,active.id);
  assert.equal(state.release.expiresAt,new Date(Date.parse(`${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(state.release.completedAt))}T00:00:00+07:00`)+86400000).toISOString());
  assert(publicState(state,Date.parse(state.release.expiresAt)-1).release);
  assert(!publicState(state,Date.parse(state.release.expiresAt)).release);
  const publish={action:'publish',expectedRevision:2,actorId:command.actorId,schedule:future};
  assert.equal((await handler.fetch(signed(JSON.stringify(publish)),env)).status,200);
  assert.deepEqual(map.get('state').release,state.release);
});

test('cancel, future completion, missing notes and elapsed estimate never publish release notes',async()=>{
  for(const [action,s] of [['cancel',{...schedule,whatsNew:'Tidak diterbitkan'}],['complete',{...schedule,whatsNew:'Belum mulai'}],['complete',{...schedule,startsAt:new Date(now-60000).toISOString()}]]) {
    const {env,map}=stored({revision:1,schedule:s});const handler=createEdgeHandler(async()=>new Response('origin'));
    assert.equal((await handler.fetch(signed(JSON.stringify({action,expectedRevision:1,actorId:'00000000-0000-0000-0000-000000000001'})),env)).status,200);
    assert(!map.get('state').release);
  }
  assert(!publicState({revision:1,schedule:{...schedule,whatsNew:'Masih berlangsung'}},Date.parse(schedule.endsAt)+1000).release);
  for(const whatsNew of [123,{},'x'.repeat(1501),Array(11).fill('Baris').join('\n')])assert.throws(()=>validateSchedule({...future,whatsNew},now));
});
