/**
 * Pemilih warna statis untuk pekerjaan (CAL-03 F5).
 *
 * Palet tetap dan kecil, dipakai sebagai grup radio asli sehingga:
 * - navigasi keyboard (panah/space) mengikuti perilaku radio bawaan;
 * - setiap pilihan punya label teks, bukan warna saja;
 * - ada opsi "Tanpa penanda" untuk menghapus warna.
 *
 * Komponen ini murni presentasi: nilai dikendalikan pemanggil.
 */

import type { WorkEntryColorSwatch } from "../types/work-calendar";
import { WORK_ENTRY_COLOR_META } from "../lib/work-entry-lifecycle";
import { cn } from "@/lib/utils";

export interface WorkEntryColorPickerProps {
  /** Awalan id agar beberapa pemilih dalam satu halaman tetap unik. */
  idPrefix: string;
  value: WorkEntryColorSwatch | null;
  onChange: (value: WorkEntryColorSwatch | null) => void;
  disabled?: boolean;
  legend?: string;
}

export function WorkEntryColorPicker({
  idPrefix,
  value,
  onChange,
  disabled = false,
  legend = "Warna penanda",
}: WorkEntryColorPickerProps) {
  const name = `${idPrefix}-color-swatch`;

  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="block text-xs font-medium text-foreground">{legend}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        <label
          className={cn(
            "inline-flex min-h-touch cursor-pointer items-center gap-1.5 rounded-sm border px-2 text-xs text-foreground",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            value === null ? "border-foreground bg-muted" : "border-input bg-background",
          )}
        >
          <input
            type="radio"
            name={name}
            value=""
            checked={value === null}
            onChange={() => onChange(null)}
            className="sr-only"
            data-testid={`${idPrefix}-color-none`}
          />
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 rounded-full border border-dashed border-muted-foreground"
          />
          Tanpa penanda
        </label>

        {WORK_ENTRY_COLOR_META.map((color) => {
          const checked = value === color.swatch;
          return (
            <label
              key={color.swatch}
              title={`${color.label} - ${color.description}`}
              className={cn(
                "inline-flex min-h-touch cursor-pointer items-center gap-1.5 rounded-sm border px-2 text-xs text-foreground",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked ? "border-foreground bg-muted" : "border-input bg-background",
              )}
            >
              <input
                type="radio"
                name={name}
                value={color.swatch}
                checked={checked}
                onChange={() => onChange(color.swatch)}
                className="sr-only"
                data-testid={`${idPrefix}-color-${color.swatch}`}
              />
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 rounded-full border border-black/10"
                style={{ backgroundColor: color.hex }}
              />
              {color.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
