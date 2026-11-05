import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { isNotificationUuid, resolveNotificationTarget } from '@/lib/notification-target';
import { suratInboxApi } from '@/features/surat/inbox/services/surat-inbox-api';

export default function NotificationOpenPage() {
  const [params]=useSearchParams(),navigate=useNavigate(),id=params.get('id');
  const query=useQuery({queryKey:['notification-target',id],retry:false,gcTime:0,staleTime:0,refetchOnMount:'always',enabled:isNotificationUuid(id),queryFn:async()=>{
    const {data:{user},error:authError}=await supabase.auth.getUser();if(authError || !user)throw Error('Sesi tidak tersedia.');
    const {data,error}=await supabase.from('notifications').select('id,user_id,link,data').eq('id',id).eq('user_id',user.id).maybeSingle();
    if(error)throw error;if(!data)return null;
    const destination=await resolveNotificationTarget(data,suratInboxApi.getMyInboxDetail);
    if(destination)await supabase.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id);
    return destination;
  }});
  useEffect(()=>{if(!query.isFetching&&!query.isError&&query.data)navigate(query.data,{replace:true});},[query.data,query.isFetching,query.isError,navigate]);
  if(query.isFetching || !query.isError&&query.data)return <div role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />Membuka pengajuan...</div>;
  return <section className="space-y-4 border-y py-8"><h1 className="text-xl font-semibold">Notifikasi tidak tersedia</h1><p className="text-sm text-muted-foreground">Tugas mungkin sudah berubah, dihapus, atau tidak tersedia untuk akun ini.</p>
    <div className="flex flex-wrap gap-2">{query.isError && <Button variant="outline" onClick={()=>{void query.refetch();}}>Coba lagi</Button>}<Button asChild variant="outline"><Link to="/surat/monitoring">Status Pengajuan</Link></Button></div></section>;
}
