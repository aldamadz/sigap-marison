import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import {createHostedMaintenanceReader,maintenanceHosts,publicHostedMaintenance} from '../lib/hosted-maintenance.js';
import {requireMaintenanceAdmin} from '../routes/maintenance.routes.js';
const recovery=new Set(['/api/maintenance/status','/api/maintenance/admin','/api/maintenance/access','/api/auth/login','/api/auth/session','/api/auth/logout']);
export function registerHostedMaintenanceGuard(app:FastifyInstance,publicUrl:string,options:{fetcher?:typeof fetch;now?:()=>number;admin?:(request:FastifyRequest,reply:FastifyReply)=>Promise<unknown>}={}) {
  const host=new URL(publicUrl).hostname;if(!maintenanceHosts.includes(host))return null;
  if(new URL(publicUrl).protocol!=='https:')throw Error('HTTPS maintenance origin required');
  const reader=createHostedMaintenanceReader(host,options.fetcher,options.now);
  app.get('/api/maintenance/status',async(_request,reply)=>reply.header('Cache-Control','no-store').send(publicHostedMaintenance(await reader.read(),options.now?.())));
  app.addHook('onRequest',async(request,reply)=>{
    const path=request.url.split('?')[0];
    // These retain their existing service-token checks and must keep draining during maintenance.
    if(path.startsWith('/api/internal/'))return;
    if(path==='/health/ready' && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.raw.socket.remoteAddress||''))return;
    if(recovery.has(path) || (!path.startsWith('/api/') && path!=='/health/ready'))return;
    let state;
    try{state=publicHostedMaintenance(await reader.read(),options.now?.());}
    catch{return reply.code(503).header('Cache-Control','no-store').header('Retry-After','30').send({error:'service_unavailable',message:'Kontrol pemeliharaan sementara tidak tersedia.'});}
    if(state.phase!=='maintenance')return;
    if(path!=='/health/ready') {
      try{await (options.admin||requireMaintenanceAdmin)(request,reply);return;}catch{/* Only the existing authenticated admin recovery path may bypass the hold. */}
    }
    return reply.code(503).header('Cache-Control','no-store').header('Retry-After','120').send({error:'maintenance',message:'SIGAP sedang dalam pemeliharaan.',maintenance:state});
  });
  app.addHook('onResponse',async(request,reply)=>{if(reply.statusCode>=200 && reply.statusCode<300 && request.method==='POST' && request.url.split('?')[0]==='/api/maintenance/admin')reader.invalidate();});
  return reader;
}
