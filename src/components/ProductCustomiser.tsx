import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Scissors, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  chargeLabel,
  customisationCharge,
  inr,
  PHOTO_BUCKET,
  type CustomisationChoice,
  type ProductCustomisationSetup,
} from "@/lib/customisation";
import { bodyMeasurementsFor, cleanMeasurement, measurementError } from "@/lib/bodyMeasurements";
import { cn } from "@/lib/utils";
import { CUSTOMISATION_EXTRA_OPTIONS_ENABLED, CUSTOMISATION_REFERENCE_PHOTO_ENABLED } from "@/lib/hiddenFeatures";
import { PHOTO_ACCEPT, preparePhoto, uploadProblemMessage } from "@/lib/uploadPrep";

// Product page: the customer asks for this piece to be customised - made to
// their measurements and/or with a note - and sees exactly what it adds to
// the price: the boutique's % of the piece's price, in whole rupees
// ("+₹6,700 (10%) · Adds 3 extra days · Total 38 days", client corrections
// 15 Nov 2026, 2.5 and 3.3.3).

export interface CustomiserState {
  enabled: boolean;
  customSize: boolean;
  measurements: Record<string, string>;
  optionIds: string[];
  note: string;
  photoPath: string | null;
}

export const emptyCustomiser: CustomiserState = {
  enabled: false,
  customSize: false,
  measurements: {},
  optionIds: [],
  note: "",
  photoPath: null,
};

// The customer's choice for the cart (priced on the piece's `price`), or
// what's missing: fieldErrors says which measurement box and why (shown
// under that box once Add to cart was pressed). category: the product's
// category name or slug (a lehenga's top is "Top Length").
export function buildCustomisation(
  setup: ProductCustomisationSetup,
  s: CustomiserState,
  price: number,
  category?: string | null,
): { choice: CustomisationChoice | null } | { error: string; fieldErrors?: Record<string, string> } {
  if (!setup.customisable || !s.enabled) return { choice: null };
  // Priced extra options are retired (the charge is one %), see hiddenFeatures.
  const options = CUSTOMISATION_EXTRA_OPTIONS_ENABLED ? setup.customisation_options.filter((o) => s.optionIds.includes(o.id)) : [];
  let custom_size: CustomisationChoice["custom_size"] = null;
  if (s.customSize) {
    const fieldErrors: Record<string, string> = {};
    for (const m of bodyMeasurementsFor(category)) {
      const why = measurementError(m, s.measurements[m.key]);
      if (why) fieldErrors[m.key] = why;
    }
    if (Object.keys(fieldErrors).length) return { error: "Please check your measurements", fieldErrors };
    const measurements = Object.fromEntries(
      Object.entries(s.measurements).filter(([, v]) => String(v).trim()).map(([k, v]) => [k, String(v).trim()]),
    );
    custom_size = { unit: "in", measurements };
  }
  const note = s.note.trim() || null;
  if (!custom_size && options.length === 0 && !note && !s.photoPath) {
    return { error: "Enter your measurements or tell us what to change, or switch customisation off" };
  }
  return {
    choice: {
      options,
      custom_size,
      note,
      photo_path: s.photoPath,
      days: setup.customisation_days ?? 0,
      pct: setup.customisation_pct,
      charge: customisationCharge(price, setup.customisation_pct),
    },
  };
}

function OwnPhoto({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return (
    <div className="relative h-20 w-20">
      {url ? (
        <img src={url} alt="Your reference photo" className="h-20 w-20 rounded-md object-cover border border-border" />
      ) : (
        <div className="h-20 w-20 rounded-md bg-muted animate-pulse" />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove reference photo"
        className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-0.5 shadow"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ProductCustomiser({
  setup,
  baseDays,
  basePrice,
  value,
  onChange,
  userId,
  category,
  showErrors = false,
}: {
  setup: ProductCustomisationSetup;
  // The making / dispatch days the product page shows, for "Total T days".
  baseDays?: number | null;
  basePrice: number;
  value: CustomiserState;
  onChange: (next: CustomiserState) => void;
  userId: string | null;
  // The product's category name or slug (see buildCustomisation).
  category?: string | null;
  // Add to cart was pressed: show what's missing, in red under its box.
  // Until then nothing is red (client corrections Box 3).
  showErrors?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  if (!setup.customisable) return null;
  const set = <K extends keyof CustomiserState>(k: K, v: CustomiserState[K]) => onChange({ ...value, [k]: v });

  const preview = buildCustomisation(setup, value, basePrice, category);
  const fieldErrors = showErrors && "error" in preview ? (preview.fieldErrors ?? {}) : {};
  const measurements = bodyMeasurementsFor(category);
  // One charge for the piece, whatever is customised.
  const charge = customisationCharge(basePrice, setup.customisation_pct);
  const extraDays = setup.customisation_days ?? 0;
  // "+₹6,700 (10%) · Adds 3 extra days · Total 38 days"
  const summary = [
    chargeLabel(charge, setup.customisation_pct),
    extraDays > 0 ? `Adds ${extraDays} extra day${extraDays === 1 ? "" : "s"}` : null,
    extraDays > 0 && baseDays != null && baseDays > 0 ? `Total ${baseDays + extraDays} days` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // JPG, PNG, WEBP or HEIC; HEIC becomes JPG and over 5 MB is compressed
  // (the bucket takes JPG, PNG and WEBP up to 5 MB).
  const uploadPhoto = async (picked: File) => {
    if (!userId) return;
    setUploading(true);
    try {
      let file: File;
      try {
        file = await preparePhoto(picked);
      } catch (e) {
        return toast.error(uploadProblemMessage(e, picked.name));
      }
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type });
      if (error) return toast.error(error.message || "Couldn't upload the photo");
      set("photoPath", path);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-4" data-testid="product-customiser">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" /> Customise this piece
          </p>
          <p className="text-sm text-muted-foreground">Made to your measurements or with the changes you choose.</p>
          <p className="mt-1 text-sm font-medium tabular-nums" data-testid="customisation-summary">
            {summary}
          </p>
        </div>
        <Switch aria-label="Customise this piece" checked={value.enabled} onCheckedChange={(v) => set("enabled", v)} />
      </div>

      {value.enabled && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox checked={value.customSize} onCheckedChange={(v) => set("customSize", v === true)} />
              Make it to my measurements
            </label>
            {value.customSize && (
              <div className="space-y-3 rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">* Required</span> · All in inches (in), measured over light
                  clothing with the tape snug, not tight.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
                  {measurements.map((m) => {
                    const id = `cz-m-${m.key}`;
                    const error = fieldErrors[m.key];
                    return (
                      <div key={m.key} className="space-y-1">
                        <Label htmlFor={id} className="text-xs">
                          {m.label}
                          {m.required && <span aria-hidden="true"> *</span>}
                        </Label>
                        <div className="relative">
                          <Input
                            id={id}
                            inputMode="decimal"
                            placeholder={`${m.min}–${m.max}`}
                            required={m.required}
                            aria-invalid={!!error}
                            aria-describedby={`${id}-how${error ? ` ${id}-error` : ""}`}
                            value={value.measurements[m.key] ?? ""}
                            onChange={(e) => set("measurements", { ...value.measurements, [m.key]: cleanMeasurement(e.target.value) })}
                            className={cn("h-9 pr-9 tabular-nums", error && "border-destructive focus-visible:ring-destructive")}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                            in
                          </span>
                        </div>
                        <p id={`${id}-how`} className="text-[11px] leading-snug text-muted-foreground">
                          How to measure: {m.hint}
                        </p>
                        {error && (
                          <p id={`${id}-error`} className="text-[11px] font-medium text-destructive">
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {CUSTOMISATION_EXTRA_OPTIONS_ENABLED && setup.customisation_options.length > 0 && (
            <div className="space-y-2">
              {setup.customisation_options.map((o) => (
                <label key={o.id} className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={value.optionIds.includes(o.id)}
                      onCheckedChange={(v) =>
                        set("optionIds", v === true ? [...value.optionIds, o.id] : value.optionIds.filter((x) => x !== o.id))
                      }
                    />
                    {o.label}
                  </span>
                  <span className="text-sm font-medium tabular-nums">{o.price > 0 ? `+${inr(o.price)}` : "Free"}</span>
                </label>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cz-note" className="text-sm">
              Anything else? <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="cz-note"
              rows={2}
              maxLength={1000}
              placeholder="e.g. Keep the neckline a little higher"
              value={value.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          {CUSTOMISATION_REFERENCE_PHOTO_ENABLED && (
          <div className="space-y-1.5">
            <p className="text-sm">
              Reference photo <span className="text-muted-foreground">(optional)</span>
            </p>
            {value.photoPath ? (
              <OwnPhoto path={value.photoPath} onRemove={() => set("photoPath", null)} />
            ) : userId ? (
              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={uploading} asChild>
                <label className="cursor-pointer">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  Add a photo
                  <input
                    type="file"
                    accept={PHOTO_ACCEPT}
                    className="sr-only"
                    aria-label="Reference photo"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadPhoto(f);
                    }}
                  />
                </label>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Sign in to add a reference photo.</p>
            )}
          </div>
          )}

          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price</span>
              <span>{inr(basePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customisation ({setup.customisation_pct}%)</span>
              <span>+{inr(charge)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>You pay (each)</span>
              <span>{inr(basePrice + charge)}</span>
            </div>
          </div>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            <li>
              Customised pieces are not returnable (a damaged, defective or wrong item can be reported within 24 hours of
              delivery).
            </li>
            {/* Only after Add to cart, and only what has no box of its own. */}
            {showErrors && "error" in preview && !preview.fieldErrors && <li className="text-destructive">{preview.error}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
