import { Plus, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { newOptionId, type ProductCustomisationSetup } from "@/lib/customisation";

// Product form section (boutique and admin): can the customer customise this
// product, and at what price for each customisation.

export interface CustomisationForm {
  customisable: boolean;
  offerCustomSize: boolean;
  customSizePrice: string;
  options: { id: string; label: string; price: string }[];
  days: string;
}

export const emptyCustomisationForm: CustomisationForm = {
  customisable: false,
  offerCustomSize: true,
  customSizePrice: "",
  options: [],
  days: "",
};

export function customisationFormFrom(p: Partial<ProductCustomisationSetup> | null | undefined): CustomisationForm {
  const options = Array.isArray(p?.customisation_options) ? p!.customisation_options : [];
  return {
    customisable: p?.customisable === true,
    offerCustomSize: p?.customisable ? p?.custom_size_price != null : true,
    customSizePrice: p?.custom_size_price != null ? String(p.custom_size_price) : "",
    options: options.map((o) => ({ id: String(o.id), label: String(o.label), price: String(o.price ?? "") })),
    days: p?.customisation_days != null ? String(p.customisation_days) : "",
  };
}

// The product columns to save, or an error message to show.
export function customisationPayload(f: CustomisationForm): { value: ProductCustomisationSetup } | { error: string } {
  const toMoney = (s: string) => Math.round((Number(s) || 0) * 100) / 100;
  const options = f.options
    .filter((o) => o.label.trim() || o.price.trim())
    .map((o) => ({ id: o.id, label: o.label.trim(), price: toMoney(o.price) }));
  if (!f.customisable) {
    // Keep the set-up so switching it back on doesn't lose it.
    return {
      value: {
        customisable: false,
        custom_size_price: f.offerCustomSize && f.customSizePrice.trim() !== "" ? toMoney(f.customSizePrice) : null,
        customisation_options: options.filter((o) => o.label),
        customisation_days: f.days.trim() === "" ? null : Math.min(60, Math.max(0, Math.round(Number(f.days) || 0))),
      },
    };
  }
  if (options.some((o) => !o.label)) return { error: "Give every customisation option a name" };
  if (options.some((o) => o.price < 0 || o.price > 100000)) return { error: "Customisation prices must be between ₹0 and ₹1,00,000" };
  if (f.offerCustomSize && (f.customSizePrice.trim() === "" || Number(f.customSizePrice) < 0)) {
    return { error: "Enter the custom size price (0 if it's free)" };
  }
  if (!f.offerCustomSize && options.length === 0) {
    return { error: "To offer customisation, offer custom size or add at least one option" };
  }
  return {
    value: {
      customisable: true,
      custom_size_price: f.offerCustomSize ? toMoney(f.customSizePrice) : null,
      customisation_options: options,
      customisation_days: f.days.trim() === "" ? null : Math.min(60, Math.max(0, Math.round(Number(f.days) || 0))),
    },
  };
}

export function CustomisationEditor({
  value,
  onChange,
  idPrefix = "cz",
  note,
}: {
  value: CustomisationForm;
  onChange: (next: CustomisationForm) => void;
  idPrefix?: string;
  note?: string;
}) {
  const set = <K extends keyof CustomisationForm>(k: K, v: CustomisationForm[K]) => onChange({ ...value, [k]: v });
  const setOption = (id: string, patch: Partial<CustomisationForm["options"][number]>) =>
    set("options", value.options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-on`} className="text-sm font-medium flex items-center gap-1.5">
            <Scissors className="h-4 w-4" /> Customisation available
          </Label>
          <p className="text-xs text-muted-foreground">
            Customers can have this made to their measurements and/or choose extras. Each customisation's price is
            added to the product price. Customised pieces can't be returned or exchanged.
            {note ? ` ${note}` : ""}
          </p>
        </div>
        <Switch id={`${idPrefix}-on`} checked={value.customisable} onCheckedChange={(v) => set("customisable", v)} />
      </div>

      {value.customisable && (
        <div className="space-y-4 border-t border-border pt-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`${idPrefix}-size`} className="text-sm">
                Custom size (made to the customer's measurements)
              </Label>
              <Switch
                id={`${idPrefix}-size`}
                checked={value.offerCustomSize}
                onCheckedChange={(v) => set("offerCustomSize", v)}
              />
            </div>
            {value.offerCustomSize && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">+ ₹</span>
                <Input
                  id={`${idPrefix}-size-price`}
                  aria-label="Custom size price"
                  type="number"
                  min={0}
                  placeholder="e.g. 500"
                  value={value.customSizePrice}
                  onChange={(e) => set("customSizePrice", e.target.value)}
                  className="max-w-[160px]"
                />
                <span className="text-xs text-muted-foreground">0 if free</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Other customisations, each with its own price</Label>
            {value.options.length === 0 && (
              <p className="text-xs text-muted-foreground">e.g. "Sleeve length change" + ₹200, "Add lining" + ₹300</p>
            )}
            {value.options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Customisation ${i + 1} name`}
                  placeholder="Name, e.g. Add lining"
                  value={o.label}
                  maxLength={80}
                  onChange={(e) => setOption(o.id, { label: e.target.value })}
                  className="flex-1 min-w-0"
                />
                <span className="text-sm text-muted-foreground">+ ₹</span>
                <Input
                  aria-label={`Customisation ${i + 1} price`}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={o.price}
                  onChange={(e) => setOption(o.id, { price: e.target.value })}
                  className="w-24"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove customisation ${i + 1}`}
                  onClick={() => set("options", value.options.filter((x) => x.id !== o.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {value.options.length < 20 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => set("options", [...value.options, { id: newOptionId(), label: "", price: "" }])}
              >
                <Plus className="h-4 w-4" /> Add customisation
              </Button>
            )}
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
              className="max-w-[160px]"
            />
            <p className="text-xs text-muted-foreground">Added to the delivery date the customer sees.</p>
          </div>
        </div>
      )}
    </div>
  );
}
