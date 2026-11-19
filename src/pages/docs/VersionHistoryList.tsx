import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function VersionHistoryRow({ value, summary, children, latest }: {
  value: string;
  summary: ReactNode;
  children: ReactNode;
  latest?: boolean;
}) {
  return <AccordionItem value={value} className={cn('min-w-0 rounded-lg border bg-card', latest ? 'border-primary/45' : 'border-border')}>
    <AccordionTrigger className="min-h-12 min-w-0 gap-3 rounded-lg px-4 py-3 text-left text-sm hover:bg-muted/50 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&>svg]:text-muted-foreground">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">{summary}</span>
    </AccordionTrigger>
    <AccordionContent className="space-y-3 border-t border-border px-4 pt-3">{children}</AccordionContent>
  </AccordionItem>;
}

export function VersionHistoryPagination({ label, page, pageCount, goToPage }: {
  label: string;
  page: number;
  pageCount: number;
  goToPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
    <span aria-live="polite" className="text-sm tabular-nums text-muted-foreground">Halaman {page} dari {pageCount}</span>
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="icon" aria-label="Halaman sebelumnya" title="Halaman sebelumnya" disabled={page === 1} onClick={() => goToPage(page - 1)}>
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="outline" size="icon" aria-label="Halaman berikutnya" title="Halaman berikutnya" disabled={page === pageCount} onClick={() => goToPage(page + 1)}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  </nav>;
}
