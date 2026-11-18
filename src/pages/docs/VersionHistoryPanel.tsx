import { Link, useSearchParams } from 'react-router';
import { ArrowUpRight, BookOpenText, CalendarDays, ChevronLeft, ChevronRight, History, Megaphone } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ReleaseNoticeArchive } from './ReleaseNoticeArchive';
import { ALL_DOCS, DOCS_CHANGELOG, getDocsEntryPath } from './docsContent';

const DOCS_PAGE_SIZE = 5;
const DOCS_PAGE_COUNT = Math.max(1, Math.ceil(DOCS_CHANGELOG.length / DOCS_PAGE_SIZE));

export function VersionHistoryPanel({ userId }: { userId?: string }) {
  const [params, setParams] = useSearchParams();
  const currentTab = params.get('tab') === 'dokumentasi' ? 'dokumentasi' : 'aplikasi';
  const requestedPage = params.get('page') ?? '';
  const page = /^[1-9]\d*$/.test(requestedPage) ? Math.min(Number(requestedPage), DOCS_PAGE_COUNT) : 1;
  const entries = DOCS_CHANGELOG.slice((page - 1) * DOCS_PAGE_SIZE, page * DOCS_PAGE_SIZE);
  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
  };

  return <Tabs value={currentTab} onValueChange={value => {
    const next = new URLSearchParams(params);
    if (value === 'dokumentasi') next.set('tab', value);
    else next.delete('tab');
    next.delete('page');
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
        <Accordion key={page} type="single" collapsible className="space-y-2">
          {entries.map(entry => (
            <AccordionItem key={entry.version} value={entry.version} className="min-w-0 rounded-lg border border-border bg-card">
              <AccordionTrigger className="min-h-12 min-w-0 gap-3 rounded-lg px-4 py-3 text-left text-sm hover:bg-muted/50 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&>svg]:text-muted-foreground">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn(badgeVariants({ variant: 'outline' }), 'border-primary/30 bg-primary/10 text-primary')}>{entry.version}</span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <CalendarDays className="size-4 shrink-0" aria-hidden="true" />{entry.date}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 border-t border-border px-4 pt-3">
                <ul className="list-outside list-disc space-y-2 break-words pl-5 text-sm leading-6 text-muted-foreground">
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
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {DOCS_PAGE_COUNT > 1 && <nav aria-label="Halaman riwayat dokumentasi" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span aria-live="polite" className="text-sm tabular-nums text-muted-foreground">Halaman {page} dari {DOCS_PAGE_COUNT}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Halaman sebelumnya" title="Halaman sebelumnya" disabled={page === 1} onClick={() => goToPage(page - 1)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Halaman berikutnya" title="Halaman berikutnya" disabled={page === DOCS_PAGE_COUNT} onClick={() => goToPage(page + 1)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>}
      </section>
    </TabsContent>
  </Tabs>;
}
