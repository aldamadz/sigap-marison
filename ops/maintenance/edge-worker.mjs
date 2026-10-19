import { announcementStart, publicState, validateSchedule } from './schedule.mjs';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
const json = (data, status = 200) => Response.json(data, { status, headers });
const empty = { revision: 0, schedule: null };
const readControlBody = async request => {
  const reader=request.body?.getReader();
  if(!reader)return '';
  const chunks=[];let size=0;
  for(;;) {
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>8192){await reader.cancel();return null;}
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(bytes);
};
export const verifyControl = async (key, signature, text) => {
  if(typeof signature!=='string' || !/^[a-f0-9]{128}$/.test(signature) || !key)return false;
  try {
    const publicKey=await crypto.subtle.importKey('spki',Uint8Array.from(atob(key),c=>c.charCodeAt(0)),{name:'Ed25519'},false,['verify']);
    return await crypto.subtle.verify('Ed25519',publicKey,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(text));
  } catch {return false;}
};

// Durable state lives at the edge, independent of SIGAP's application/database.
export class MaintenanceControl {
  constructor(ctx) { this.ctx=ctx; }
  async fetch(request) {
    if(request.method==='GET')return json(await this.ctx.storage.get('state') || empty);
    const command=await request.json();
    try {
      return await this.ctx.storage.transaction(async storage => {
        const state=await storage.get('state') || empty;
        if(command.action==='read')return json({...state,history:[...(await storage.list({prefix:'audit:',reverse:true,limit:20})).values()]});
        if(!Number.isSafeInteger(command.expectedRevision) || state.revision!==command.expectedRevision)return json({error:'Jadwal telah diubah admin lain. Muat ulang dahulu.'},409);
        if(!/^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(command.actorId || ''))return json({error:'Identitas admin tidak valid.'},400);
        let schedule;
        if(command.action==='publish')schedule=validateSchedule(command.schedule,Date.now(),state.schedule?.status==='published'?state.schedule:null);
        else if(['complete','cancel'].includes(command.action) && state.schedule?.status==='published')schedule={...state.schedule,status:command.action==='complete'?'completed':'cancelled'};
        else return json({error:'Tindakan tidak tersedia.'},400);
        const next={revision:state.revision+1,schedule:{...schedule,id:state.schedule?.status==='published'?state.schedule.id:crypto.randomUUID()}};
        const audit={revision:next.revision,actorId:command.actorId,action:command.action,at:new Date().toISOString(),before:state.schedule,after:next.schedule};
        await storage.put(`audit:${String(next.revision).padStart(12,'0')}`,audit);
        await storage.put('state',next);
        return json({...next,history:[audit]});
      });
    } catch(error) { return json({error:error instanceof Error?error.message:'Jadwal tidak dapat disimpan.'},400); }
  }
}

const categoryLabel = { repair:'Perbaikan',development:'Pengembangan',update:'Pembaruan' };
export const renderEdgePage = (state, outage = false) => {
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'full',timeStyle:'short'}).format(new Date(value))+' WIB';
  const s=state?.schedule;
  const known=!outage && s;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${outage?'Gangguan layanan':'Pemeliharaan'} SIGAP</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#222a2b;font:16px/1.6 Arial,sans-serif;letter-spacing:0}.shell{max-width:1000px;margin:auto;padding:24px}header{border-bottom:1px solid #dfe6e3}header img{width:150px;height:64px;object-fit:contain}main{min-height:75vh}picture,img.illustration{display:block;width:100%;max-width:420px}h1{font-size:32px;line-height:1.25;max-width:700px}.message{white-space:pre-wrap;overflow-wrap:anywhere;max-width:700px;color:#59635f}dl{display:grid;gap:16px;padding:24px 0;border-block:1px solid #dfe6e3}dt{font-size:13px;color:#59635f}dd{margin:0;font-weight:600}a{display:inline-block;background:#27873c;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin:12px 0}a:focus-visible{outline:3px solid #c89128;outline-offset:3px}.label{color:#966215;font-size:13px;font-weight:700}footer{background:#f4f7f5;border-top:1px solid #dfe6e3;font-size:13px;color:#59635f}@media(max-width:600px){h1{font-size:26px}}</style></head><body><header><div class="shell"><img src="/.sigap-maintenance/logo.png" alt="Marison Regency Group"></div></header><main class="shell"><picture><source media="(prefers-reduced-motion: reduce)" srcset="/.sigap-maintenance/static.svg"><img class="illustration" src="/.sigap-maintenance/animation.svg" width="420" height="236" alt=""></picture><p class="label">${known?escape(categoryLabel[s.category]):'Gangguan layanan'}</p><h1>${outage?'SIGAP sementara tidak dapat diakses':'SIGAP sedang dalam pemeliharaan'}</h1><p class="message">${known?escape(s.message):'Koneksi ke layanan SIGAP sedang terganggu. Tim kami akan memulihkan layanan secepatnya.'}</p><dl>${known?`<div><dt>Mulai pemeliharaan</dt><dd>${escape(date(s.startsAt))}</dd></div><div><dt>Perkiraan selesai</dt><dd>${escape(date(s.endsAt))}</dd></div>`:''}<div><dt>Status layanan</dt><dd>${known && Date.now()>Date.parse(s.endsAt)?'Pemeliharaan masih berlangsung. Estimasi sedang diperbarui.':'Sementara tidak tersedia'}</dd></div></dl><p>Dokumen dan riwayat yang sudah tersimpan tetap dipertahankan. Pengiriman baru belum dapat dilakukan.</p><a href="/">Periksa kembali</a></main><footer><div class="shell">Marison Regency Group · SIGAP</div></footer></body></html>`;
};
const unavailable = (request,state,outage=false) => {
  const html=['GET','HEAD'].includes(request.method) && (request.headers.get('accept') || '').includes('text/html') && !new URL(request.url).pathname.startsWith('/api/');
  const response=new Response(request.method==='HEAD'?null:html?renderEdgePage(state,outage):JSON.stringify({error:outage?'service_unavailable':'maintenance',message:outage?'SIGAP sementara tidak dapat diakses. Jangan kirim ulang pengajuan sebelum memeriksa statusnya.':'SIGAP sedang dalam pemeliharaan.',maintenance:state}),{status:503,headers:{...headers,'Content-Type':html?'text/html; charset=utf-8':'application/json','Retry-After':'120',...(html?{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'"}:{})}});
  return response;
};
export const createEdgeHandler = (originFetch = fetch, assets = {}) => ({
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.hostname!==env.HOSTNAME)return json({error:'Host tidak diizinkan.'},404);
    const control=env.CONTROL.get(env.CONTROL.idFromName('sigap-maintenance'));
    if(url.pathname==='/.sigap-maintenance/control') {
      if(request.method!=='POST')return json({error:'Method not allowed'},405);
      const timestamp=request.headers.get('x-sigap-timestamp') || '';
      if(!/^\d{13}$/.test(timestamp) || Math.abs(Date.now()-Number(timestamp))>60000 || !env.CONTROL_PUBLIC_KEY)return json({error:'Unauthorized'},401);
      if(Number(request.headers.get('content-length') || 0)>8192)return json({error:'Request too large'},413);
      const text=await readControlBody(request);
      if(text===null)return json({error:'Request too large'},413);
      if(!await verifyControl(env.CONTROL_PUBLIC_KEY,request.headers.get('x-sigap-signature'),`${timestamp}\n${env.HOSTNAME}\n${text}`))return json({error:'Unauthorized'},401);
      return control.fetch(new Request('https://control/',{method:'POST',body:text}));
    }
    const asset=assets[url.pathname];
    if(asset && ['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:asset.body,{headers:{...headers,'Content-Type':asset.type}});
    if(url.pathname==='/.sigap-maintenance/health')return json({service:'sigap-edge',status:'ok'});
    let state;
    try {const stored=await control.fetch('https://control/');if(!stored.ok)throw Error();state=publicState(await stored.json());}
    catch {return unavailable(request,null,true);}
    if(url.pathname==='/api/maintenance/status')return json(state);
    // Control/login must stay reachable, but every control operation still requires
    // the origin's live admin authentication; there is no URL/cookie bypass.
    const controlPaths=['/api/maintenance/admin','/api/maintenance/access','/api/auth/login','/api/auth/session','/api/auth/logout','/maintenance-admin','/admin/configuration/maintenance'];
    const staticAsset=url.pathname.startsWith('/assets/');
    if(state.phase==='maintenance' && !staticAsset && !controlPaths.includes(url.pathname)) {
      try {
        const check=await originFetch(new Request(new URL('/api/maintenance/access',url),{headers:{cookie:request.headers.get('cookie')||''},redirect:'manual',signal:AbortSignal.timeout(8000)}));
        if(check.status!==200)return unavailable(request,state);
      } catch {return unavailable(request,state);}
    }
    let timeout;
    try {
      // Never replay a request (especially POST), rewrite its body, or cache it.
      const navigation=['GET','HEAD'].includes(request.method) && (request.headers.get('accept')||'').includes('text/html');
      const controller=new AbortController();
      if(navigation)timeout=setTimeout(()=>controller.abort(),10000);
      const response=await originFetch(navigation?new Request(request,{signal:controller.signal}):request);
      clearTimeout(timeout);
      if([502,503,504,520,521,522,523,524,525,526,527,530].includes(response.status))return unavailable(request,state,state.phase!=='maintenance');
      return response;
    } catch {return unavailable(request,state,state.phase!=='maintenance');} finally {clearTimeout(timeout);}
  },
});
export { announcementStart };
