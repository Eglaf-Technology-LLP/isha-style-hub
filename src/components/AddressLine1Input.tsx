import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ADDRESS_LINE1_HINT, ADDRESS_LINE1_MIN, addressLine1Count } from "@/lib/addressLine1";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  // A problem found on Submit; shown under the box and keeps it red.
  error?: string;
  // Red when left empty (default). Off where a blank address is allowed.
  required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "required">;

// Started but too short: the cursor stays in the box. An empty box can be
// left, so nobody is stuck in it - clearing it lets them move on.
const holding = (value: string) => {
  const n = addressLine1Count(value);
  return n > 0 && n < ADDRESS_LINE1_MIN;
};

// Address line 1 with the courier minimum (client, 16 Nov 2026), used for
// the seller's business / pickup address and the customer's delivery
// address:
// - red, with a live count ("6/10"), until it has ADDRESS_LINE1_MIN
//   characters;
// - once something is typed, Tab and clicks elsewhere don't move the cursor
//   out until it is long enough.
// Each form also locks its Submit button with addressLine1Ok().
export function AddressLine1Input({ id, value, onChange, error, required = true, className, onKeyDown, onBlur, ...rest }: Props) {
  const [touched, setTouched] = useState(false);
  const count = addressLine1Count(value);
  const short = count < ADDRESS_LINE1_MIN;
  const red = !!error || (short && (count > 0 || (required && touched)));
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <>
      <Input
        {...rest}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={red}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        className={cn(className, red && "border-destructive hover:border-destructive focus-visible:border-destructive")}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key === "Tab" && holding(e.currentTarget.value)) e.preventDefault();
        }}
        onBlur={(e) => {
          onBlur?.(e);
          setTouched(true);
          const box = e.currentTarget;
          if (!holding(box.value)) return;
          // Once the browser has moved focus, bring it back - unless the box
          // has gone (dialog closed, page left) or the whole window lost focus.
          window.setTimeout(() => {
            if (box.isConnected && document.hasFocus() && holding(box.value) && document.activeElement !== box) box.focus();
          }, 0);
        }}
      />
      <div id={hintId} className="flex items-start justify-between gap-3 text-xs">
        <p className={red ? "text-destructive" : "text-muted-foreground"}>{ADDRESS_LINE1_HINT}</p>
        {short ? (
          <span className={cn("shrink-0 tabular-nums", red ? "font-medium text-destructive" : "text-muted-foreground")}>
            {count}/{ADDRESS_LINE1_MIN}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700">
            <Check className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Long enough</span>
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
