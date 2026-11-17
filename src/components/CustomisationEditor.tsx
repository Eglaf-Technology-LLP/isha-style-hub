import { Scissors } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOMISATION_PCTS, chargeLabel, customisationCharge, type ProductCustomisationSetup } from "@/lib/customisation";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

// Product form section (boutique and admin): can the customer customise this
// product, the customisation charge as a % of the product price (client
// corrections 15 Nov 2026, 3.3.3: 1, 2, 3, 4, 5, 7, 10, 15 or 20% - not a ₹
// amount) and the extra making days.

export interface CustomisationForm {
  customisable: boolean;
  pct: string;
  days: string;
}

export const emptyCustomisationForm: CustomisationForm = {
  customisable: false,
  pct: "",
  days: "",
};

export function customisationFormFrom(p: Partial<ProductCustomisationSetup> | null | undefined): CustomisationForm {
  return {
    customisable: p?.customisable === true,
    pct: p?.customisation_pct != null ? String(p.customisation_pct) : "",
    days: p?.customisation_days != null ? String(p.customisation_days) : "",
  };
}

// The product columns to save, or an error message to show. Priced extra
// options and the ₹ custom size price are retired: saving clears them.
export function customisationPayload(
  f: CustomisationForm,
): { value: ProductCustomisationSetup & { custom_size_price: null } } | { error: string } {
  const pct = f.pct === "" ? null : Number(f.pct);
  const days = f.days.trim() === "" ? null : Math.min(60, Math.max(0, Math.round(Number(f.days) || 0)));
  if (f.customisable && (pct == null || !(CUSTOMISATION_PCTS as readonly number[]).includes(pct))) {
    return { error: "Choose the customisation charge (% of the product price)" };
  }
  return {
    value: {
      // Off keeps the % and days, so switching it back on doesn't lose them.
      customisable: f.customisable,
      customisation_pct: pct,
      customisation_options: [],
      custom_size_price: null,
      customisation_days: days,
    },
  };
}

export function CustomisationEditor({
  value,
  onChange,
  idPrefix = "cz",
  note,
  className,
  price,
  baseDays,
}: {
  value: CustomisationForm;
  onChange: (next: CustomisationForm) => void;
  idPrefix?: string;
  note?: string;
  // The outer box (e.g. to match the product page's sections).
  className?: string;
  // The customer price (GST included) and making days, for the preview.
  price?: number | null;
  baseDays?: number | null;
}) {
  const set = <K extends keyof CustomisationForm>(k: K, v: CustomisationForm[K]) => onChange({ ...value, [k]: v });
  const pct = value.pct === "" ? null : Number(value.pct);
  const days = Number(value.days) || 0;
  const charge = price && pct ? customisationCharge(price, pct) : null;

  return (
    <div className={cn("rounded-lg border border-border p-3 space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-on`} className="text-sm font-medium flex items-center gap-1.5">
            <Scissors className="h-4 w-4" /> Customisation available
          </Label>
          <p className="text-xs text-muted-foreground">
            Customers can have this made to their measurements or with the changes they write. The customisation
            charge is a % of the product price and is added to it. Customised pieces can't be returned or exchanged.
            {note ? ` ${note}` : ""}
          </p>
        </div>
        <Switch id={`${idPrefix}-on`} checked={value.customisable} onCheckedChange={(v) => set("customisable", v)} />
      </div>

      {value.customisable && (
        <div className="space-y-4 border-t border-border pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-pct`} className="text-sm">
                Customisation charge *
              </Label>
              <Select value={value.pct} onValueChange={(v) => set("pct", v)}>
                <SelectTrigger id={`${idPrefix}-pct`}>
                  <SelectValue placeholder="% of the product price" />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMISATION_PCTS.map((p) => (
                    <SelectItem key={p} value={String(p)}>
                      {p}% of the product price
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-days`} className="text-sm">
                Extra days to make a customised piece
              </Label>
              <Input
                id={`${idPrefix}-days`}
                type="number"
                min={0}
                max={60}
                placeholder="0"
                value={value.days}
                onChange={(e) => set("days", e.target.value)}
              />
            </div>
          </div>
          {pct != null && (
            <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
              Customer sees:{" "}
              <span className="font-medium text-foreground">
                {charge != null ? chargeLabel(charge, pct) : `+₹X (${pct}%)`}
                {days > 0 ? ` · Adds ${days} extra day${days === 1 ? "" : "s"}` : ""}
                {days > 0 && baseDays ? ` · Total ${baseDays + days} days` : ""}
              </span>
              {charge != null && price ? ` (on ${formatINR(price)}; each size at its own price)` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
