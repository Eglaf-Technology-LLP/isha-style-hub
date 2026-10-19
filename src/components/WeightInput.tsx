import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatWeight, WeightUnit } from "@/lib/weight";

interface WeightInputProps {
  // Always grams, whatever unit is picked on screen.
  grams: number | null;
  onChange: (grams: number | null) => void;
  id?: string;
  defaultUnit?: WeightUnit;
  // Show a "check the unit" warning above this many grams.
  warnAboveGrams?: number;
  className?: string;
}

const toText = (grams: number | null, unit: WeightUnit) =>
  grams == null ? "" : unit === "kg" ? String(Math.round((grams / 1000) * 1000) / 1000) : String(Math.round(grams));

// A weight box with an explicit g / kg choice, so a boutique, the warehouse
// and admins can't type grams into a kilogram box (or the other way round).
export function WeightInput({ grams, onChange, id, defaultUnit = "g", warnAboveGrams, className }: WeightInputProps) {
  const [unit, setUnit] = useState<WeightUnit>(defaultUnit);
  const [text, setText] = useState(() => toText(grams, defaultUnit));

  const parsed = text.trim() === "" ? null : Number(text);
  const currentGrams =
    parsed == null || !Number.isFinite(parsed) ? null : Math.round(unit === "kg" ? parsed * 1000 : parsed);

  // A new value from outside (the form opened on another product).
  useEffect(() => {
    if (grams !== currentGrams) setText(toText(grams, unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grams]);

  const changeText = (value: string) => {
    setText(value);
    const n = value.trim() === "" ? null : Number(value);
    onChange(n == null || !Number.isFinite(n) ? null : Math.round(unit === "kg" ? n * 1000 : n));
  };

  // Same weight, shown in the other unit.
  const changeUnit = (next: WeightUnit) => {
    setUnit(next);
    setText(toText(currentGrams, next));
  };

  const tooHeavy = warnAboveGrams != null && currentGrams != null && currentGrams > warnAboveGrams;

  return (
    <div className={className}>
      <div className="flex gap-1.5">
        <Input
          id={id}
          type="number"
          min={0}
          step={unit === "kg" ? "0.01" : "1"}
          inputMode="decimal"
          value={text}
          onChange={(e) => changeText(e.target.value)}
          className="flex-1 min-w-0"
        />
        <Select value={unit} onValueChange={(v) => changeUnit(v as WeightUnit)}>
          <SelectTrigger className="w-[72px] shrink-0" aria-label="Weight unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="g">g</SelectItem>
            <SelectItem value="kg">kg</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {currentGrams != null && currentGrams > 0 && (
        <p className={`text-xs mt-1 ${tooHeavy ? "text-destructive font-medium" : "text-muted-foreground"}`}>
          {tooHeavy ? `${formatWeight(currentGrams)} - that's very heavy, check g / kg` : `= ${formatWeight(currentGrams)}`}
        </p>
      )}
    </div>
  );
}
