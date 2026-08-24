import { useState } from "react";
import { formatCurrencyInput, normalizeRupiahDigits, parseCurrencyInput } from "@/lib/rupiah";

interface NominalInputProps {
  value: unknown;
  onCommit: (canonical: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Input nominal rupiah yang menahan digit mentah selama mengetik dan baru
 * menormalkan tampilan (format titik ribuan) saat blur.
 *
 * Sebelumnya nilai diparse dan diformat ulang di setiap keystroke, sehingga
 * bentuk antara seperti "1.0000" (teks terformat "1.000" + satu digit) gagal
 * lolos parseCurrencyInput yang kanonik dan field terhapus kosong di tengah
 * pengetikan. Komponen ini menghindari wipe tersebut: apapun yang diketik,
 * digitnya tetap terlihat, lalu hasil kanonik dikirim via onCommit saat blur.
 */
export const NominalInput = ({ value, onCommit, placeholder, ariaLabel, className, disabled }: NominalInputProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : formatCurrencyInput(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={display}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      onChange={(event) => setDraft(normalizeRupiahDigits(event.target.value))}
      onBlur={() => {
        if (draft === null) return;
        onCommit(parseCurrencyInput(draft) !== null ? draft : "");
        setDraft(null);
      }}
    />
  );
};
