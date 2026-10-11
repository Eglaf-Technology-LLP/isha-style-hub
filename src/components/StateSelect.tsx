import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDIAN_STATES, normalizeState } from "@/lib/indianStates";

interface StateSelectProps {
  id?: string;
  value: string;
  onChange: (state: string) => void;
  className?: string;
  invalid?: boolean;
}

// The one way to pick a state, so every address stores the same spelling
// (GST on the invoice depends on comparing states).
export function StateSelect({ id, value, onChange, className, invalid }: StateSelectProps) {
  const current = normalizeState(value);
  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger id={id} className={`${className ?? ""} ${invalid ? "border-destructive" : ""}`} aria-invalid={invalid}>
        <SelectValue placeholder={value && !current ? `Choose your state (was "${value}")` : "Select state"} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {INDIAN_STATES.map((s) => (
          <SelectItem key={s.name} value={s.name}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
