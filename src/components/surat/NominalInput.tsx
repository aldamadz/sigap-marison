import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCurrencyInput, normalizeRupiahDigits, parseCurrencyInput } from "@/lib/rupiah";

interface NominalInputProps {
  value: unknown;
  onCommit: (canonical: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Kelas tambahan untuk wadah input-group (mis. tinggi h-11 / h-12). */
  className?: string;
  disabled?: boolean;
  /** Perataan angka pada input; kanan secara default. */
  align?: "left" | "right";
}

/**
 * Input nominal rupiah bergaya input-group modern:
 * - Prefiks "Rp" yang tidak dapat diedit user.
 * - Titik ribuan muncul langsung saat mengetik (1000000 -> 1.000.000).
 *
 * Digit mentah tetap dikirim via onCommit saat blur sehingga nilai tersimpan
 * kanonik. Sebelumnya format baru jadi saat blur; kini pemformatan live
 * menggunakan digit yang sudah dibersihkan sehingga bentuk antara apa pun
 * yang diketik tidak pernah mengosongkan field di tengah pengetikan.
 */
export const NominalInput = ({ value, onCommit, placeholder, ariaLabel, className, disabled, align = "right" }: NominalInputProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const display = draft !== null ? draft : formatCurrencyInput(value);

  // Kursor diletakkan di ujung setelah pemformatan ulang agar mengetik
  // lanjutan selalu menyambung di digit terakhir.
  useEffect(() => {
    if (draft === null || !inputRef.current) return;
    const end = inputRef.current.value.length;
    inputRef.current.setSelectionRange(end, end);
  }, [draft]);

  return (
    <div
      className={cn(
        "flex items-center overflow-hidden rounded-md border border-input bg-background shadow-sm transition-colors",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-full select-none items-center self-stretch border-r border-input bg-muted/60 px-2.5 text-xs font-semibold text-muted-foreground"
      >
        Rp
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={display}
        placeholder={placeholder ?? "0"}
        aria-label={ariaLabel}
        className={cn("h-full w-full min-w-0 bg-transparent px-2.5 py-2 text-sm tabular-nums outline-none placeholder:text-muted-foreground/50", align === "left" ? "text-left" : "text-right")}
        onChange={(event) => {
          const digits = normalizeRupiahDigits(event.target.value);
          setDraft(digits.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
        }}
        onBlur={() => {
          if (draft === null) return;
          const amount = parseCurrencyInput(draft);
          onCommit(amount === null ? "" : String(amount));
          setDraft(null);
        }}
      />
    </div>
  );
};
