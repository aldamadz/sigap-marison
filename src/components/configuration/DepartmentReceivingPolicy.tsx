import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CalendarDays,Loader2,Save,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Switch} from '@/components/ui/switch';
import {Textarea} from '@/components/ui/textarea';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {useAppDialog} from '@/components/app/AppDialogProvider';
import {departmentReceivingService,defaultReceivingRule,regularReceivingMonth} from '@/services/department-receiving.service';
import {todayWorkDate} from '@/features/work-calendar/lib/work-calendar-date';
export function DepartmentReceivingPolicy({deptId}:{deptId:string}) {
 const [mode,setMode]=useState('regular'),[month,setMonth]=useState(()=>todayWorkDate().slice(0,7));
 const period=mode==='regular'?regularReceivingMonth:`${month}-01`;
 const [form,setForm]=useState({...defaultReceivingRule}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const dialog=useAppDialog();
 const query=useQuery({queryKey:['department-receiving-rules',deptId],queryFn:()=>departmentReceivingService.list(deptId)});
 const existing=query.data?.find(row=>row.period_month===period);
 useEffect(()=>{setForm(existing?{...existing,cutoff_time:existing.cutoff_time.slice(0,5),reopen_time:existing.reopen_time.slice(0,5)}:{...defaultReceivingRule});setMessage('');},[existing,period,deptId]);
 const save=async()=>{if(busy)return;setBusy(true);setMessage('');try{await departmentReceivingService.save({...form,dept_id:deptId,period_month:period});await query.refetch();setMessage('Aturan penerimaan tersimpan. Pengajuan yang sudah berjalan tidak berubah.');}catch(error){setMessage(error instanceof Error?error.message:'Aturan belum dapat disimpan.');}finally{setBusy(false);}};
 const remove=async()=>{if(!existing||busy)return;if(!await dialog.confirm({title:'Hapus pengecualian bulan ini?',description:'Aturan bulanan umum akan digunakan kembali. Pengajuan yang sudah berjalan tetap menggunakan aturan semula.',confirmText:'Hapus pengecualian'}))return;setBusy(true);try{await departmentReceivingService.remove(deptId,period);await query.refetch();setMessage('Pengecualian dihapus.');}catch{setMessage('Pengecualian belum dapat dihapus.');}finally{setBusy(false);}};
 const field=(key:keyof typeof defaultReceivingRule,value:unknown)=>setForm(previous=>({...previous,[key]:value}));
 return <section className="space-y-4 border-t pt-5"><h2 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="h-5 w-5"/>Periode penerimaan</h2>
  <Tabs value={mode} onValueChange={setMode}><TabsList className="max-w-full"><TabsTrigger value="regular">Aturan bulanan</TabsTrigger><TabsTrigger value="monthly">Bulan tertentu</TabsTrigger></TabsList></Tabs>
  {mode==='monthly'&&<label className="block max-w-xs space-y-2 text-sm"><span>Bulan</span><Input aria-label="Bulan pengecualian" type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>}
  {query.isError?<div role="alert" className="space-y-2 text-sm"><p>Aturan penerimaan belum dapat dimuat.</p><Button variant="outline" onClick={()=>{void query.refetch();}}>Coba lagi</Button></div>:<>
   <label className="flex max-w-xl items-center justify-between gap-3 text-sm"><span>Gunakan batas penerimaan</span><Switch checked={form.enabled} disabled={busy||query.isPending} onCheckedChange={value=>field('enabled',value)} aria-label="Gunakan batas penerimaan"/></label>
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <label className="space-y-2 text-sm"><span>Tanggal tutup tiap bulan</span><Input type="number" min="1" max="31" placeholder="Tanpa batas" value={form.cutoff_day??''} disabled={!form.enabled||busy} onChange={event=>field('cutoff_day',event.target.value?Number(event.target.value):null)}/></label>
    <label className="space-y-2 text-sm"><span>Jam tutup</span><Input type="time" value={form.cutoff_time} disabled={!form.enabled||busy} onChange={event=>field('cutoff_time',event.target.value)}/></label>
    <label className="space-y-2 text-sm"><span>Tanggal buka kembali</span><Input type="number" min="1" max="28" value={form.reopen_day} disabled={!form.enabled||busy} onChange={event=>field('reopen_day',Number(event.target.value))}/></label>
    <label className="space-y-2 text-sm"><span>Jam buka kembali</span><Input type="time" value={form.reopen_time} disabled={!form.enabled||busy} onChange={event=>field('reopen_time',event.target.value)}/></label>
   </div>
   <label className="block max-w-xs space-y-2 text-sm"><span>SLA pengerjaan (menit kerja)</span><Input type="number" min="1" max="525600" placeholder="Ikuti SLA departemen" value={form.sla_minutes??''} disabled={busy} onChange={event=>field('sla_minutes',event.target.value?Number(event.target.value):null)}/></label>
   <label className="block space-y-2 text-sm"><span>Pesan untuk pemohon</span><Textarea maxLength={300} value={form.message} disabled={busy} onChange={event=>field('message',event.target.value)}/></label>
   <div className="flex flex-wrap gap-2"><Button onClick={()=>{void save();}} disabled={busy||query.isPending||mode==='monthly'&&!month}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Simpan periode</Button>{mode==='monthly'&&existing&&<Button variant="outline" disabled={busy} onClick={()=>{void remove();}}><Trash2 className="h-4 w-4"/>Hapus pengecualian</Button>}</div>
  </>}{message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
