import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { maintenanceService, maintenanceDate, maintenanceLabels, noticeDismissalKey, maintenanceDay } from '@/services/maintenance.service';

export function MaintenanceNotice({userId}:{userId:string}) {
  const location=useLocation();
  const [closedKey,setClosedKey]=useState('');
  const [checked,setChecked]=useState(false);
  const [clock,setClock]=useState(Date.now());
  const query=useQuery({queryKey:['maintenance-status',userId],queryFn:maintenanceService.status,refetchInterval:30000,refetchOnWindowFocus:true,retry:1});
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const data=query.data,schedule=data?.schedule;
  const effectiveNow=data?.serverNow ? Date.parse(data.serverNow)+Math.max(0,clock-query.dataUpdatedAt):clock;
  const noticeDay=maintenanceDay(effectiveNow);
  useEffect(()=>{setChecked(false);},[data?.revision,userId,noticeDay]);
  const isFull=!!schedule && schedule.status==='published' && schedule.impact==='full' && effectiveNow>=Date.parse(schedule.startsAt);
  const [adminAccess,setAdminAccess]=useState<boolean|null>(null);
  useEffect(()=>{
    if(!isFull){setAdminAccess(null);return;}
    let cancelled=false;
    fetch('/api/maintenance/access',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!cancelled)setAdminAccess(r.status===200);}).catch(()=>{if(!cancelled)setAdminAccess(false);});
    return()=>{cancelled=true;};
  },[isFull,userId]);
  if(!data || !schedule || schedule.status!=='published')return null;
  const announceAt=Date.parse(`${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(schedule.startsAt))}T00:00:00+07:00`)-86400000;
  const visible=effectiveNow>=announceAt && (schedule.impact==='full' || effectiveNow<Date.parse(schedule.endsAt!));
  if(!visible)return null;
  const key=noticeDismissalKey(userId,data,effectiveNow);
  let hidden=false;try{hidden=localStorage.getItem(key)==='1';}catch{/* Storage may be disabled; dismissal remains session-only. */}
  const close=()=>{if(checked)try{localStorage.setItem(key,'1');}catch{/* Keep the modal dismissible even if storage is unavailable. */}setClosedKey(key);setChecked(false);};
  const title=isFull?'SIGAP sedang dalam pemeliharaan':effectiveNow>=Date.parse(schedule.startsAt)?'Pembaruan sedang berlangsung':'Pemberitahuan pemeliharaan SIGAP';
  if(isFull && adminAccess===false)return <div role="alert" className="fixed inset-0 z-[200] overflow-y-auto bg-background p-6 text-foreground"><main className="mx-auto max-w-3xl py-8">
    <img src="/.sigap-maintenance/logo.png" alt="Marison Regency Group" className="mb-6 h-16 w-40 object-contain" />
    <h1 className="mb-4 text-2xl font-semibold">{title}</h1><p className="whitespace-pre-wrap break-words">{schedule.message}</p>
    <p className="mt-6">Perkiraan selesai: {maintenanceDate(schedule.endsAt!)}</p>
    {effectiveNow>Date.parse(schedule.endsAt!) && <p className="mt-2 text-muted-foreground">Pemeliharaan masih berlangsung. Estimasi sedang diperbarui.</p>}
    <Button className="mt-6" onClick={()=>window.location.reload()}>Periksa kembali</Button>
  </main></div>;
  return <>
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <span className="flex min-w-0 items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{schedule.impact==='full'?'Maintenance':'Potensi gangguan'} · {maintenanceDate(schedule.startsAt)}</span></span>
      <Button variant="ghost" size="sm" onClick={()=>{setClosedKey('');try{localStorage.removeItem(key);}catch{/* Session fallback. */}}}>Lihat pemberitahuan</Button>
    </div>
    <Dialog open={!hidden && closedKey!==key && !location.pathname.startsWith('/admin/configuration/maintenance')} onOpenChange={open=>{if(!open)close();}}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><CalendarClock className="mb-2 h-6 w-6 text-primary" /><DialogTitle>{title}</DialogTitle>
        <DialogDescription>{maintenanceLabels[schedule.category]} · {schedule.impact==='full'?'Layanan tidak dapat digunakan sementara':'SIGAP tetap dapat digunakan; akses mungkin terganggu sementara'}</DialogDescription></DialogHeader>
        <p className="whitespace-pre-wrap break-words text-sm">{schedule.message}</p>
        <dl className="space-y-3 border-y py-4 text-sm"><div><dt className="text-muted-foreground">Mulai</dt><dd className="font-medium">{maintenanceDate(schedule.startsAt)}</dd></div>
          <div><dt className="text-muted-foreground">Perkiraan selesai</dt><dd className="font-medium">{maintenanceDate(schedule.endsAt!)}</dd></div></dl>
        <label className="flex items-center gap-3 text-sm"><Checkbox checked={checked} onCheckedChange={v=>setChecked(v===true)} />Jangan tampilkan lagi hari ini</label>
        <DialogFooter><Button onClick={close}>Mengerti</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
