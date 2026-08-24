const MAX_SAFE_NOMINAL = Number.MAX_SAFE_INTEGER;

export const normalizeRupiahDigits = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.replace(/^0+(?=\d)/, "");
};

export const parseCurrencyInput = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value) || value > MAX_SAFE_NOMINAL) return null;
    return value;
  }
  const str = String(value).trim();
  if (!str) return null;
  if (/^-/.test(str)) return null;
  const stripped = str.replace(/^Rp\.?\s*/i, "").trim();
  if (!stripped) return null;
  if (/[eE]/.test(stripped)) return null;
  const isThousandSeparatorPattern = /^[\d]{1,3}([.,][\d]{3})*$/.test(stripped.replace(/\s/g, ""));
  const isPlainDigits = /^\d+$/.test(stripped.replace(/\s/g, ""));
  const isRupiahFormatted = isThousandSeparatorPattern || isPlainDigits;
  if (!isRupiahFormatted) return null;
  const withoutSeparators = stripped.replace(/[.,\s]/g, "");
  if (/\D/.test(withoutSeparators)) return null;
  if (!withoutSeparators) return null;
  const amount = Number(withoutSeparators);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount) || amount > MAX_SAFE_NOMINAL) return null;
  return amount;
};

export const parseRupiahInteger = (value: unknown): number => {
  return parseCurrencyInput(value) ?? 0;
};

export const formatCurrencyInput = (value: unknown): string => {
  const amount = parseCurrencyInput(value);
  if (amount === null) return "";
  if (amount === 0) return "0";
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export const formatRupiahInput = formatCurrencyInput;

export const formatRupiah = (value: unknown): string => {
  const amount = parseCurrencyInput(value);
  if (amount === null) return "-";
  return `Rp ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
};

export const formatRupiahZero = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  const amount = parseCurrencyInput(value);
  if (amount === null) return "-";
  return `Rp ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
};
