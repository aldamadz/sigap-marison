export type MaintenanceSchedule = {
  id?: string; category: 'repair'|'development'|'update'; impact: 'full'|'disruption';
  message: string; startsAt: string; endsAt?: string; duration: number; unit: 'minutes'|'hours'|'days';
  status?: 'published'|'completed'|'cancelled';
  whatsNew?: string;
};
export type ReleaseNotice = {id:string;completedAt:string;expiresAt:string;items:string[]};
export type MaintenanceState = { revision:number; schedule:MaintenanceSchedule|null; phase?:'none'|'scheduled'|'announced'|'maintenance'|'disruption'; serverNow?:string;
  release?:ReleaseNotice;
  history?:{revision:number;actorId:string;action:string;at:string;before:MaintenanceSchedule|null;after:MaintenanceSchedule}[] };
export const maintenanceLabels = {repair:'Perbaikan',development:'Pengembangan',update:'Pembaruan'};
export const maintenanceDate = (value:string) => new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'full',timeStyle:'short'}).format(new Date(value))+' WIB';
export const maintenanceDay = (time: number) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
export const maintenanceInputDate = (time: number) => new Date(time+7*60*60*1000).toISOString().slice(0,16);
export const noticeDismissalKey = (userId:string,state:MaintenanceState,time:number) => `sigap-maintenance:v1:${userId}:${state.schedule?.id}:${state.revision}:${maintenanceDay(time)}`;
const request = async (path:string, body?:unknown):Promise<MaintenanceState> => {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json','X-SIGAP-Client':'web'},body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw Error(result.error || 'Pengaturan maintenance belum dapat dimuat.');return result;
};
export const maintenanceService = {
  openPage:()=>window.location.replace('/.sigap-maintenance/page'),
  status:()=>request('/api/maintenance/status'),
  admin:()=>request('/api/maintenance/admin'),
  update:(body:{action:'publish'|'complete'|'cancel';expectedRevision:number;schedule?:MaintenanceSchedule})=>request('/api/maintenance/admin',body),
};
