import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {generateKeyPairSync,sign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {bootstrapControl,HOSTS} from './maintenance-control.mjs';
test('hosting PHP control: cheap readonly state, authenticated writes, host isolation and no public audit',async t=>{
  if(process.env.STATUS_PHP_TEST!=='1'){t.skip('PHP integration runs on CI and hosting');return;}
  execFileSync('php',['-r','exit(extension_loaded("sqlite3") && extension_loaded("sodium") ? 0 : 1);']);
  const root=await mkdtemp(resolve(tmpdir(),'maintenance-http-')),web=resolve(root,'domain/public'),privateRoot=resolve(root,'status-private');
  await mkdir(web,{recursive:true});await mkdir(privateRoot);
  await copyFile(new URL('./public/index.php',import.meta.url),resolve(web,'index.php'));
  const path=resolve(privateRoot,'control.sqlite');
  bootstrapControl(path,Object.fromEntries(HOSTS.map(host=>[host,{revision:0,schedule:null}])),'Fixture explicit reopening with preserved legacy archive');
  const keys=HOSTS.map(()=>generateKeyPairSync('ed25519'));
  const config={database:path,backups:resolve(privateRoot,'backups'),node:process.execPath,
    runtime:fileURLToPath(new URL('./maintenance-control.mjs',import.meta.url)),
    publicKeys:Object.fromEntries(HOSTS.map((host,i)=>[host,keys[i].publicKey.export({type:'spki',format:'der'}).toString('base64')]))};
  const controlConfig=resolve(privateRoot,'maintenance-control.json');await writeFile(controlConfig,JSON.stringify(config));
  await writeFile(resolve(privateRoot,'config.json'),JSON.stringify({maintenanceGateway:fileURLToPath(new URL('./maintenance-gateway.php',import.meta.url)),maintenanceControlConfig:controlConfig}));
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const server=spawn('php',['-S',`127.0.0.1:${port}`,resolve(web,'index.php')],{stdio:['ignore','pipe','pipe']});
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PHP startup timeout')),5000);server.on('error',reject);server.stderr.on('data',data=>{if(data.toString().includes('Development Server')){clearTimeout(timer);resolve();}});});
    const request=(path,options={})=>new Promise((resolve,reject)=>{
      const req=httpRequest({hostname:'127.0.0.1',port,path,method:options.method||'GET',headers:{host:'status.marisoncloud.com',...options.headers},timeout:10000},res=>{
        const chunks=[];res.on('data',data=>chunks.push(data));res.on('end',()=>resolve(new Response([204,304].includes(res.statusCode)?null:Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
      });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('HTTP timeout')));req.end(options.body);
    });
    const endpoint='/sigap-maintenance/control',state=`/sigap-maintenance/state?host=${HOSTS[0]}`;
    assert.equal((await request(endpoint,{method:'POST',body:'{}',headers:{'x-sigap-hostname':HOSTS[0]}})).status,401);
    assert.equal((await request(state,{method:'POST'})).status,405);
    assert.equal((await request('/sigap-maintenance/state?host=attacker.example')).status,404);
    const initial=await request(state);assert.equal(initial.status,200);assert.equal(initial.headers.get('cache-control'),'no-store');
    assert.deepEqual(await initial.json(),{host:HOSTS[0],revision:0,schedule:null});
    const body=JSON.stringify({action:'publish',actorId:'00000000-0000-0000-0000-000000000001',expectedRevision:0,
      schedule:{category:'repair',impact:'full',message:'Pemeliharaan sintetis',startsAt:new Date(Date.now()+60000).toISOString(),duration:1,unit:'hours',whatsNew:'Draft rahasia sintetis'}});
    const stamp=String(Date.now()),signature=sign(null,Buffer.from(`${stamp}\n${HOSTS[0]}\n${body}`),keys[0].privateKey).toString('hex');
    const headers={'content-type':'application/json','x-sigap-hostname':HOSTS[0],'x-sigap-timestamp':stamp,'x-sigap-signature':signature};
    assert.equal((await request(endpoint,{method:'POST',body:body+' ',headers})).status,401);
    assert.equal((await request(endpoint,{method:'POST',body,headers:{...headers,'x-sigap-hostname':HOSTS[1]}})).status,401);
    assert.equal((await request(endpoint,{method:'POST',body,headers})).status,200);
    assert.equal((await request(endpoint,{method:'POST',body,headers})).status,409);
    const publicText=await (await request(state)).text();assert.doesNotMatch(publicText,/Draft|actor|bootstrap|history|whatsNew/);
    assert.equal((await (await request(`/sigap-maintenance/state?host=${HOSTS[1]}`)).json()).revision,0);
    const db=new DatabaseSync(path,{readOnly:true});assert.equal(db.prepare('SELECT count(*) n FROM control_events').get().n,3);db.close();
  }finally{server.kill();await once(server,'exit');await rm(root,{recursive:true,force:true});}
});
