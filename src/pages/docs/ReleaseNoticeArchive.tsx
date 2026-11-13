import { useQuery } from '@tanstack/react-query';
import { releaseNoticeService } from '@/services/release-notice.service';
import { ReleaseNoticeContent } from '@/components/app/ReleaseNoticeContent';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';

const publishedDate = (value: string) => new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

export function ReleaseNoticeArchive({ userId }: { userId?: string }) {
  const query = useQuery({ queryKey: ['release-notice-history', userId], queryFn: releaseNoticeService.history,
    enabled: !!userId, staleTime: 30000, retry: 1 });
  return <section aria-labelledby="release-history-heading" className="border-b border-border pb-6">
    <h1 id="release-history-heading" className="text-xl font-semibold">Pembaruan SIGAP</h1>
    {!userId ? <p className="mt-3 text-sm text-muted-foreground">Masuk ke SIGAP untuk melihat pengumuman pembaruan.</p>
      : query.isPending ? <p role="status" className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Memuat pembaruan...</p>
        : query.isError ? <div role="alert" className="mt-4 space-y-3"><p className="text-sm">Riwayat pembaruan belum dapat dimuat.</p><Button variant="outline" onClick={()=>{void query.refetch();}}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div>
          : !query.data?.releases.length ? <p className="mt-3 text-sm text-muted-foreground">Belum ada pengumuman pembaruan.</p>
            : <div className="mt-4 divide-y divide-border">{query.data.releases.map(release => <article key={release.id} className="space-y-3 py-5 first:pt-0">
              <h2 className="text-sm font-semibold"><time dateTime={release.publishedAt}>{publishedDate(release.publishedAt!)}</time></h2>
              <ReleaseNoticeContent items={release.items} />
            </article>)}</div>}
  </section>;
}
