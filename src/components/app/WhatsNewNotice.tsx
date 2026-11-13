import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ReleaseNotice } from '@/services/release-notice.service';

export const releaseSessionKey = (userId:string,releaseId:string) => `sigap-release:v1:${userId}:${releaseId}`;
export const releaseIsCurrent = (release:ReleaseNotice,now:number) => {
  const publishedAt=Date.parse(release.publishedAt ?? release.completedAt ?? '');
  return Number.isFinite(publishedAt) && Number.isFinite(Date.parse(release.expiresAt))
    && publishedAt<=now && now<Date.parse(release.expiresAt) && release.items.length>0;
};

export function WhatsNewNotice({userId,release,now}:{userId:string;release:ReleaseNotice;now:number}) {
  const eligible=releaseIsCurrent(release,now);
  const key=releaseSessionKey(userId,release.id);
  const [closed,setClosed]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const savingRef=useRef(false);
  const preference=useQuery({queryKey:['release-notice-preference',userId],enabled:eligible,retry:1,queryFn:async()=>{
    const {data,error}=await supabase.from('release_notice_preferences').select('dismissed_release_id').eq('user_id',userId).maybeSingle();
    if(error)throw error;return data as {dismissed_release_id:string}|null;
  }});
  let sessionClosed=false;try{sessionClosed=sessionStorage.getItem(key)==='1';}catch{/* Keep dismissal usable without browser storage. */}
  const close=()=>{setClosed(key);try{sessionStorage.setItem(key,'1');}catch{/* In-memory fallback. */}};
  const dismiss=async()=>{
    if(savingRef.current)return;savingRef.current=true;setSaving(true);setError('');
    try {
      const {error}=await supabase.rpc('dismiss_release_notice',{p_release_id:release.id});
      if(error)throw error;close();await preference.refetch();
    }catch{setError('Pilihan belum tersimpan. Silakan coba lagi.');}
    finally{savingRef.current=false;setSaving(false);}
  };
  const open=eligible && preference.isSuccess && preference.data?.dismissed_release_id!==release.id && !sessionClosed && closed!==key;
  return <Dialog open={open} onOpenChange={value=>{if(!value&&!saving)close();}}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><Sparkles className="mb-2 h-6 w-6 text-primary" /><DialogTitle>What's New di SIGAP</DialogTitle>
        <DialogDescription>Pembaruan layanan SIGAP.</DialogDescription></DialogHeader>
      <ul className="divide-y">{release.items.map((item,index)=><li key={index} className="whitespace-pre-wrap break-words py-3 text-sm leading-relaxed">{item}</li>)}</ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={()=>{void dismiss();}}>Jangan tampilkan lagi</Button><Button disabled={saving} onClick={close}>Mengerti</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
