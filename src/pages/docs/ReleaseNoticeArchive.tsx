import { useQuery } from '@tanstack/react-query';
import { releaseNoticeService } from '@/services/release-notice.service';
import { ReleaseNoticeContent } from '@/components/app/ReleaseNoticeContent';
import { Button } from '@/components/ui/button';
import { CalendarDays, Loader2, Megaphone, RefreshCw } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { badgeVariants } from '@/components/ui/badge';
import { APP_RELEASES, APP_RELEASE_CHANGE_LABELS, findAppReleaseForAnnouncement } from '@/lib/app-releases';
import { cn } from '@/lib/utils';
import { VersionHistoryPagination, VersionHistoryRow } from './VersionHistoryList';
import { useVersionHistoryPage } from './use-version-history-page';

const dateFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' });
const timeFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', timeStyle: 'short' });

export function ReleaseNoticeArchive({ userId }: { userId?: string }) {
  const query = useQuery({ queryKey: ['release-notice-history', userId], queryFn: releaseNoticeService.history,
    enabled: !!userId, staleTime: 30000, retry: 1 });
  const notices = userId ? query.data?.releases ?? [] : [];
  const announcements = notices.filter(release => !findAppReleaseForAnnouncement(release.id, release.items[0]));
  const { page, pageCount, start, end, goToPage } = useVersionHistoryPage(APP_RELEASES.length + announcements.length);
  const visibleAnnouncements = announcements.slice(Math.max(0, start - APP_RELEASES.length), Math.max(0, end - APP_RELEASES.length));

  return <section aria-labelledby="release-history-heading" className="space-y-5">
    <div className="flex items-center gap-3 border-b border-border pb-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Megaphone className="size-5" aria-hidden="true" /></span>
      <h2 id="release-history-heading" className="text-xl font-semibold">Pembaruan SIGAP</h2>
    </div>
    <Accordion key={JSON.stringify([userId, page])} type="single" collapsible className="space-y-2">
      {APP_RELEASES.slice(start, end).map(release => {
        const notice = notices.find(item => findAppReleaseForAnnouncement(item.id, item.items[0]) === release);
        const latest = release === APP_RELEASES[0];
        return <VersionHistoryRow key={release.version} value={`version:${release.version}`} latest={latest} summary={<>
            <span className="font-semibold tabular-nums text-primary">Versi {release.version}</span>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
              <time dateTime={release.releasedOn}>{dateFormat.format(new Date(`${release.releasedOn}T00:00:00+07:00`))}</time>
            </span>
            {latest && <span className={cn(badgeVariants({ variant: 'outline' }), 'border-primary/30 bg-primary/10 text-primary')}>Terbaru</span>}
          </>}>
          <div className="space-y-4">
            {release.changes.map(change => <div key={change.kind} className="space-y-2">
              <h4 className="text-sm font-semibold">{APP_RELEASE_CHANGE_LABELS[change.kind]}</h4>
              <ul className="list-outside list-disc space-y-1.5 break-words pl-5 text-sm leading-relaxed [overflow-wrap:anywhere]">
                {change.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>)}
          </div>
          {notice && <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">Lihat pengumuman What's New</summary>
            <div className="mt-3"><ReleaseNoticeContent items={notice.items} /></div>
          </details>}
        </VersionHistoryRow>;
      })}
      {(visibleAnnouncements.length > 0 || announcements.length === 0) && <h3 className="border-t border-border pt-4 text-base font-semibold">Arsip pengumuman</h3>}
      {!userId ? <p className="text-sm text-muted-foreground">Masuk ke SIGAP untuk melihat pengumuman pembaruan.</p>
        : query.isPending ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Memuat pembaruan...</p>
          : query.isError && !query.data ? <div role="alert" className="space-y-3"><p className="text-sm">Riwayat pembaruan belum dapat dimuat.</p><Button variant="outline" onClick={()=>{void query.refetch();}}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div>
            : !announcements.length ? <p className="text-sm text-muted-foreground">Belum ada pengumuman lain.</p>
              : visibleAnnouncements.map(release => {
                const published = new Date(release.publishedAt ?? '');
                const hasDate = !Number.isNaN(published.getTime());
                const [first, ...rest] = release.items;
                const items = /^pembaruan sigap$/iu.test(first?.trim() ?? '') ? rest : release.items;
                return <VersionHistoryRow key={release.id} value={`notice:${release.id}`} summary={<>
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {hasDate ? <time dateTime={release.publishedAt}>{dateFormat.format(published)}</time> : 'Pembaruan aplikasi'}
                  </span>
                  {hasDate && <span className="text-xs text-muted-foreground">{timeFormat.format(published)} WIB</span>}
                </>}>
                  <ReleaseNoticeContent items={items.length ? items : release.items} />
                </VersionHistoryRow>;
              })}
    </Accordion>
    <VersionHistoryPagination label="Halaman pembaruan aplikasi" page={page} pageCount={pageCount} goToPage={goToPage} />
  </section>;
}
