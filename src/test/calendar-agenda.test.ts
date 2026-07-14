import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agendaOverlapsDay, getAgendasForDay } from '@/lib/calendar-agenda';
import { Agenda } from '@/types/agenda';

const makeAgenda = (overrides: Partial<Agenda> = {}): Agenda => ({
  id: 'agenda-1',
  title: 'Agenda',
  status: 'Scheduled',
  startTime: new Date(2026, 0, 15, 9),
  endTime: new Date(2026, 0, 15, 10),
  createdBy: 'user-1',
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('calendar agenda helpers', () => {
  it('matches multi-day agendas inclusively on both boundary days', () => {
    const agenda = makeAgenda({
      startTime: new Date(2026, 0, 14, 23),
      endTime: new Date(2026, 0, 16, 1),
    });

    expect(agendaOverlapsDay(agenda, new Date(2026, 0, 14))).toBe(true);
    expect(agendaOverlapsDay(agenda, new Date(2026, 0, 15))).toBe(true);
    expect(agendaOverlapsDay(agenda, new Date(2026, 0, 16))).toBe(true);
    expect(agendaOverlapsDay(agenda, new Date(2026, 0, 17))).toBe(false);
  });

  it('falls back a missing end to start and rejects invalid dates without throwing', () => {
    const missingEnd = { ...makeAgenda(), endTime: undefined } as unknown as Agenda;
    expect(agendaOverlapsDay(missingEnd, new Date(2026, 0, 15))).toBe(true);
    expect(agendaOverlapsDay(missingEnd, new Date(2026, 0, 16))).toBe(false);
    expect(agendaOverlapsDay(makeAgenda({ startTime: 'invalid' }), new Date(2026, 0, 15))).toBe(false);
    expect(agendaOverlapsDay(makeAgenda({ endTime: 'invalid' }), new Date(2026, 0, 15))).toBe(false);
    expect(agendaOverlapsDay(makeAgenda(), new Date('invalid'))).toBe(false);
  });

  it('sorts by start time, computes status consistently, and leaves inputs unchanged', () => {
    const later = makeAgenda({ id: 'later', startTime: new Date(2026, 0, 15, 13), endTime: new Date(2026, 0, 15, 14) });
    const final = makeAgenda({ id: 'final', status: 'Completed', startTime: new Date(2026, 0, 15, 8) });
    const original = [later, final];
    const day = new Date(2026, 0, 15, 17, 30);
    const dayTimestamp = day.getTime();

    const result = getAgendasForDay(original, day);

    expect(result.map((agenda) => agenda.id)).toEqual(['final', 'later']);
    expect(result.map((agenda) => agenda.status)).toEqual(['Completed', 'Scheduled']);
    expect(result[0]).not.toBe(final);
    expect(original).toEqual([later, final]);
    expect(day.getTime()).toBe(dayTimestamp);
  });
});
