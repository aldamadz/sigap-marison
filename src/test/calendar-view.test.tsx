import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarView } from '@/components/calendar/CalendarView';
import { Agenda } from '@/types/agenda';

const january = new Date(2026, 0, 15, 12);
const agenda: Agenda = {
  id: 'agenda-1',
  title: 'Rapat koordinasi',
  status: 'Scheduled',
  startTime: new Date(2026, 0, 15, 9),
  endTime: new Date(2026, 0, 15, 10),
  createdBy: 'user-1',
};

const renderCalendar = (overrides: Partial<React.ComponentProps<typeof CalendarView>> = {}) => {
  const props: React.ComponentProps<typeof CalendarView> = {
    agendas: [agenda],
    currentMonth: january,
    onMonthChange: vi.fn(),
    onDateClick: vi.fn(),
    onAgendaClick: vi.fn(),
    onAgendaDrop: vi.fn(),
    ...overrides,
  };

  return { ...render(<CalendarView {...props} />), props };
};

const activateButtonWithKeyboard = (button: HTMLElement, key: 'Enter' | ' ') => {
  button.focus();
  fireEvent.keyDown(button, { key, code: key === ' ' ? 'Space' : 'Enter' });
  if (key === ' ') fireEvent.keyUp(button, { key, code: 'Space' });

  // jsdom does not synthesize the native click that browsers dispatch for buttons.
  button.click();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15, 8));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarView', () => {
  it('exposes named month navigation and preserves controlled navigation callbacks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 8));
    const onMonthChange = vi.fn();
    renderCalendar({ onMonthChange });

    fireEvent.click(screen.getByRole('button', { name: 'Bulan sebelumnya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hari Ini' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bulan berikutnya' }));

    expect(onMonthChange).toHaveBeenNthCalledWith(1, new Date(2025, 11, 15, 12));
    expect(onMonthChange).toHaveBeenNthCalledWith(2, new Date(2026, 5, 10, 8));
    expect(onMonthChange).toHaveBeenNthCalledWith(3, new Date(2026, 1, 15, 12));
  });

  it('provides a named focusable scroll region and disables dates outside the current month', () => {
    const onDateClick = vi.fn();
    renderCalendar({ onDateClick });

    const region = screen.getByRole('region', { name: /Kalender bulanan/i });
    const disabledDate = screen.getByRole('button', { name: 'Lihat agenda pada 28 Desember 2025' });

    region.focus();
    expect(region).toHaveFocus();
    expect(disabledDate).toBeDisabled();
    disabledDate.focus();
    expect(disabledDate).not.toHaveFocus();
    disabledDate.click();
    expect(onDateClick).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '] as const)('activates an enabled date control with %s', (key) => {
    const onDateClick = vi.fn();
    renderCalendar({ onDateClick });

    const dateButton = screen.getByRole('button', { name: 'Lihat agenda pada 15 Januari 2026' });
    activateButtonWithKeyboard(dateButton, key);

    expect(dateButton).toHaveFocus();
    expect(onDateClick).toHaveBeenCalledOnce();
    expect(onDateClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it.each(['Enter', ' '] as const)('activates an agenda with %s without activating its date', (key) => {
    const onDateClick = vi.fn();
    const onAgendaClick = vi.fn();
    renderCalendar({ onDateClick, onAgendaClick });

    const agendaButton = screen.getByRole('button', {
      name: 'Rapat koordinasi, Terjadwal, 15 Januari 2026',
    });
    activateButtonWithKeyboard(agendaButton, key);

    expect(agendaButton).toHaveFocus();
    expect(onAgendaClick).toHaveBeenCalledOnce();
    expect(onAgendaClick).toHaveBeenCalledWith(expect.objectContaining({
      id: agenda.id,
      title: agenda.title,
    }));
    expect(onDateClick).not.toHaveBeenCalled();
  });

  it('renders inclusive multi-day overlaps and ignores agendas with invalid dates', () => {
    const multiDay: Agenda = {
      ...agenda,
      id: 'multi-day',
      title: 'Kegiatan lintas hari',
      startTime: new Date(2026, 0, 14, 22),
      endTime: new Date(2026, 0, 16, 2),
    };
    const invalid: Agenda = { ...agenda, id: 'invalid', title: 'Tanggal rusak', startTime: 'invalid' };
    renderCalendar({ agendas: [invalid, multiDay] });

    expect(screen.getByRole('button', { name: /Kegiatan lintas hari,.*14 Januari 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kegiatan lintas hari,.*15 Januari 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kegiatan lintas hari,.*16 Januari 2026/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tanggal rusak/ })).not.toBeInTheDocument();
  });

  it('renders zero, one, and at most three mobile indicators with a compact remainder', () => {
    const { rerender } = renderCalendar({ agendas: [] });
    expect(screen.queryByRole('button', { name: /Rapat koordinasi,/ })).not.toBeInTheDocument();

    rerender(<CalendarView
      agendas={[agenda]}
      currentMonth={january}
      onDateClick={vi.fn()}
      onAgendaClick={vi.fn()}
      onAgendaDrop={vi.fn()}
    />);
    const oneIndicator = screen.getByRole('button', {
      name: 'Rapat koordinasi, Terjadwal, 15 Januari 2026',
    });
    expect(oneIndicator).toHaveClass('h-2', 'w-2', 'rounded-full');

    const agendas = Array.from({ length: 4 }, (_, index): Agenda => ({
      ...agenda,
      id: `agenda-${index + 1}`,
      title: `Agenda ${index + 1}`,
    }));
    rerender(<CalendarView
      agendas={agendas}
      currentMonth={january}
      onDateClick={vi.fn()}
      onAgendaClick={vi.fn()}
      onAgendaDrop={vi.fn()}
    />);

    const indicators = agendas.map((item) => screen.getByRole('button', {
      name: `${item.title}, Terjadwal, 15 Januari 2026`,
    }));
    expect(indicators.slice(0, 3).every((item) => !item.classList.contains('hidden'))).toBe(true);
    expect(indicators[3]).toHaveClass('hidden', 'md:block');
    expect(screen.getAllByText('+1')).toHaveLength(2);
    expect(screen.getAllByText('+1').some((item) => item.classList.contains('md:hidden'))).toBe(true);
  });

  it('uses distinct mobile colors and Indonesian accessible status labels for every computed status', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12));
    const statuses: Array<{ agenda: Agenda; label: string; color: string; date: string }> = [
      {
        agenda: { ...agenda, id: 'scheduled', title: 'Akan datang', startTime: new Date(2026, 0, 16, 9), endTime: new Date(2026, 0, 16, 10) },
        label: 'Terjadwal', color: 'bg-blue-500', date: '16 Januari 2026',
      },
      {
        agenda: { ...agenda, id: 'ongoing', title: 'Sedang berjalan', startTime: new Date(2026, 0, 15, 11), endTime: new Date(2026, 0, 15, 13) },
        label: 'Berlangsung', color: 'bg-amber-500', date: '15 Januari 2026',
      },
      {
        agenda: { ...agenda, id: 'completed', title: 'Sudah selesai', status: 'Completed' },
        label: 'Selesai', color: 'bg-emerald-500', date: '15 Januari 2026',
      },
      {
        agenda: { ...agenda, id: 'overdue', title: 'Sudah lewat', startTime: new Date(2026, 0, 14, 9), endTime: new Date(2026, 0, 14, 10) },
        label: 'Terlambat', color: 'bg-rose-500', date: '14 Januari 2026',
      },
      {
        agenda: { ...agenda, id: 'deleted', title: 'Sudah dihapus', status: 'Deleted' },
        label: 'Dihapus', color: 'bg-muted-foreground', date: '15 Januari 2026',
      },
    ];
    renderCalendar({ agendas: statuses.map(({ agenda: item }) => item) });

    statuses.forEach(({ agenda: item, label, color, date }) => {
      expect(screen.getByRole('button', { name: `${item.title}, ${label}, ${date}` })).toHaveClass(color);
    });
  });

  it('keeps a compact seven-column square mobile grid without horizontal expansion', () => {
    const { container } = renderCalendar({ agendas: [] });
    const region = screen.getByRole('region', { name: 'Kalender bulanan' });
    const dateButton = screen.getByRole('button', { name: 'Lihat agenda pada 15 Januari 2026' });
    const dayCell = dateButton.parentElement;
    const calendarGrid = dayCell?.parentElement;

    expect(region).not.toHaveClass('overflow-x-auto');
    expect(container.querySelector('[class*="min-w-[700px]"]')).not.toBeInTheDocument();
    expect(calendarGrid).toHaveClass('grid-cols-7', 'md:auto-rows-[minmax(160px,260px)]');
    expect(dayCell).toHaveClass('aspect-square', 'md:aspect-auto');
  });

  it('preserves the desktop agenda card content, click, and drag behavior', () => {
    const onAgendaClick = vi.fn();
    const { props } = renderCalendar({ onAgendaClick });
    const agendaButton = screen.getByRole('button', {
      name: 'Rapat koordinasi, Terjadwal, 15 Januari 2026',
    });

    expect(agendaButton).toHaveAttribute('draggable', 'true');
    expect(agendaButton).toHaveClass('md:w-full', 'md:border-l-[3px]', 'md:px-2', 'md:py-1.5');
    expect(agendaButton).toHaveTextContent('Rapat koordinasi');
    fireEvent.dragStart(agendaButton);
    fireEvent.click(agendaButton);
    expect(onAgendaClick).toHaveBeenCalledOnce();

    const dateButton = screen.getByRole('button', { name: 'Lihat agenda pada 15 Januari 2026' });
    fireEvent.drop(dateButton.parentElement as HTMLElement);
    expect(props.onAgendaDrop).toHaveBeenCalledWith(String(agenda.id), expect.any(Date));
  });
});
