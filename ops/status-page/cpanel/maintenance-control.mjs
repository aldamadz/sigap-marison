import { DatabaseSync, backup } from 'node:sqlite';
import { createPublicKey, verify, randomUUID } from 'node:crypto';
import { readFile, mkdir, chmod, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchedule, dayInWib, publicState } from '../../maintenance/schedule.mjs';

export const HOSTS = ['sigap.marisoncloud.com', 'sigap.marison-testing.biz.id'];
const schema = `CREATE TABLE control_state(hostname TEXT PRIMARY KEY, revision INTEGER NOT NULL, state_json TEXT NOT NULL);
CREATE TABLE control_events(hostname TEXT NOT NULL, revision INTEGER NOT NULL, event_json TEXT NOT NULL, PRIMARY KEY(hostname,revision));`;
const open = path => {
  if (!existsSync(path)) throw Error('Control database unavailable');
  const db = new DatabaseSync(path);db.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');return db;
};
const stateOf = (db, host) => {
  const row = db.prepare('SELECT revision,state_json FROM control_state WHERE hostname=?').get(host);
  if (!row) throw Error('Control host unavailable');
  const state = JSON.parse(row.state_json);
  if (state.revision !== row.revision || !Number.isSafeInteger(state.revision)) throw Error('Control state invalid');
  return state;
};
export function readControlStates(path,host,afterRevision,now=Date.now()) {
  if(!HOSTS.includes(host) || !Number.isSafeInteger(afterRevision) || afterRevision< -1 || !existsSync(path))throw Error('Invalid local control source');
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    db.exec('PRAGMA busy_timeout=3000; BEGIN');
    const current=publicState(stateOf(db,host),now);
    const events=db.prepare('SELECT event_json FROM control_events WHERE hostname=? AND revision>? AND revision<=? ORDER BY revision LIMIT 100')
      .all(host,afterRevision,current.revision).map(row=>{
        const event=JSON.parse(row.event_json),at=Date.parse(event.at);
        if(!Number.isFinite(at))throw Error('Invalid local control event');
        return {state:publicState({revision:event.revision,schedule:event.after},now),at};
      });
    db.exec('COMMIT');return {current,events};
  }finally{db.close();}
}
export function bootstrapControl(path, hosts, reason, now = Date.now()) {
  if (existsSync(path) || typeof reason !== 'string' || reason.length < 20) throw Error('Refusing unsafe bootstrap');
  for(const host of HOSTS)if(!hosts[host] || !Number.isSafeInteger(hosts[host].revision) || hosts[host].revision<0 || hosts[host].schedule!==null)throw Error('Explicit reopening state required');
  const db = new DatabaseSync(path);
  try {
    db.exec(schema);db.exec('BEGIN IMMEDIATE');
    for (const host of HOSTS) {
      const state = hosts[host];
      if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0 || state.schedule !== null) throw Error('Explicit reopening state required');
      const event = { revision:state.revision, actorId:null, actorKind:'operator', action:'bootstrap', at:new Date(now).toISOString(), before:null, after:null, reason };
      db.prepare('INSERT INTO control_state VALUES(?,?,?)').run(host,state.revision,JSON.stringify(state));
      db.prepare('INSERT INTO control_events VALUES(?,?,?)').run(host,state.revision,JSON.stringify(event));
    }
    db.exec('COMMIT');
  } catch (error) { if(db.isTransaction)db.exec('ROLLBACK');throw error; }
  finally {db.close();}
}
export function controlCommand(db, host, command, now = Date.now()) {
  if (!HOSTS.includes(host) || !command || typeof command !== 'object' || Array.isArray(command)) return {status:400,error:'Perintah tidak valid.'};
  db.exec('BEGIN IMMEDIATE');
  try {
    const state = stateOf(db,host);
    if (command.action === 'read') {
      const history = db.prepare('SELECT event_json FROM control_events WHERE hostname=? ORDER BY revision DESC LIMIT 20').all(host).map(row=>JSON.parse(row.event_json));
      db.exec('COMMIT');return {status:200,body:{...state,history}};
    }
    if (!Number.isSafeInteger(command.expectedRevision) || state.revision !== command.expectedRevision) {
      db.exec('ROLLBACK');return {status:409,error:'Jadwal telah diubah admin lain. Muat ulang dahulu.'};
    }
    if (!/^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(command.actorId || '')) {
      db.exec('ROLLBACK');return {status:400,error:'Identitas admin tidak valid.'};
    }
    let schedule;
    if (command.action === 'publish') {
      schedule=validateSchedule(command.schedule,now,state.schedule?.status==='published'?state.schedule:null);
      // All read caches expire before a newly published schedule may start.
      const start=Date.parse(schedule.startsAt);
      if(start>now && start<now+30000)throw Error('Jadwalkan setidaknya 30 detik setelah waktu sekarang.');
    } else if (['complete','cancel'].includes(command.action) && state.schedule?.status==='published') {
      schedule={...state.schedule,status:command.action==='complete'?'completed':'cancelled'};
    } else {db.exec('ROLLBACK');return {status:400,error:'Tindakan tidak tersedia.'};}
    const next={...state,revision:state.revision+1,schedule:{...schedule,id:state.schedule?.status==='published'?state.schedule.id:randomUUID()}};
    if(command.action==='complete' && schedule.whatsNew && now>=Date.parse(schedule.startsAt)) {
      const completedAt=new Date(now).toISOString();
      next.release={id:next.schedule.id,completedAt,expiresAt:new Date(Date.parse(`${dayInWib(completedAt)}T00:00:00+07:00`)+86400000).toISOString(),items:schedule.whatsNew.split('\n').map(line=>line.trim()).filter(Boolean)};
    }
    const event={revision:next.revision,actorId:command.actorId,action:command.action,at:new Date(now).toISOString(),before:state.schedule,after:next.schedule};
    db.prepare('UPDATE control_state SET revision=?,state_json=? WHERE hostname=? AND revision=?').run(next.revision,JSON.stringify(next),host,state.revision);
    db.prepare('INSERT INTO control_events VALUES(?,?,?)').run(host,next.revision,JSON.stringify(event));
    db.exec('COMMIT');return {status:200,body:{...next,history:[event]}};
  } catch (error) {
    if(db.isTransaction)db.exec('ROLLBACK');
    return {status:400,error:error instanceof Error?error.message:'Jadwal tidak valid.'};
  }
}
export function verifyEnvelope(config, envelope, now=Date.now()) {
  const {host,timestamp,signature,bodyBase64}=envelope;
  if(!HOSTS.includes(host) || !/^\d{13}$/.test(timestamp||'') || Math.abs(now-Number(timestamp))>60000
    || !/^[a-f0-9]{128}$/.test(signature||'') || typeof bodyBase64!=='string' || bodyBase64.length>11000)return null;
  const body=Buffer.from(bodyBase64,'base64');if(body.length>8192)return null;
  try {
    const key=createPublicKey({key:Buffer.from(config.publicKeys[host],'base64'),format:'der',type:'spki'});
    if(!verify(null,Buffer.concat([Buffer.from(`${timestamp}\n${host}\n`),body]),key,Buffer.from(signature,'hex')))return null;
    return {host,command:JSON.parse(body.toString('utf8'))};
  } catch{return null;}
}
export async function backupControl(path,directory) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const destination=resolve(directory,`maintenance-control-${new Date().toISOString().slice(0,10)}.sqlite`);
  if(existsSync(destination))return;
  const temporary=destination+'.'+randomUUID()+'.tmp',db=open(path);
  try{await backup(db,temporary);}finally{db.close();}
  const check=new DatabaseSync(temporary,{readOnly:true});
  try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Control backup invalid');}finally{check.close();}
  await chmod(temporary,0o600);await rename(temporary,destination);
}
async function main() {
  process.umask(0o077);
  const [operation,configPath,inputPath,flag]=process.argv.slice(2);
  const config=JSON.parse(await readFile(configPath,'utf8'));
  if(!config.database?.startsWith('/') || !config.backups?.startsWith('/') || !HOSTS.every(host=>config.publicKeys?.[host]))throw Error('Invalid control configuration');
  if(operation==='bootstrap') {
    if(flag!=='--production')throw Error('Explicit operator flag required');
    const input=JSON.parse(await readFile(inputPath,'utf8'));
    bootstrapControl(config.database,input.hosts,input.reason);await chmod(config.database,0o600);
    console.log(JSON.stringify({bootstrapped:true,hosts:HOSTS}));return;
  }
  const db=open(config.database);
  try {
    if(operation==='backup') {
      await backupControl(config.database,config.backups);
      console.log(JSON.stringify({backup:true}));return;
    }
    if(operation!=='request')throw Error('Unsupported control operation');
    let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>16384)throw Error('Envelope too large');}
    const verified=verifyEnvelope(config,JSON.parse(text));
    const result=verified?controlCommand(db,verified.host,verified.command):{status:401,error:'Unauthorized'};
    console.log(JSON.stringify(result));
  } finally {db.close();}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  main().catch(()=>{console.error('Private maintenance control failed');process.exitCode=1;});
}
