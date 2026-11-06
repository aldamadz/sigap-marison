export const isNotificationUuid = (value:unknown): value is string => typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export const notificationOpenPath = (id:string) => `/notifications/open?id=${encodeURIComponent(id)}`;
export function notificationReturnPath(value:unknown):string {
  if(typeof value!=='string' || !value.startsWith('/notifications/open?'))return '/dashboard';
  const url=new URL(value,'https://sigap.invalid');
  const id=url.searchParams.get('id');return url.pathname==='/notifications/open' && isNotificationUuid(id)?notificationOpenPath(id):'/dashboard';
}
const record=(value:unknown):Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{};
export function safeNotificationLink(value:unknown):URL|null {
  if(typeof value!=='string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))return null;
  const url=new URL(value,'https://sigap.invalid');
  return url.origin==='https://sigap.invalid' && ['/dashboard','/calendar','/surat/inbox','/surat/monitoring','/surat/tindak-lanjut','/surat/rekomendasi'].includes(url.pathname)?url:null;
}
export function notificationTask(detail:unknown,userId:string,requestedType?:string|null) {
  const data=record(detail);
  if(!isNotificationUuid(data.id))return null;
  const isVerifier=data.verification_required===true && data.verification_status==='pending'
    && Array.isArray(data.verifier_snapshot) && data.verifier_snapshot.some(value=>record(value).user_id===userId);
  const isSigner=data.user_id===userId;
  const type=requestedType==='verification' ? (isVerifier?'verification':null)
    : requestedType==='approval' ? (isSigner?'approval':null) : isVerifier?'verification':isSigner?'approval':null;
  return type?{...data,id:data.id,task_type:type}:null;
}
export type StoredNotificationTarget = {id:string;user_id:string;link?:string|null;data?:unknown};
export async function resolveNotificationTarget(notification:StoredNotificationTarget,getDetail:(id:string)=>Promise<unknown>):Promise<string|null> {
  const data=record(notification.data),link=safeNotificationLink(notification.link);
  const suratId=isNotificationUuid(data.surat_id)?data.surat_id:link?.searchParams.get('document');
  const fallback=isNotificationUuid(suratId)?`/surat/monitoring?document=${suratId}`:null;
  if(data.category==='team_digest')return '/dashboard?scope=team';
  if(link?.pathname==='/surat/inbox' || isNotificationUuid(data.signature_id)) {
    const key=link?.searchParams.get('task') || '';
    const [prefix,rawId]=key.includes(':')?key.split(':'):[null,key];
    const signatureId=isNotificationUuid(data.signature_id)?data.signature_id:rawId;
    if(!isNotificationUuid(signatureId))return fallback;
    try {
      const task=notificationTask(await getDetail(signatureId),notification.user_id,typeof data.task_type==='string'?data.task_type:prefix);
      if(!task)return fallback;
      return `/surat/inbox?task=${encodeURIComponent(`${task.task_type}:${task.id}`)}${isNotificationUuid(suratId)?`&document=${suratId}`:''}`;
    }catch(error){
      if(error instanceof Error && /Task tidak aktif|Not found|tidak ditemukan/.test(error.message))return fallback;
      throw error;
    }
  }
  if(link?.pathname==='/surat/tindak-lanjut' && isNotificationUuid(suratId))return `/surat/tindak-lanjut?surat=${suratId}`;
  if(link?.pathname==='/surat/rekomendasi'){
    const task=isNotificationUuid(data.recommendation_task_id)?data.recommendation_task_id:link.searchParams.get('task');
    return isNotificationUuid(task)?`/surat/rekomendasi?task=${task}`:'/surat/rekomendasi';
  }
  if(link?.pathname==='/calendar'){
    const date=link.searchParams.get('date'),entry=link.searchParams.get('entry');
    return `/calendar${date && /^\d{4}-\d\d-\d\d$/.test(date)?`?date=${date}&view=day${isNotificationUuid(entry)?`&entry=${entry}`:''}`:''}`;
  }
  return fallback || (link?.pathname==='/dashboard'?'/dashboard':null);
}
