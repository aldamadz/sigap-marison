import { createPrivateKey, sign } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { assertSameOrigin, getSession } from '../lib/session.js';
import { createUserSupabaseClient } from '../lib/supabase.js';

export const requireMaintenanceAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const session=await getSession(request,reply);
  const {data,error}=await createUserSupabaseClient(session!.access_token).from('profiles')
    .select('id,role,is_active,deleted_at').eq('id',session!.user.id).maybeSingle();
  if(error || !data || !['admin','super_admin'].includes(data.role) || data.is_active!==true || data.deleted_at!==null) {
    throw Object.assign(new Error('Akses admin diperlukan.'),{statusCode:403});
  }
  return data.id as string;
};
export const maintenanceControl = async (command: Record<string,unknown>) => {
  const origin=process.env.MAINTENANCE_EDGE_ORIGIN;
  const privateKey=process.env.MAINTENANCE_SIGNING_KEY_PKCS8;
  if(!origin || !privateKey)throw Object.assign(new Error('Kontrol maintenance belum dikonfigurasi.'),{statusCode:503});
  const url=new URL(origin);
  if(url.protocol!=='https:' || url.pathname!=='/' || url.search || url.hash || url.username || url.password)throw Error('Invalid maintenance origin');
  const timestamp=String(Date.now()),body=JSON.stringify(command);
  const key=createPrivateKey({key:Buffer.from(privateKey,'base64'),format:'der',type:'pkcs8'});
  const signature=sign(null,Buffer.from(`${timestamp}\n${url.hostname}\n${body}`),key).toString('hex');
  const response=await fetch(new URL('/.sigap-maintenance/control',url),{method:'POST',redirect:'error',body,
    headers:{'Content-Type':'application/json','X-SIGAP-Timestamp':timestamp,'X-SIGAP-Signature':signature},signal:AbortSignal.timeout(10000)});
  const result=await response.json() as {error?:string};
  if(!response.ok)throw Object.assign(new Error(result.error || 'Jadwal tidak dapat disimpan.'),{statusCode:response.status});
  return result;
};
export const registerMaintenanceRoutes = async (app: FastifyInstance) => {
  app.get('/api/maintenance/access',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    await requireMaintenanceAdmin(request,reply);return {admin:true};
  });
  app.get('/api/maintenance/admin',async(request,reply)=>{
    reply.header('Cache-Control','no-store');await requireMaintenanceAdmin(request,reply);
    return maintenanceControl({action:'read'});
  });
  app.post('/api/maintenance/admin',{bodyLimit:8192,schema:{body:{type:'object',additionalProperties:false,required:['action','expectedRevision'],properties:{
    action:{type:'string',enum:['publish','complete','cancel']},expectedRevision:{type:'integer',minimum:0},schedule:{type:'object',maxProperties:7},
  }}}},async(request,reply)=>{
    assertSameOrigin(request);reply.header('Cache-Control','no-store');
    const actorId=await requireMaintenanceAdmin(request,reply);
    return maintenanceControl({...request.body as Record<string,unknown>,actorId});
  });
};
