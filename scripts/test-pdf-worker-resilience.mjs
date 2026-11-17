import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {assertPdfJobCurrentSource,createPdfWorkerFetch,withPdfJobLease,processPdfJobBatch,safePdfWorkerError,runPdfJobPool,pdfPublicationError} from '../server/pdf-worker-job.mjs';

const job={surat_id:'document',signature_id:null,source_file_path:'native://document/document/v1',lease_expires_at:new Date(Date.now()+300000).toISOString()};
const client=(row,error=null)=>({from:table=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:row,error})}),maybeSingle:async()=>({data:row,error})})})})});

test('a free slot takes the next job without waiting for a slow peer and never exceeds concurrency',async()=>{
  const controller=new AbortController();let release,slowFinished=false,active=0,maximum=0;
  const slow=new Promise(resolve=>{release=resolve;});const queue=[{id:1},{id:2},{id:3}];const claims=[];
  const pool=runPdfJobPool({concurrency:2,pollIntervalMs:2,maxIdlePollIntervalMs:5,signal:controller.signal,
    claimJobs:async limit=>{claims.push(limit);return queue.splice(0,limit);},
    processJob:async current=>{active++;maximum=Math.max(maximum,active);try{
      if(current.id===1){await slow;slowFinished=true;}
      if(current.id===3){assert.equal(slowFinished,false);controller.abort();release();}
    }finally{active--;}}
  });
  try{await Promise.race([pool,delay(1000).then(()=>{throw Error('Pool did not refill a free slot');})]);}
  finally{controller.abort();release();await pool;}
  assert.equal(maximum,2);assert.deepEqual(claims,[2,1]);assert.equal(active,0);
});

test('only the stable publication supersession code is terminal; permission and transient failures stay unchanged',()=>{
  const obsolete=pdfPublicationError({code:'PT409',details:'PDF_SOURCE_CHANGED',message:'Native PDF source changed'});
  assert.equal(obsolete.code,'PDF_SOURCE_CHANGED');assert.match(obsolete.message,/versi PDF/);
  for(const error of [{code:'42501'},{code:'40001'},{code:'PT409',details:'OTHER_CONFLICT'},new Error('Timeout')]){
    assert.equal(pdfPublicationError(error),error);
  }
});

test('an unacknowledged failure reserves its slot until lease expiry, while shutdown drains claimed jobs',async()=>{
  const controller=new AbortController();const expires=Date.now()+70;let thirdStarted=0,claims=0,errors=0;
  const queue=[{id:1,lease_expires_at:new Date(expires).toISOString()},{id:2},{id:3}];
  const pool=runPdfJobPool({concurrency:1,signal:controller.signal,pollIntervalMs:2,maxIdlePollIntervalMs:5,
    claimJobs:async limit=>{claims++;return queue.splice(0,limit);},onError:()=>{errors++;},
    processJob:async current=>{if(current.id===1)throw Error('Failure acknowledgement unavailable');
      if(current.id===2){assert.ok(Date.now()>=expires);controller.abort();await delay(10);thirdStarted++;}}
  });
  await pool;assert.equal(errors,1);assert.equal(claims,2);assert.equal(thirdStarted,1);assert.equal(queue.length,1);
});

test('shutdown during a claim still processes the returned leases and stops further claims',async()=>{
  const controller=new AbortController();let processed=0,claims=0;
  await runPdfJobPool({concurrency:2,signal:controller.signal,
    claimJobs:async()=>{claims++;controller.abort();return[{id:1},{id:2}];},
    processJob:async()=>{await delay(2);processed++;}
  });
  assert.equal(processed,2);assert.equal(claims,1);
});

test('a transient claim error backs off and recovers without duplicating work',async()=>{
  const controller=new AbortController();let claims=0,processed=0,errors=0;
  await runPdfJobPool({concurrency:1,signal:controller.signal,pollIntervalMs:2,maxIdlePollIntervalMs:5,
    claimJobs:async()=>{if(++claims<3)throw Error('Temporary database outage');return[{id:1}];},
    onError:()=>{errors++;},processJob:async()=>{processed++;controller.abort();}
  });
  assert.equal(claims,3);assert.equal(errors,2);assert.equal(processed,1);
});

test('stale native main source fails before rendering; current and signed historical sources remain valid',async()=>{
  await assert.rejects(assertPdfJobCurrentSource(client({file_path:'native://document/document/v2'}),job),error=>error.code==='PDF_SOURCE_CHANGED');
  await assertPdfJobCurrentSource(client({file_path:job.source_file_path}),job);
  const signed={...job,signature_id:'signature'};
  await assertPdfJobCurrentSource(client({file_path_snap:job.source_file_path,is_signed:true}),signed);
  await assert.rejects(assertPdfJobCurrentSource(client({file_path_snap:job.source_file_path,is_signed:false}),signed));
  await assert.rejects(assertPdfJobCurrentSource(client(null),job));
  await assert.rejects(assertPdfJobCurrentSource(client(null,{code:'DB_UNAVAILABLE'}),job),error=>error.code==='DB_UNAVAILABLE');
});

test('batch waits for remaining jobs even when failure transition itself rejects',async()=>{
  let release;const slow=new Promise(resolve=>{release=resolve;});let settled=false;
  const batch=processPdfJobBatch([{id:1},{id:2}],async job=>{if(job.id===1)throw Error('render failed');await slow;},async()=>{throw Error('lease rejected');}).then(results=>{settled=true;return results;});
  await delay(5);assert.equal(settled,false);release();
  assert.deepEqual((await batch).map(result=>result.status),['rejected','fulfilled']);
});

test('transport bounds hanging I/O and never retries a request itself',async()=>{
  let calls=0;
  const fetcher=createPdfWorkerFetch(async(_input,init)=>{calls++;return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));},{timeoutMs:10});
  await assert.rejects(Promise.race([fetcher('https://fixture.invalid/'),delay(200).then(()=>{throw Error('Timeout not enforced');})]),error=>error.name==='TimeoutError');
  assert.equal(calls,1);
});

test('expired leases cannot start work and concurrent lease signals do not cancel each other',async()=>{
  await assert.rejects(withPdfJobLease({...job,lease_expires_at:new Date(Date.now()-1).toISOString()},async()=>assert.fail('expired work started')));
  let calls=0;
  const fetcher=createPdfWorkerFetch(async(_input,init)=>{calls++;await delay(20);init.signal.throwIfAborted();return new Response('ok');},{timeoutMs:100});
  const results=await Promise.allSettled([
    withPdfJobLease(job,()=>fetcher('https://fixture.invalid/'),{maxMs:5}),
    withPdfJobLease(job,()=>fetcher('https://fixture.invalid/'),{maxMs:100}),
  ]);
  assert.deepEqual(results.map(result=>result.status),['rejected','fulfilled']);assert.equal(calls,2);
});

test('worker uses queue-owned retries, early version validation and a bounded draining pool',()=>{
  const worker=readFileSync(new URL('../pdf-worker.mjs',import.meta.url),'utf8');
  assert.match(worker,/db:\s*\{\s*retry:\s*false/);
  assert.ok(worker.indexOf('await assertPdfJobCurrentSource(supabase, job)')<worker.indexOf('let recommendation ='));
  assert.match(worker,/await runPdfJobPool\(/);
  assert.match(worker,/p_limit: available/);
  assert.match(worker,/pdfPublicationError\(completionError\)/);
  assert.match(worker,/pdfPublicationError\(publishError\)/);
});

test('transport preserves mutation body and caller cancellation; error logging hides URLs and tokens',async()=>{
  const controller=new AbortController();let calls=0;
  const fetcher=createPdfWorkerFetch(async(_input,init)=>{calls++;assert.equal(init.method,'POST');assert.equal(init.body,'original');assert.equal(init.headers['x-fixture'],'kept');assert.equal(init.signal.aborted,true);throw init.signal.reason;});
  controller.abort(new Error('caller cancelled'));
  await assert.rejects(fetcher('https://fixture.invalid/',{method:'POST',body:'original',headers:{'x-fixture':'kept'},signal:controller.signal}),/caller cancelled/);assert.equal(calls,1);
  const error=safePdfWorkerError({code:'42501',message:`Failed https://private.invalid/secret?token=value ${'x'.repeat(80)}`});
  assert.equal(error.code,'42501');assert.ok(!error.message.includes('secret'));assert.ok(!error.message.includes('x'.repeat(80)));
});

test('failure publication gets its own timeout after the job lease deadline aborts',async()=>{
  let published=false;
  const fetcher=createPdfWorkerFetch(async(input,init)=>{
    if(input.endsWith('/failure')){assert.equal(init.signal.aborted,false);published=true;return new Response('ok');}
    await delay(15);init.signal.throwIfAborted();return new Response('unexpected');
  });
  const results=await processPdfJobBatch([job],current=>withPdfJobLease(current,()=>fetcher('https://fixture.invalid/render'),{maxMs:5}),async()=>fetcher('https://fixture.invalid/failure'));
  assert.equal(published,true);assert.equal(results[0].status,'fulfilled');
});

test('a503 with a long Retry-After returns to queue retry handling without sleeping',async()=>{
  let calls=0;
  const client=createClient('https://fixture.invalid','fixture-key',{auth:{persistSession:false},db:{retry:false},global:{fetch:createPdfWorkerFetch(async()=>{calls++;return Response.json({message:'Synthetic unavailable'},{status:503,headers:{'Retry-After':'120'}});})}});
  const result=await client.from('fixture').select('id');
  assert.equal(result.status,503);assert.equal(calls,1);
});
