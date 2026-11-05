import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {BellRing,Save} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {BrowserNotificationButton} from './BrowserNotificationButton';

const defaults={team_notifications:true,team_push:false,calendar_reminders:true,calendar_push:true};
export function NotificationPreferences({userId}:{userId:string}) {
 const [form,setForm]=useState(defaults),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const query=useQuery({queryKey:['notification-preferences',userId],enabled:!!userId,queryFn:async()=>{
  const {data,error}=await supabase.from('notification_preferences').select('team_notifications,team_push,calendar_reminders,calendar_push').eq('user_id',userId).maybeSingle();
  if(error)throw error;return {...defaults,...data};
 }});
 useEffect(()=>{if(query.data)setForm(query.data);},[query.data]);
 const save=async()=>{
  if(saving)return;setSaving(true);setMessage('');
  try{const {error}=await supabase.from('notification_preferences').upsert({user_id:userId,...form});if(error)throw error;await query.refetch();setMessage('Pengaturan notifikasi tersimpan.');}
  catch{setMessage('Pengaturan belum dapat disimpan. Coba lagi.');}finally{setSaving(false);}
 };
 return <section className="space-y-5 border-y py-5"><h2 className="flex items-center gap-2 text-lg font-semibold"><BellRing className="h-5 w-5"/>Notifikasi</h2><BrowserNotificationButton/>
  {query.isError?<div role="alert" className="space-y-2 text-sm"><p>Pengaturan notifikasi belum dapat dimuat.</p><Button variant="outline" onClick={()=>{void query.refetch();}}>Coba lagi</Button></div>:<>
   <div className="max-w-2xl divide-y">{([
    ['team_notifications','Ringkasan pengajuan departemen / kantor'],['team_push','Popup browser untuk ringkasan tim'],
    ['calendar_reminders','Reminder jadwal, tenggat, dan hasil kalender'],['calendar_push','Popup browser untuk reminder kalender'],
   ] as const).map(([key,label])=><label key={key} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{label}</span><Switch aria-label={label} checked={form[key]} disabled={saving||query.isPending} onCheckedChange={value=>setForm(previous=>({...previous,[key]:value}))}/></label>)}</div>
   <Button type="button" disabled={saving||query.isPending} onClick={()=>{void save();}}><Save className="h-4 w-4"/>{saving?'Menyimpan...':'Simpan notifikasi'}</Button>
  </>}{message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
