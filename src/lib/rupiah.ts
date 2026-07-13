export const normalizeRupiahDigits = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.replace(/^0+(?=\d)/, "");
};

export const formatRupiahInput = (value: unknown) => {
  const digits = normalizeRupiahDigits(value);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export const parseRupiahInteger = (value: unknown) => {
  const digits = normalizeRupiahDigits(value);
  if (!digits) return 0;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : 0;
};
