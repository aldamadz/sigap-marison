import { Link, useSearchParams } from 'react-router';
import { ArrowUpRight, BookOpenText, CalendarDays, History, Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReleaseNoticeArchive } from './ReleaseNoticeArchive';
import { ALL_DOCS, DOCS_CHANGELOG, getDocsEntryPath } from './docsContent';

export function VersionHistoryPanel({ userId }: { userId?: string }) {
  const [params, setParams] = useSearchParams();
  const currentTab = params.get('tab') === 'dokumentasi' ? 'dokumentasi' : 'aplikasi';
  return <Tabs value={currentTab} onValueChange={value => {
    const next = new URLSearchParams(params);
    if (value === 'dokumentasi') next.set('tab', value);
    else next.delete('tab');
    setParams(next);
  }} className="min-w-0 space-y-5">
    <TabsList aria-label="Jenis riwayat" className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-border p-1 sm:w-fit">
      <TabsTrigger value="aplikasi" className="min-h-10 min-w-0 gap-2 whitespace-normal px-2 text-xs sm:px-4 sm:text-sm">
        <Megaphone className="size-4 shrink-0" aria-hidden="true" />Pembaruan aplikasi
      </TabsTrigger>
      <TabsTrigger value="dokumentasi" className="min-h-10 min-w-0 gap-2 whitespace-normal px-2 text-xs sm:px-4 sm:text-sm">
        <BookOpenText className="size-4 shrink-0" aria-hidden="true" />Riwayat dokumentasi
      </TabsTrigger>
    </TabsList>
    <TabsContent value="aplikasi" className="mt-0"><ReleaseNoticeArchive userId={userId} /></TabsContent>
    <TabsContent value="dokumentasi" className="mt-0">
      <section aria-labelledby="docs-history-heading" className="space-y-5">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><History className="size-5" aria-hidden="true" /></span>
          <h2 id="docs-history-heading" className="text-xl font-semibold">Riwayat dokumentasi</h2>
        </div>
        {DOCS_CHANGELOG.map(entry => (
          <article key={entry.version} className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <Badge variant="outline" className="rounded-md border-primary/30 bg-primary/10 text-primary">{entry.version}</Badge>
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />{entry.date}
            </h3>
            <ul className="list-outside list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              {entry.changes.map(change => <li key={change}>{change}</li>)}
            </ul>
            {entry.guides && <nav aria-label={`Panduan ${entry.version}`} className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3">
              {entry.guides.map(id => {
                const guide = ALL_DOCS.find(doc => doc.id === id);
                return guide && <Link key={id} to={getDocsEntryPath(guide)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {guide.title}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                </Link>;
              })}
            </nav>}
          </article>
        ))}
      </section>
    </TabsContent>
  </Tabs>;
}
