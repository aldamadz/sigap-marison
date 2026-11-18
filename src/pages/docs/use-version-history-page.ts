import { useSearchParams } from 'react-router';

const PAGE_SIZE = 5;

export function useVersionHistoryPage(total: number) {
  const [params, setParams] = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = params.get('page') ?? '';
  const page = /^[1-9]\d*$/.test(requestedPage) ? Math.min(Number(requestedPage), pageCount) : 1;
  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
  };

  return { page, pageCount, start: (page - 1) * PAGE_SIZE, end: page * PAGE_SIZE, goToPage };
}
