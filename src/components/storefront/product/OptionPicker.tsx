import { ReactNode } from "react";
import { isMulticolour, swatchColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface OptionPickerProps {
  // Anchor for "please select a size" scrolling.
  id: string;
  label: string;
  type: "size" | "color";
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  // Options with nothing in stock (still selectable, so "notify me" works).
  unavailable?: Set<string>;
  error?: string | null;
  // Shown on the right of the label (e.g. the size chart link).
  aside?: ReactNode;
}

// Size boxes / colour swatches on the product page.
export function OptionPicker({ id, label, type, options, selected, onSelect, unavailable, error, aside }: OptionPickerProps) {
  if (options.length === 0) return null;
  return (
    <div id={id} className="scroll-mt-40" aria-invalid={error ? true : undefined}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.2em]">
          {label}
          {selected && <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">{selected}</span>}
        </p>
        {aside}
      </div>

      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
        {options.map((option) => {
          const active = selected === option;
          const out = unavailable?.has(option);

          if (type === "color") {
            const multi = isMulticolour(option);
            const hex = swatchColor(option);
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${option}${out ? " (out of stock)" : ""}`}
                title={option}
                onClick={() => onSelect(option)}
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-full p-[3px] transition",
                  active ? "ring-1 ring-foreground" : "ring-1 ring-transparent hover:ring-foreground/30",
                )}
              >
                <span
                  className={cn("flex h-full w-full items-center justify-center rounded-full border border-foreground/15 text-[10px] uppercase", out && "opacity-40")}
                  style={
                    multi
                      ? { background: "conic-gradient(#b3261e, #e8c53a, #3f7a4a, #2f5d9e, #6a3d8f, #b3261e)" }
                      : { backgroundColor: hex ?? "hsl(var(--muted))" }
                  }
                >
                  {!hex && !multi && option.charAt(0)}
                </span>
                {out && <span className="absolute h-px w-9 -rotate-45 bg-foreground/60" />}
              </button>
            );
          }

          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Size ${option}${out ? " (out of stock)" : ""}`}
              onClick={() => onSelect(option)}
              className={cn(
                "relative h-11 min-w-[3.25rem] overflow-hidden border px-3.5 text-sm transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 hover:border-foreground",
                out && !active && "text-muted-foreground",
              )}
            >
              {option}
              {out && (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0",
                    active ? "bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),hsl(var(--background)/0.6)_50%,transparent_calc(50%+0.5px))]" : "bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),hsl(var(--foreground)/0.25)_50%,transparent_calc(50%+0.5px))]",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-2.5 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
