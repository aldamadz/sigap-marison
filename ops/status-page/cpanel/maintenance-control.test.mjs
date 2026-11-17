import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync,sign} from 'node:crypto';
import {bootstrapControl,controlCommand,verifyEnvelope,HOSTS} from './maintenance-control.mjs';
const now=Date.parse('2026-11-17T06:00:00Z'),actorId='00000000-0000-0000-0000-000000000001';
const fixture=async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'maintenance-authority-')),path=resolve(root,'control.sqlite');
  bootstrapControl(path,Object.fromEntries(HOSTS.map(host=>[host,{revision:11,schedule:null}])),'Explicit synthetic operator reopening; no legacy audit fabricated',now);
  return {db:new DatabaseSync(path),close:async()=>{await rm(root,{recursive:true,force:true});}};
};
const schedule={category:'repair',impact:'full',message:'Pemeliharaan sintetis',startsAt:new Date(now+60000).toISOString(),duration:1,unit:'hours'};
test('signed envelope binds exact bytes, host, timestamp and signer; rejects replay mutation by revision',async()=>{
  const f=await fixture();try {
    const pair=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');
    const publicKeys={[HOSTS[0]]:pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),[HOSTS[1]]:other.publicKey.export({type:'spki',format:'der'}).toString('base64')};
    const command={action:'publish',actorId,expectedRevision:11,schedule},body=JSON.stringify(command),timestamp=String(now);
    const envelope={host:HOSTS[0],timestamp,bodyBase64:Buffer.from(body).toString('base64'),signature:sign(null,Buffer.from(`${timestamp}\n${HOSTS[0]}\n${body}`),pair.privateKey).toString('hex')};
    assert.ok(verifyEnvelope({publicKeys},envelope,now));
    for(const patch of [{host:HOSTS[1]},{timestamp:String(now-61000)},{signature:'0'.repeat(128)},{bodyBase64:Buffer.from(body+' ').toString('base64')}])assert.equal(verifyEnvelope({publicKeys},{...envelope,...patch},now),null);
    assert.equal(controlCommand(f.db,HOSTS[0],command,now).status,200);
    assert.equal(controlCommand(f.db,HOSTS[0],command,now).status,409);
    assert.equal(f.db.prepare('SELECT count(*) n FROM control_events WHERE hostname=?').get(HOSTS[0]).n,2);
  }finally{f.db.close();await f.close();}
});
test('minimum publication lead protects cache; completion and audit are immutable, stage/prod isolated',async()=>{
  const f=await fixture();try {
    assert.equal(controlCommand(f.db,HOSTS[0],{action:'publish',actorId,expectedRevision:11,schedule:{...schedule,startsAt:new Date(now+1000).toISOString()}},now).status,400);
    assert.equal(controlCommand(f.db,HOSTS[0],{action:'publish',actorId,expectedRevision:11,schedule},now).status,200);
    assert.equal(controlCommand(f.db,HOSTS[0],{action:'complete',actorId,expectedRevision:12},now+120000).body.schedule.status,'completed');
    assert.equal(controlCommand(f.db,HOSTS[0],{action:'cancel',actorId,expectedRevision:12},now+130000).status,409);
    const state=controlCommand(f.db,HOSTS[0],{action:'read'},now+130000).body;
    assert.equal(state.history.length,3);assert.equal(state.history[0].actorId,actorId);assert.equal(state.history[1].after.status,'published');
    assert.equal(controlCommand(f.db,HOSTS[1],{action:'read'},now).body.revision,11);
    assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{f.db.close();await f.close();}
});
