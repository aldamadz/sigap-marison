import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DayAgendaDialog } from '@/components/calendar/DayAgendaDialog';
import { Agenda } from '@/types/agenda';

const day = new Date(2026, 0, 15);
const makeAgenda = (id: string, title: string, hour: number): Agenda => ({
  id,
  title,
  status: 'Scheduled',
  startTime: new Date(2026, 0, 15, hour),
  endTime: new Date(2026, 0, 15, hour + 1),
  createdBy: 'user-1',
});

describe('DayAgendaDialog', () => {
  it('provides accessible dialog semantics, exact empty state, and 44px actions', () => {
    render(
      <DayAgendaDialog
        open
        onOpenChange={vi.fn()}
        date={day}
        agendas={[]}
        onAddAgenda={vi.fn()}
        onAgendaClick={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName();
    expect(dialog).toHaveAccessibleDescription();
    expect(screen.getByText('Belum ada agenda pada tanggal ini. Tambahkan agenda untuk mulai menjadwalkan kegiatan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tambah Agenda' })).toHaveClass('h-11');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(dialog).toHaveClass('[&>button]:h-11', '[&>button]:w-11');
  });

  it('renders an ordered semantic list and closes before forwarding an agenda', () => {
    const events: string[] = [];
    const early = makeAgenda('early', 'Agenda pagi', 8);
    const late = makeAgenda('late', 'Agenda siang', 13);
    render(
      <DayAgendaDialog
        open
        onOpenChange={(open) => events.push(`open:${open}`)}
        date={day}
        agendas={[late, early]}
        onAddAgenda={vi.fn()}
        onAgendaClick={(agenda) => events.push(`agenda:${agenda.id}`)}
      />,
    );

    const list = screen.getByRole('list', { name: 'Daftar agenda' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Agenda pagi');
    const agendaButton = within(items[0]).getByRole('button');
    expect(agendaButton).toHaveClass('min-h-11');
    fireEvent.click(agendaButton);
    expect(events).toEqual(['open:false', 'agenda:early']);
  });

  it('closes before forwarding add and supports Radix Escape behavior', async () => {
    const events: string[] = [];
    const onOpenChange = vi.fn((open: boolean) => events.push(`open:${open}`));
    const { rerender } = render(
      <DayAgendaDialog
        open
        onOpenChange={onOpenChange}
        date={day}
        agendas={[]}
        onAddAgenda={() => events.push('add')}
        onAgendaClick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Agenda' }));
    expect(events).toEqual(['open:false', 'add']);

    onOpenChange.mockClear();
    rerender(
      <DayAgendaDialog
        open
        onOpenChange={onOpenChange}
        date={day}
        agendas={[]}
        onAddAgenda={vi.fn()}
        onAgendaClick={vi.fn()}
      />,
    );
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('traps focus in the dialog and restores it after close', async () => {
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Buka agenda</button>
          <DayAgendaDialog
            open={open}
            onOpenChange={setOpen}
            date={day}
            agendas={[]}
            onAddAgenda={vi.fn()}
            onAgendaClick={vi.fn()}
          />
        </>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Buka agenda' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
