import {supabase} from '@/lib/supabase';
export type DepartmentReceivingRule={dept_id:string;period_month:string;enabled:boolean;cutoff_day:number|null;cutoff_time:string;reopen_day:number;reopen_time:string;sla_minutes:number|null;message:string};
export const regularReceivingMonth='2000-01-01';
export const defaultReceivingRule={enabled:false,cutoff_day:null,cutoff_time:'17:00',reopen_day:1,reopen_time:'08:00',sla_minutes:null,message:''};
export function validateReceivingRule(rule:DepartmentReceivingRule) {
 if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(rule.period_month)||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(rule.cutoff_time)||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(rule.reopen_time))throw Error('Periksa bulan dan jam penerimaan.');
 if(rule.enabled&&rule.cutoff_day===null)throw Error('Isi tanggal tutup penerimaan.');
 if(!Number.isInteger(rule.reopen_day)||rule.reopen_day<1||rule.reopen_day>28||rule.cutoff_day!==null&&(!Number.isInteger(rule.cutoff_day)||rule.cutoff_day<1||rule.cutoff_day>31||rule.cutoff_day<rule.reopen_day||rule.cutoff_day===rule.reopen_day&&rule.cutoff_time<=rule.reopen_time))throw Error('Tanggal tutup harus setelah jadwal buka.');
 if(rule.sla_minutes!==null&&(!Number.isInteger(rule.sla_minutes)||rule.sla_minutes<1||rule.sla_minutes>525600))throw Error('SLA harus berupa menit lebih dari nol.');
 if(rule.message.length>300)throw Error('Pesan maksimal 300 karakter.');
 return rule;
}
export const departmentReceivingService={
 async list(deptId:string):Promise<DepartmentReceivingRule[]> {
  const {data,error}=await supabase.from('department_receiving_rules').select('dept_id,period_month,enabled,cutoff_day,cutoff_time,reopen_day,reopen_time,sla_minutes,message').eq('dept_id',deptId).order('period_month');if(error)throw error;return data||[];
 },
 async save(rule:DepartmentReceivingRule) {validateReceivingRule(rule);const {error}=await supabase.from('department_receiving_rules').upsert(rule);if(error)throw error;},
 async remove(deptId:string,month:string) {const {error}=await supabase.from('department_receiving_rules').delete().eq('dept_id',deptId).eq('period_month',month);if(error)throw error;},
};
