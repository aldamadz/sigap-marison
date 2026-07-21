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
  const normalizedDate = String(date ?? "").trim();
  if (!normalizedSerial && !normalizedBlock && !normalizedDate) return "";
  return `${normalizedSerial}/UAI/PRC/${normalizedBlock}/${normalizedDate}`;
};
