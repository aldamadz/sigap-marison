import {useCallback,useEffect,useRef,useState} from 'react';
import {BellRing,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {pushService,type PushActivationResult} from '@/services/push.service';

export function BrowserNotificationButton() {
 const [busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[message,setMessage]=useState('');
 const [checking,setChecking]=useState(true);
 const generation=useRef(0),pending=useRef(false);
 const applyResult=useCallback((result:PushActivationResult,explicit=false)=>{
   setEnabled(result.enabled);setMessage('');
   if(result.enabled===false && result.reason!=='not_subscribed' && (explicit||result.reason!=='permission_not_granted')){
    const summary=result.reason==='permission_denied'?'Notifikasi diblokir di browser. Ubah izin notifikasi situs menjadi Izinkan.':result.reason==='permission_not_granted'?'Izin notifikasi browser belum diberikan.':result.reason==='server_not_configured'?'Notifikasi browser belum dikonfigurasi di server.':result.reason==='worker_not_ready'?'Layanan notifikasi browser belum siap. Muat ulang halaman, lalu coba lagi.':result.reason==='provider_unavailable'?'Layanan push browser tidak dapat dihubungi. Coba melalui Chrome atau Edge, lalu periksa koneksi Anda.':result.reason==='activation_failed'?'Notifikasi browser belum dapat diaktifkan. Coba lagi.':'Browser ini belum mendukung notifikasi.';
    const details=result.details;
    const context=details?.serverCode==='push_provider_unsupported'?' Penyedia push browser ini belum didukung. Gunakan Chrome, Edge, Firefox, atau Safari yang mendukung Web Push.':details?.serverCode==='push_keys_missing'?' Data langganan dari browser belum lengkap. Periksa izin notifikasi, lalu coba lagi.':'';
    setMessage((result.reason==='subscription_outdated'?'Langganan notifikasi perlu diperbarui. Aktifkan kembali notifikasi browser.':summary)+context+(details?` Tahap: ${details.stage}; kode: ${details.serverCode??details.code}${details.httpStatus!==undefined?`; HTTP: ${details.httpStatus}`:''}${details.requestId?`; ID: ${details.requestId}`:''}.`:''));
   }
 },[]);
 useEffect(()=>{
  let live=true,refreshPending=false;
  const refresh=async()=>{
   if(pending.current||refreshPending)return;
   refreshPending=true;
   const version=++generation.current;
   try{const result=await pushService.getSubscriptionStatus();if(live&&version===generation.current)applyResult(result);}
   catch{if(live&&version===generation.current){setEnabled(false);setMessage('Status notifikasi browser belum dapat diperiksa. Coba aktifkan kembali.');}}
   finally{refreshPending=false;if(live&&version===generation.current)setChecking(false);}
  };
  const onFocus=()=>{if(document.visibilityState!=='hidden')void refresh();};
  const onActivation=(event:Event)=>{
   const result=(event as CustomEvent<PushActivationResult>).detail;
   if(!result||typeof result.enabled!=='boolean')return;
   ++generation.current;applyResult(result);setChecking(false);
  };
  window.addEventListener('sigap:push-activation',onActivation);
  void refresh();window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
  return()=>{live=false;window.removeEventListener('sigap:push-activation',onActivation);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
 },[applyResult]);
 const activate=async()=>{
  if(pending.current)return;pending.current=true;++generation.current;setBusy(true);setMessage('');
  try{
   applyResult(await pushService.ensureSubscription({requestPermission:true}),true);
  }catch{setEnabled(false);setMessage('Notifikasi browser belum dapat diaktifkan. Coba lagi.');}finally{pending.current=false;setChecking(false);setBusy(false);}
 };
 return <div className="max-w-lg space-y-2"><Button type="button" variant="outline" size="sm" className="max-w-full whitespace-normal" disabled={checking||busy||enabled} onClick={()=>{void activate();}}>{busy||checking?<Loader2 className="h-4 w-4 animate-spin"/>:<BellRing className="h-4 w-4"/>}{checking?'Memeriksa notifikasi...':busy?'Mengaktifkan...':enabled?'Notifikasi browser aktif':'Aktifkan notifikasi browser'}</Button>{message&&<p role="status" className="break-words text-xs text-muted-foreground">{message}</p>}</div>;
}
