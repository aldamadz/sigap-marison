import { useQuery } from '@tanstack/react-query';
import { releaseNoticeService } from '@/services/release-notice.service';
import { ReleaseNoticeContent } from '@/components/app/ReleaseNoticeContent';
import { Button } from '@/components/ui/button';
import { CalendarDays, CircleDot, Loader2, Megaphone, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const dateFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' });
const timeFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', timeStyle: 'short' });

export function ReleaseNoticeArchive({ userId }: { userId?: string }) {
  const query = useQuery({ queryKey: ['release-notice-history', userId], queryFn: releaseNoticeService.history,
    enabled: !!userId, staleTime: 30000, retry: 1 });
  return <section aria-labelledby="release-history-heading" className="space-y-5">
    <div className="flex items-center gap-3 border-b border-border pb-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Megaphone className="size-5" aria-hidden="true" /></span>
      <h2 id="release-history-heading" className="text-xl font-semibold">Pembaruan SIGAP</h2>
    </div>
    {!userId ? <p className="text-sm text-muted-foreground">Masuk ke SIGAP untuk melihat pengumuman pembaruan.</p>
      : query.isPending ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Memuat pembaruan...</p>
        : query.isError && !query.data ? <div role="alert" className="space-y-3"><p className="text-sm">Riwayat pembaruan belum dapat dimuat.</p><Button variant="outline" onClick={()=>{void query.refetch();}}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div>
          : !query.data?.releases.length ? <p className="text-sm text-muted-foreground">Belum ada pengumuman pembaruan.</p>
            : <div className="relative space-y-4 sm:ml-4 sm:border-l sm:border-border sm:pl-6">
              {query.data.releases.map((release, index) => {
                const published = new Date(release.publishedAt ?? '');
                const hasDate = !Number.isNaN(published.getTime());
                const [first, ...rest] = release.items;
                const items = /^pembaruan sigap$/iu.test(first?.trim() ?? '') ? rest : release.items;
                return <article key={release.id}
                  className={`relative min-w-0 rounded-lg border bg-card p-4 sm:p-5 ${index === 0 ? 'border-primary/45' : 'border-border'}`}>
                  <CircleDot aria-hidden="true" className={`absolute -left-[33px] top-5 hidden size-4 bg-background sm:block ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3">
                    <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold">
                      <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {hasDate ? <time dateTime={release.publishedAt}>{dateFormat.format(published)}</time> : 'Pembaruan aplikasi'}
                    </h3>
                    {hasDate && <span className="text-xs text-muted-foreground">{timeFormat.format(published)} WIB</span>}
                    {index === 0 && <Badge variant="outline" className="rounded-md border-primary/30 bg-primary/10 text-primary">Terbaru</Badge>}
                  </div>
                  <ReleaseNoticeContent items={items.length ? items : release.items} />
                </article>;
              })}
            </div>}
  </section>;
}
