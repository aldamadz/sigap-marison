import {useState} from 'react';
import {BellRing,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {pushService} from '@/services/push.service';

export function BrowserNotificationButton() {
 const [busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[message,setMessage]=useState('');
 const activate=async()=>{
  if(busy)return;setBusy(true);setMessage('');
  try{
   const result=await pushService.ensureSubscription({requestPermission:true});setEnabled(result.enabled);
   if(result.enabled===false){
    const summary=result.reason==='permission_not_granted'?'Izin notifikasi browser belum diberikan.':result.reason==='server_not_configured'?'Notifikasi browser belum dikonfigurasi di server.':result.reason==='worker_not_ready'?'Layanan notifikasi browser belum siap. Muat ulang halaman, lalu coba lagi.':result.reason==='provider_unavailable'?'Layanan push browser tidak dapat dihubungi. Coba melalui Chrome atau Edge, lalu periksa koneksi Anda.':result.reason==='activation_failed'?'Notifikasi browser belum dapat diaktifkan. Coba lagi.':'Browser ini belum mendukung notifikasi.';
    const details=result.details;
    setMessage(summary+(details?` Tahap: ${details.stage}; kode: ${details.code}${details.httpStatus!==undefined?`; HTTP: ${details.httpStatus}`:''}${details.requestId?`; ID: ${details.requestId}`:''}.`:''));
   }
  }catch{setMessage('Notifikasi browser belum dapat diaktifkan. Coba lagi.');}finally{setBusy(false);}
 };
 return <div className="space-y-2"><Button type="button" variant="outline" size="sm" className="max-w-full whitespace-normal" disabled={busy||enabled} onClick={()=>{void activate();}}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<BellRing className="h-4 w-4"/>}{enabled?'Notifikasi browser aktif':'Aktifkan notifikasi browser'}</Button>{message&&<p role="status" className="break-all text-xs text-muted-foreground">{message}</p>}</div>;
}
