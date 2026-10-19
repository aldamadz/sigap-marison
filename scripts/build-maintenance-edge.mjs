import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const output=resolve(process.argv[2] || '.maintenance-build');mkdirSync(output,{recursive:true});
const source=readFileSync('ops/maintenance/edge-worker.mjs','utf8');
const assets={
 '/.sigap-maintenance/logo.png':{type:'image/png',body:readFileSync('public/logo-marison-regency-group.png').toString('base64')},
 '/.sigap-maintenance/animation.svg':{type:'image/svg+xml',body:readFileSync('public/maintenance-animation.svg','utf8')},
 '/.sigap-maintenance/static.svg':{type:'image/svg+xml',body:readFileSync('public/maintenance-illustration-static.svg','utf8')},
};
const entry=`${source}\nconst assetData=${JSON.stringify(assets)}; assetData['/.sigap-maintenance/logo.png'].body=Uint8Array.from(atob(assetData['/.sigap-maintenance/logo.png'].body),c=>c.charCodeAt(0));export default createEdgeHandler(fetch,assetData);`;
await build({stdin:{contents:entry,resolveDir:resolve('ops/maintenance'),sourcefile:'edge-entry.mjs'},bundle:true,format:'esm',platform:'browser',outfile:resolve(output,'worker.mjs'),minify:true});
writeFileSync(resolve(output,'metadata.json'),JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-10-19',bindings:[{type:'plain_text',name:'HOSTNAME',text:'sigap.marison-testing.biz.id'},{type:'durable_object_namespace',name:'CONTROL',class_name:'MaintenanceControl'}],migrations:{new_tag:'v1',new_sqlite_classes:['MaintenanceControl']}}));
console.log('Maintenance edge bundle built; no credentials included.');
