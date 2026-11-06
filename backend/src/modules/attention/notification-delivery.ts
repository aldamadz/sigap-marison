type Result = {data:unknown;error:unknown};
type Delivery = {id:string;lease_token:string;notification_id:string;subscription:unknown;endpoint:string;category:string|null};
export type BrowserPushPayload = {title:string;message:string;link:string;tag:string;notificationId:string};
type Dependencies = {
 rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<Result>;
 send:(subscription:unknown,payload:BrowserPushPayload)=>Promise<unknown>;
 configured:()=>boolean;
 now?:()=>number;
};
const uuid=(value:unknown):value is string=>typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const delivery=(value:unknown):Delivery=>{
 if(!value || typeof value!=='object')throw Error('invalid_delivery');
 const row=value as Record<string,unknown>;
 if(!uuid(row.id)||!uuid(row.lease_token)||!uuid(row.notification_id)||typeof row.endpoint!=='string')throw Error('invalid_delivery');
 return {id:row.id,lease_token:row.lease_token,notification_id:row.notification_id,subscription:row.subscription,endpoint:row.endpoint,category:typeof row.category==='string'?row.category:null};
};
export function notificationAudience(value:string|undefined,environment:string|undefined):string[]|null {
 if(value===undefined || value===''){
  if(environment==='staging')throw Error('Staging notification audience must be explicitly configured.');
  return null;
 }
 const ids=[...new Set(value.split(',').map(value=>value.trim()).filter(Boolean))];
 if(!ids.length||ids.length>1000||ids.some(id=>!uuid(id)))throw Error('Invalid notification audience.');return ids;
}
export function createNotificationDelivery({rpc,send,configured,now=Date.now}:Dependencies,audience:string[]|null) {
 let busy=false,lastGenerated=-Infinity,stopped=false;
 const call=async(name:string,args:Record<string,unknown>)=>{const result=await rpc(name,args);if(result.error)throw Error(`notification_rpc:${name}`);return result.data;};
 return {
  stop(){stopped=true;},
  async tick(){
   if(stopped||busy)return {skipped:true};busy=true;
   let generated=0,sent=0,failed=0;
   try {
    if(now()-lastGenerated>=60000){generated=Number(await call('generate_notification_reminders',{p_audience:audience}));lastGenerated=now();}
    if(!configured()||stopped)return {generated,sent,failed};
    const data=await call('claim_notification_push',{p_limit:20,p_audience:audience});
    if(!Array.isArray(data)||data.length>20)throw Error('invalid_delivery_batch');
    const rows=data.map(delivery);let cursor=0;
    const consume=async()=>{
     while(cursor<rows.length&&!stopped){
      const row=rows[cursor++];let outcome='sent',code:string|null=null;
      try {
       const subscription=row.subscription && typeof row.subscription==='object'?row.subscription as Record<string,unknown>:null;
       if(!subscription || subscription.endpoint!==row.endpoint)throw Object.assign(Error('Invalid endpoint'),{code:'invalid_endpoint',statusCode:400});
       await send(subscription,{title:'Marison - SIGAP',message:row.category==='team_digest'?'Ada pengajuan aktif yang perlu dipantau tim Anda.':row.category?.startsWith('calendar_')?'Ada pengingat Kalender Kerja untuk Anda.':'Ada notifikasi SIGAP yang memerlukan perhatian Anda.',
        link:`/notifications/open?id=${row.notification_id}`,tag:`sigap-notification:${row.notification_id}`,notificationId:row.notification_id});sent++;
      }catch(error){
       const details=error && typeof error==='object'?error as Record<string,unknown>:{};
       const status=Number(details.statusCode || details.status);
       code=details.code==='invalid_endpoint'?'invalid_endpoint':Number.isInteger(status)&&status>=400&&status<600?String(status):'network_error';
       outcome=code==='invalid_endpoint'||status>=400&&status<500&&![408,429].includes(status)?'failed':'retry';failed++;
      }
      await call('finish_notification_push',{p_id:row.id,p_lease_token:row.lease_token,p_outcome:outcome,p_error_code:code});
     }
    };
    // Keep the single-flight lock until every sender has settled, including failed acknowledgements.
    const results=await Promise.allSettled(Array.from({length:Math.min(4,rows.length)},consume));
    if(results.some(result=>result.status==='rejected'))throw Error('notification_ack_failed');
    return {generated,sent,failed};
   }finally{busy=false;}
  },
 };
}
