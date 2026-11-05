export const WIB = 'Asia/Jakarta';
export const dayInWib = time => new Intl.DateTimeFormat('en-CA', { timeZone: WIB, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
export const announcementStart = startsAt => {
  const midnight = Date.parse(`${dayInWib(startsAt)}T00:00:00+07:00`);
  return new Date(midnight - 86400000).toISOString();
};
export const schedulePhase = (schedule, now = Date.now()) => {
  if (!schedule || schedule.status !== 'published') return 'none';
  if (now < Date.parse(announcementStart(schedule.startsAt))) return 'scheduled';
  if (now < Date.parse(schedule.startsAt)) return 'announced';
  if (schedule.impact === 'full') return 'maintenance';
  return now < Date.parse(schedule.endsAt) ? 'disruption' : 'none';
};
export const validateSchedule = (input, now = Date.now(), previous = null) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Jadwal tidak valid.');
  const { category, impact, message, startsAt, duration, unit, whatsNew } = input;
  if (whatsNew !== undefined && (typeof whatsNew !== 'string' || whatsNew.length > 1500 || whatsNew.trim().split('\n').length > 10)) throw Error('What\'s New maksimal 10 baris dan 1500 karakter.');
  if (!['repair','development','update'].includes(category) || !['full','disruption'].includes(impact)) throw Error('Pilih kegiatan dan dampak layanan.');
  if (typeof message !== 'string' || message.trim().length < 5 || message.length > 1000) throw Error('Pesan harus berisi 5–1000 karakter.');
  if (typeof startsAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(startsAt)) throw Error('Waktu mulai harus menyertakan zona waktu.');
  const start = Date.parse(startsAt);
  const multiplier = { minutes: 1, hours: 60, days: 1440 }[unit];
  if (!Number.isFinite(start) || !Number.isSafeInteger(duration) || !multiplier || duration < 1 || duration * multiplier > 43200) throw Error('Durasi harus antara 1 menit dan 30 hari.');
  if (start <= now && (!previous || previous.startsAt !== new Date(start).toISOString())) throw Error('Pilih waktu mulai setelah waktu sekarang.');
  if (previous && schedulePhase(previous, now) === 'maintenance' && (impact !== 'full' || new Date(start).toISOString() !== previous.startsAt)) throw Error('Akhiri maintenance aktif sebelum mengganti dampak atau waktu mulai.');
  const endsAt = new Date(start + duration * multiplier * 60000).toISOString();
  if (Date.parse(endsAt) <= now) throw Error('Perkiraan selesai harus setelah waktu sekarang.');
  return { category, impact, message: message.trim(), startsAt: new Date(start).toISOString(), endsAt, duration, unit, status: 'published', ...(whatsNew?.trim() ? {whatsNew:whatsNew.trim()} : {}) };
};
export const publicState = (state, now = Date.now()) => ({
  revision: state.revision, schedule: state.schedule ? Object.fromEntries(Object.entries(state.schedule).filter(([key])=>key!=='whatsNew')) : null,
  phase: schedulePhase(state.schedule, now),
  ...(state.release && Date.parse(state.release.completedAt)<=now && now<Date.parse(state.release.expiresAt) ? {release:state.release} : {}),
  serverNow: new Date(now).toISOString(),
});
