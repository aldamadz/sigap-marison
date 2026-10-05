export const normalizeProductionSerial = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (!digits) return text;
  return digits.padStart(3, "0");
};

export const buildProductionCode = ({ serial, block, date }) => {
  const normalizedSerial = normalizeProductionSerial(serial);
  const normalizedBlock = String(block ?? "").trim();
  const rawDate = String(date ?? "").trim();
  // Use date components, not local Date parsing: production dates have no timezone.
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(rawDate);
  const normalizedDate = isoDate ? `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}` : rawDate;
  if (!normalizedSerial && !normalizedBlock && !normalizedDate) return "";
  return `${normalizedSerial}/UAI/PRC/${normalizedBlock}/${normalizedDate}`;
};
