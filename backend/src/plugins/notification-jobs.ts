import type {FastifyInstance} from 'fastify';
import {adminSupabase} from '../lib/supabase.js';
import {isBrowserPushConfigured,sendQueuedBrowserPush} from '../domain-runtime.js';
import {createNotificationDelivery,notificationAudience} from '../modules/attention/notification-delivery.js';

export async function registerNotificationJobs(app:FastifyInstance) {
 if(process.env.SIGAP_NOTIFICATION_JOBS_ENABLED!=='true')return;
 const client=adminSupabase;if(!client)throw Error('Notification database is not configured.');
 const audience=notificationAudience(process.env.SIGAP_NOTIFICATION_AUDIENCE,process.env.MARISON_DEPLOYMENT_ENVIRONMENT);
 const runtime=createNotificationDelivery({
  rpc:(name,args)=>client.rpc(name,args).abortSignal(AbortSignal.timeout(10000)),
  send:sendQueuedBrowserPush,configured:isBrowserPushConfigured,
 },audience);
 let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const cycle=async()=>{
  try{await runtime.tick();}catch{app.log.warn('Notification background cycle failed; retrying on the next cycle.');}
  if(!closed){timer=setTimeout(()=>{void cycle();},5000);timer.unref();}
 };
 app.addHook('onReady',async()=>{timer=setTimeout(()=>{void cycle();},1000);timer.unref();});
 app.addHook('onClose',async()=>{closed=true;runtime.stop();clearTimeout(timer);});
}
