import { endOfDay, startOfDay } from 'date-fns';

import { getAutomaticStatus } from '@/lib/utils';
import { Agenda } from '@/types/agenda';

type AgendaWithRuntimeEnd = Omit<Agenda, 'endTime'> & { endTime?: Agenda['endTime'] | null };

const isValidDate = (date: Date) => !Number.isNaN(date.getTime());

export const agendaOverlapsDay = (agenda: AgendaWithRuntimeEnd, day: Date): boolean => {
  if (!isValidDate(day) || !agenda.startTime) return false;

  const start = new Date(agenda.startTime);
  const end = agenda.endTime ? new Date(agenda.endTime) : start;
  if (!isValidDate(start) || !isValidDate(end)) return false;

  const dayStart = startOfDay(day).getTime();
  const dayEnd = endOfDay(day).getTime();
  return start.getTime() <= dayEnd && end.getTime() >= dayStart;
};

export const getAgendasForDay = (agendas: readonly Agenda[], day: Date): Agenda[] =>
  agendas
    .map((agenda, index) => ({ agenda, index }))
    .filter(({ agenda }) => agendaOverlapsDay(agenda, day))
    .map(({ agenda, index }) => ({
      agenda: { ...agenda, status: getAutomaticStatus(agenda) },
      index,
    }))
    .sort((left, right) => {
      const byStart = new Date(left.agenda.startTime).getTime() - new Date(right.agenda.startTime).getTime();
      return byStart || left.index - right.index;
    })
    .map(({ agenda }) => agenda);
