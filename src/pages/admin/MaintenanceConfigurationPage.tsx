import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Loader2, Save, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { maintenanceService, maintenanceDate, maintenanceInputDate, type MaintenanceSchedule } from '@/services/maintenance.service';

export default function MaintenanceConfigurationPage() {
  const query=useQuery({queryKey:['maintenance-admin'],queryFn:maintenanceService.admin,retry:false});
  const [draft,setDraft]=useState<MaintenanceSchedule>({category:'update',impact:'disruption',message:'Pembaruan layanan SIGAP. Akses mungkin terganggu sementara.',startsAt:new Date(Date.now()+86400000).toISOString(),duration:2,unit:'hours'});
  const [error,setError]=useState(''),[saving,setSaving]=useState(false),[confirm,setConfirm]=useState<'publish'|'complete'|'cancel'|null>(null);
  const lock=useRef(false);
  useEffect(()=>{if(query.data?.schedule)setDraft(query.data.schedule);},[query.data]);
  const patch=(value:Partial<MaintenanceSchedule>)=>setDraft(previous=>({...previous,...value}));
  const multiplier={minutes:1,hours:60,days:1440}[draft.unit];
  const end=Date.parse(draft.startsAt)+draft.duration*multiplier*60000;
  const active=query.data?.schedule?.status==='published';
  const save=async()=>{
    if(!confirm || lock.current || !query.data)return;
    lock.current=true;setSaving(true);setError('');
    try{await maintenanceService.update({action:confirm,expectedRevision:query.data.revision,...(confirm==='publish'?{schedule:{category:draft.category,impact:draft.impact,message:draft.message,startsAt:draft.startsAt,duration:draft.duration,unit:draft.unit}}:{})});
      setConfirm(null);await query.refetch();toast.success('Pengaturan maintenance disimpan.');
    }catch(e){setError(e instanceof Error?e.message:'Pengaturan belum dapat disimpan.');}finally{lock.current=false;setSaving(false);}
  };
  if(query.isPending)return <div role="status" className="flex items-center gap-2 py-10"><Loader2 className="h-5 w-5 animate-spin" />Memuat jadwal...</div>;
  if(query.isError)return <div role="alert" className="space-y-3 border-y py-6"><p>Pengaturan maintenance belum dapat dimuat.</p><Button variant="outline" onClick={()=>{void query.refetch();}}>Coba lagi</Button></div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3 border-y py-4"><div><h3 className="font-semibold">{active?'Jadwal diterbitkan':'Tidak ada maintenance terjadwal'}</h3>
      {active && <p className="mt-1 text-sm text-muted-foreground">{maintenanceDate(query.data!.schedule!.startsAt)} · {query.data!.schedule!.impact==='full'?'Maintenance penuh':'Potensi gangguan'}</p>}</div>
      {active && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setError('');setConfirm('cancel');}}><XCircle className="h-4 w-4" />Batalkan jadwal</Button><Button variant="outline" onClick={()=>{setError('');setConfirm('complete');}}><CheckCircle2 className="h-4 w-4" />Selesai, buka layanan</Button></div>}
    </div>
    <form className="max-w-3xl space-y-5" onSubmit={e=>{e.preventDefault();setError('');setConfirm('publish');}}>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Jenis kegiatan</Label><Select value={draft.category} onValueChange={category=>patch({category:category as MaintenanceSchedule['category']})}><SelectTrigger aria-label="Jenis kegiatan"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="repair">Perbaikan</SelectItem><SelectItem value="development">Pengembangan</SelectItem><SelectItem value="update">Pembaruan</SelectItem></SelectContent></Select></div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Dampak layanan</legend><div className="flex min-h-10 flex-wrap gap-4 text-sm">{(['disruption','full'] as const).map(impact=><label key={impact} className="flex items-center gap-2"><input type="radio" name="impact" value={impact} checked={draft.impact===impact} onChange={()=>patch({impact})} />{impact==='full'?'Maintenance penuh':'Potensi gangguan'}</label>)}</div></fieldset></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="maintenance-start">Mulai (WIB)</Label><Input id="maintenance-start" type="datetime-local" required value={maintenanceInputDate(Date.parse(draft.startsAt))} onChange={e=>{if(e.target.value)patch({startsAt:new Date(`${e.target.value}+07:00`).toISOString()});}} /></div>
        <div className="space-y-2"><Label htmlFor="maintenance-duration">Estimasi durasi</Label><div className="flex gap-2"><Input id="maintenance-duration" type="number" required min={1} max={43200} step={1} value={draft.duration} onChange={e=>patch({duration:Number(e.target.value)})} /><Select value={draft.unit} onValueChange={unit=>patch({unit:unit as MaintenanceSchedule['unit']})}><SelectTrigger className="w-32 shrink-0" aria-label="Satuan durasi"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="minutes">Menit</SelectItem><SelectItem value="hours">Jam</SelectItem><SelectItem value="days">Hari</SelectItem></SelectContent></Select></div></div></div>
      <div className="space-y-2"><Label htmlFor="maintenance-message">Pesan untuk pengguna</Label><Textarea id="maintenance-message" required minLength={5} maxLength={1000} rows={4} value={draft.message} onChange={e=>patch({message:e.target.value})} /></div>
      <section aria-label="Pratinjau pemberitahuan" className="space-y-3 border-y py-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4" />Pratinjau pemberitahuan</h3><p className="whitespace-pre-wrap break-words text-sm">{draft.message}</p>
        <p className="text-sm">{maintenanceDate(draft.startsAt)}{Number.isFinite(end) && <> sampai {maintenanceDate(new Date(end).toISOString())}</>}</p>
        <p className="text-sm text-muted-foreground">{draft.impact==='full'?'Akses pengguna ditutup otomatis pada waktu mulai. Layanan dibuka kembali setelah admin menyatakan selesai.':'SIGAP tetap dapat digunakan; akses mungkin melambat atau terganggu sementara.'}</p></section>
      <Button type="submit" disabled={saving}><Save className="h-4 w-4" />{active?'Perbarui jadwal':'Terbitkan jadwal'}</Button>
    </form>
    {!!query.data?.history?.length && <section className="space-y-3 border-t pt-5"><h3 className="text-sm font-semibold">Riwayat perubahan</h3><ul className="divide-y text-sm">{query.data.history.map(item=><li key={item.revision} className="py-3"><span className="font-medium">Versi {item.revision} · {item.action==='publish'?'Jadwal diterbitkan':item.action==='cancel'?'Dibatalkan':'Selesai'}</span><div className="mt-1 text-muted-foreground">{maintenanceDate(item.at)}</div></li>)}</ul></section>}
    <Dialog open={confirm!==null} onOpenChange={open=>{if(!open&&!saving)setConfirm(null);}}><DialogContent><DialogHeader><DialogTitle>{confirm==='publish'?'Terbitkan pemberitahuan?':confirm==='complete'?'Akhiri maintenance?':'Batalkan jadwal?'}</DialogTitle><DialogDescription>{confirm==='publish'?'Pemberitahuan dimulai sehari sebelumnya pukul 00.00 WIB. Perubahan jadwal akan diberitahukan kembali.':confirm==='complete'?'Pastikan layanan sudah diperiksa dan siap digunakan kembali.':'Pemberitahuan dan penutupan terjadwal tidak akan dilanjutkan.'}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={saving} onClick={()=>setConfirm(null)}>Kembali</Button><Button disabled={saving} onClick={()=>{void save();}}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{confirm==='publish'?'Terbitkan':confirm==='complete'?'Selesai, buka layanan':'Batalkan jadwal'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
