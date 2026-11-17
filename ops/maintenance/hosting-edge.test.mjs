import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createEdgeHandler} from './edge-worker.mjs';
const host='sigap.marison-testing.biz.id';
test('hosting mode never invokes Durable Objects and preserves original POST/cookies without replay',async()=>{
  let reads=0,posts=0;
  const env={HOSTNAME:host,HOSTING_CONTROL_URL:'https://status.marisoncloud.com/sigap-maintenance/control',CONTROL:{get(){throw Error('DO free quota exhausted');}}};
  const handler=createEdgeHandler(async (request,options)=>{
    if(String(request.url||request).startsWith('https://status.marisoncloud.com/')){assert.equal(options.redirect,'manual');reads++;return Response.json({host,revision:11,schedule:null});}
    posts++;assert.equal(request.headers.get('cookie'),'session=fixture');assert.equal(await request.text(),'original');return new Response('unchanged');
  });
  for(let i=0;i<2;i++)assert.equal((await handler.fetch(new Request(`https://${host}/api/test`,{method:'POST',headers:{cookie:'session=fixture'},body:'original'}),env)).status,200);
  assert.equal(reads,1);assert.equal(posts,2);
});
test('signed admin control is relayed to exact hosting endpoint and an unsigned call never reaches hosting',async()=>{
  const pair=generateKeyPairSync('ed25519');let calls=0;
  const env={HOSTNAME:host,HOSTING_CONTROL_URL:'https://status.marisoncloud.com/sigap-maintenance/control',CONTROL_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'der'}).toString('base64')};
  const handler=createEdgeHandler(async request=>{calls++;assert.equal(request.redirect,'manual');assert.equal(request.url,env.HOSTING_CONTROL_URL);assert.equal(request.headers.get('x-sigap-hostname'),host);assert.equal(request.headers.get('cookie'),null);return Response.json({revision:12,schedule:null});});
  const body=JSON.stringify({action:'read'}),timestamp=String(Date.now()),signature=sign(null,Buffer.from(`${timestamp}\n${host}\n${body}`),pair.privateKey).toString('hex');
  assert.equal((await handler.fetch(new Request(`https://${host}/.sigap-maintenance/control`,{method:'POST',body}),env)).status,401);assert.equal(calls,0);
  assert.equal((await handler.fetch(new Request(`https://${host}/.sigap-maintenance/control`,{method:'POST',body,headers:{'x-sigap-timestamp':timestamp,'x-sigap-signature':signature}}),env)).status,200);assert.equal(calls,1);
});

test('authority redirects fail closed and are never followed',async()=>{
  let calls=0;
  const env={HOSTNAME:host,HOSTING_CONTROL_URL:'https://status.marisoncloud.com/sigap-maintenance/control'};
  const handler=createEdgeHandler(async(_request,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://untrusted.example/'}});});
  assert.equal((await handler.fetch(new Request(`https://${host}/api/maintenance/status`),env)).status,503);
  assert.equal(calls,1);
});
test('hosting outage is fail-closed; full maintenance keeps edge-owned offline HTML',async()=>{
  const env={HOSTNAME:host,HOSTING_CONTROL_URL:'https://status.marisoncloud.com/sigap-maintenance/control'};
  const request=()=>new Request(`https://${host}/dashboard`,{headers:{accept:'text/html'}});
  assert.equal((await createEdgeHandler(async()=>new Response('down',{status:503})).fetch(request(),env)).status,503);
  const now=Date.now();let originCalls=0;
  const handler=createEdgeHandler(async input=>{
    if(String(input.url||input).startsWith('https://status.marisoncloud.com/'))return Response.json({host,revision:12,schedule:{id:'fixture',category:'repair',impact:'full',message:'Pemeliharaan sintetis',status:'published',startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+60000).toISOString(),duration:1,unit:'minutes'}});
    originCalls++;throw Error('origin offline');
  });
  const response=await handler.fetch(request(),env);assert.equal(response.status,503);assert.match(await response.text(),/SIGAP sedang dalam pemeliharaan/);assert.equal(originCalls,0);
});
