export const parseLocalDateInput = (value: unknown) => {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined;
};
