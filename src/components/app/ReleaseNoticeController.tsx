import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { releaseNoticeService } from '@/services/release-notice.service';
import { WhatsNewNotice } from './WhatsNewNotice';

export function ReleaseNoticeController({ userId }: { userId: string }) {
  const { pathname } = useLocation();
  const [clock, setClock] = useState(Date.now());
  const query = useQuery({ queryKey: ['release-notice', userId], queryFn: releaseNoticeService.current,
    refetchInterval: 60000, refetchOnWindowFocus: true, staleTime: 30000, retry: 1 });
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const data = query.data;
  if (!data?.release || ['/maintenance-admin', '/admin/configuration/maintenance', '/admin/configuration/whats-new', '/docs/versi/changelog'].includes(pathname)) return null;
  const serverTime = Date.parse(data.serverNow);
  const now = Number.isFinite(serverTime) ? serverTime + Math.max(0, clock - query.dataUpdatedAt) : clock;
  return <WhatsNewNotice key={`${userId}:${data.release.id}`} userId={userId} release={data.release} now={now} />;
}
