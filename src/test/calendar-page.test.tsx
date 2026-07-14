import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CalendarPage from '@/pages/calendar/CalendarPage';

let emittedDate = new Date(2026, 0, 15);

const agenda = {
  id: 'agenda-1',
  title: 'Rapat lintas hari',
  status: 'Scheduled' as const,
  startTime: new Date(2026, 0, 14, 16),
  endTime: new Date(2026, 0, 16, 10),
  createdBy: 'user-1',
};

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => queryKey[0] === 'agendas'
    ? { data: [agenda], isLoading: false }
    : { data: { full_name: 'Pengguna' }, isLoading: false },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: () => ({
      on() { return this; },
      subscribe() { return this; },
    }),
    removeChannel: vi.fn(),
    from: vi.fn(),
    auth: { getSession: vi.fn() },
  },
}));
vi.mock('@/components/calendar/CalendarView', () => ({
  CalendarView: ({ onDateClick }: { onDateClick: (date: Date) => void }) => (
    <button type="button" onClick={() => onDateClick(emittedDate)}>Pilih 15 Januari</button>
  ),
}));
vi.mock('@/components/agenda/AgendaParentFilter', () => ({ AgendaParentFilter: () => null }));
vi.mock('@/components/agenda/AgendaModal', () => ({
  AgendaModal: ({ isOpen, prefilledDate }: { isOpen: boolean; prefilledDate: Date | null }) => isOpen ? (
    <div role="dialog" aria-label="Form agenda" data-prefill={prefilledDate?.toISOString()} />
  ) : null,
}));
vi.mock('@/components/agenda/AgendaDetailModal', () => ({
  AgendaDetailModal: ({ agenda: selected, open }: { agenda: typeof agenda | null; open: boolean }) => open ? (
    <div role="dialog" aria-label={`Detail ${selected?.title}`} />
  ) : null,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15, 14, 25));
  emittedDate = new Date(2026, 0, 15);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarPage day agenda wiring', () => {
  it('opens only the day dialog from a date, then creates with a cloned current-time prefill', () => {
    const originalTimestamp = emittedDate.getTime();
    render(<CalendarPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Pilih 15 Januari' }));
    expect(screen.getByRole('dialog', { name: /Agenda Kamis, 15 Januari 2026/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Form agenda' })).not.toBeInTheDocument();
    expect(emittedDate.getTime()).toBe(originalTimestamp);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Agenda' }));
    const form = screen.getByRole('dialog', { name: 'Form agenda' });
    const prefill = new Date(form.getAttribute('data-prefill') as string);
    expect(prefill.getFullYear()).toBe(2026);
    expect(prefill.getMonth()).toBe(0);
    expect(prefill.getDate()).toBe(15);
    expect(prefill.getHours()).toBe(14);
    expect(prefill.getMinutes()).toBe(25);
    expect(emittedDate.getTime()).toBe(originalTimestamp);
  });

  it('closes the day dialog and opens the selected existing agenda detail', () => {
    render(<CalendarPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Pilih 15 Januari' }));
    fireEvent.click(screen.getByRole('button', { name: /Rapat lintas hari/i }));

    expect(screen.queryByRole('dialog', { name: /Agenda Kamis, 15 Januari 2026/i })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Detail Rapat lintas hari' })).toBeInTheDocument();
  });
});
