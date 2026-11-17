export const maintenanceHosts = ['sigap.marisoncloud.com','sigap.marison-testing.biz.id'];
type Schedule = {id:string;category:string;impact:string;message:string;startsAt:string;endsAt:string;duration:number;unit:string;status:string};
type Release = {id:string;completedAt:string;expiresAt:string;items:string[]};
export type HostedMaintenanceState = {host:string;revision:number;schedule:Schedule|null;release?:Release};
const record = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
const date = (value:unknown):value is string => typeof value==='string' && Number.isFinite(Date.parse(value)) && /(Z|[+-]\d\d:\d\d)$/.test(value);
export function parseHostedMaintenance(value:unknown,host:string):HostedMaintenanceState {
  if(!record(value) || value.host!==host || !Number.isSafeInteger(value.revision) || Number(value.revision)<0 || !('schedule' in value))throw Error('Invalid maintenance authority');
  const s=value.schedule;
  if(s!==null && (!record(s) || typeof s.id!=='string' || s.id.length>100
    || !['repair','development','update'].includes(String(s.category)) || !['full','disruption'].includes(String(s.impact))
    || !['published','completed','cancelled'].includes(String(s.status)) || typeof s.message!=='string' || s.message.trim().length<5 || s.message.length>1000
    || !date(s.startsAt) || !date(s.endsAt) || Date.parse(s.endsAt)<=Date.parse(s.startsAt)
    || !Number.isSafeInteger(s.duration) || Number(s.duration)<1 || !['minutes','hours','days'].includes(String(s.unit))))throw Error('Invalid maintenance schedule');
  const schedule=s===null?null:Object.fromEntries(['id','category','impact','message','startsAt','endsAt','duration','unit','status'].map(key=>[key,s[key]])) as Schedule;
  const result:HostedMaintenanceState={host,revision:Number(value.revision),schedule};
  if(value.release!==undefined) {
    const r=value.release;
    if(!record(r) || typeof r.id!=='string' || !date(r.completedAt) || !date(r.expiresAt) || !Array.isArray(r.items)
      || r.items.length>10 || r.items.some(item=>typeof item!=='string') || r.items.join('\n').length>1500)throw Error('Invalid maintenance release');
    result.release={id:r.id,completedAt:r.completedAt,expiresAt:r.expiresAt,items:r.items as string[]};
  }
  return result;
}
export function publicHostedMaintenance(state:HostedMaintenanceState,now=Date.now()) {
  const s=state.schedule;let phase='none';
  if(s?.status==='published') {
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.startsAt));
    const announcement=Date.parse(`${day}T00:00:00+07:00`)-86400000;
    phase=now<announcement?'scheduled':now<Date.parse(s.startsAt)?'announced':s.impact==='full'?'maintenance':now<Date.parse(s.endsAt)?'disruption':'none';
  }
  return {revision:state.revision,schedule:s,phase,serverNow:new Date(now).toISOString(),
    ...(state.release && Date.parse(state.release.completedAt)<=now && now<Date.parse(state.release.expiresAt)?{release:state.release}:{})};
}
async function boundedJson(response:Response) {
  if(!response.ok || !response.headers.get('content-type')?.includes('application/json') || !response.body)throw Error('Maintenance authority unavailable');
  const reader=response.body.getReader();let text='',size=0;const decoder=new TextDecoder();
  for(;;) {
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>32768){await reader.cancel();throw Error('Maintenance response too large');}
    text+=decoder.decode(value,{stream:true});
  }
  return JSON.parse(text+decoder.decode());
}
export function createHostedMaintenanceReader(host:string,fetcher:typeof fetch=fetch,now:()=>number=Date.now) {
  if(!maintenanceHosts.includes(host))throw Error('Maintenance host not allowed');
  let cached:HostedMaintenanceState|undefined,expires=0,pending:Promise<HostedMaintenanceState>|undefined,generation=0;
  const read=async():Promise<HostedMaintenanceState>=>{
    if(cached && now()<expires)return cached;
    if(pending)return pending;
    const version=generation;
    const operation=(async()=>{
      const response=await fetcher(`https://status.marisoncloud.com/sigap-maintenance/state?host=${host}`,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(3000)});
      const next=parseHostedMaintenance(await boundedJson(response),host);
      if(cached && next.revision<cached.revision)throw Error('Maintenance revision regressed');
      if(version===generation){cached=next;expires=now()+5000;}return next;
    })();
    pending=operation;
    try{return await operation;}finally{if(pending===operation)pending=undefined;}
  };
  return {read,invalidate:()=>{generation++;expires=0;pending=undefined;}};
}
