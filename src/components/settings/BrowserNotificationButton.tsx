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
   if(!result.enabled)setMessage(result.reason==='permission_not_granted'?'Izin notifikasi browser belum diberikan.':result.reason==='server_not_configured'?'Notifikasi browser belum dikonfigurasi di server.':'Browser ini belum mendukung notifikasi.');
  }catch{setMessage('Notifikasi browser belum dapat diaktifkan. Coba lagi.');}finally{setBusy(false);}
 };
 return <div className="space-y-2"><Button type="button" variant="outline" size="sm" className="max-w-full whitespace-normal" disabled={busy||enabled} onClick={()=>{void activate();}}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<BellRing className="h-4 w-4"/>}{enabled?'Notifikasi browser aktif':'Aktifkan notifikasi browser'}</Button>{message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}</div>;
}
