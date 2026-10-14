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
  customisationPrice,
  inr,
  MEASUREMENTS,
  PHOTO_BUCKET,
  type CustomisationChoice,
  type ProductCustomisationSetup,
} from "@/lib/customisation";

// Product page: the customer asks for this piece to be customised - made to
// their measurements and/or with the boutique's priced options, plus a note
// and a reference photo - and sees exactly what it adds to the price.

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

// The customer's choice for the cart, or what's missing.
export function buildCustomisation(
  setup: ProductCustomisationSetup,
  s: CustomiserState,
): { choice: CustomisationChoice | null } | { error: string } {
  if (!setup.customisable || !s.enabled) return { choice: null };
  const options = setup.customisation_options.filter((o) => s.optionIds.includes(o.id));
  let custom_size: CustomisationChoice["custom_size"] = null;
  if (s.customSize && setup.custom_size_price != null) {
    const missing = MEASUREMENTS.filter((m) => m.required && !String(s.measurements[m.key] ?? "").trim());
    if (missing.length) return { error: `Please enter your ${missing.map((m) => m.label.toLowerCase()).join(", ")}` };
    const measurements = Object.fromEntries(
      Object.entries(s.measurements).filter(([, v]) => String(v).trim()).map(([k, v]) => [k, String(v).trim()]),
    );
    custom_size = { price: setup.custom_size_price, unit: "in", measurements };
  }
  const note = s.note.trim() || null;
  if (!custom_size && options.length === 0 && !note && !s.photoPath) {
    return { error: "Choose how you'd like it customised, or switch customisation off" };
  }
  return { choice: { options, custom_size, note, photo_path: s.photoPath, days: setup.customisation_days ?? 0 } };
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
  basePrice,
  value,
  onChange,
  userId,
}: {
  setup: ProductCustomisationSetup;
  basePrice: number;
  value: CustomiserState;
  onChange: (next: CustomiserState) => void;
  userId: string | null;
}) {
  const [uploading, setUploading] = useState(false);
  if (!setup.customisable) return null;
  const set = <K extends keyof CustomiserState>(k: K, v: CustomiserState[K]) => onChange({ ...value, [k]: v });

  const preview = buildCustomisation(setup, value);
  const extra = value.enabled
    ? customisationPrice({
        options: setup.customisation_options.filter((o) => value.optionIds.includes(o.id)),
        custom_size: value.customSize && setup.custom_size_price != null ? { price: setup.custom_size_price, unit: "in", measurements: {} } : null,
      })
    : 0;

  const uploadPhoto = async (file: File) => {
    if (!userId) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("Please choose a JPG, PNG or WebP photo");
    if (file.size > 5 * 1024 * 1024) return toast.error("The photo must be 5 MB or smaller");
    setUploading(true);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) return toast.error(error.message || "Couldn't upload the photo");
    set("photoPath", path);
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-4" data-testid="product-customiser">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" /> Customise this piece
          </p>
          <p className="text-sm text-muted-foreground">Made to your measurements or with the changes you choose.</p>
        </div>
        <Switch aria-label="Customise this piece" checked={value.enabled} onCheckedChange={(v) => set("enabled", v)} />
      </div>

      {value.enabled && (
        <div className="space-y-4 border-t border-border pt-4">
          {setup.custom_size_price != null && (
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2 text-sm">
                  <Checkbox checked={value.customSize} onCheckedChange={(v) => set("customSize", v === true)} />
                  Make it to my measurements
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {setup.custom_size_price > 0 ? `+${inr(setup.custom_size_price)}` : "Free"}
                </span>
              </label>
              {value.customSize && (
                <div className="space-y-2 rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">In inches, measured over light clothing. * required</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {MEASUREMENTS.map((m) => (
                      <div key={m.key} className="space-y-1">
                        <Label htmlFor={`cz-m-${m.key}`} className="text-xs">
                          {m.label}
                          {m.required ? " *" : ""}
                        </Label>
                        <Input
                          id={`cz-m-${m.key}`}
                          inputMode="decimal"
                          placeholder="in"
                          value={value.measurements[m.key] ?? ""}
                          onChange={(e) =>
                            set("measurements", { ...value.measurements, [m.key]: e.target.value.replace(/[^0-9.]/g, "").slice(0, 5) })
                          }
                          className="h-9"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {setup.customisation_options.length > 0 && (
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
                    accept="image/jpeg,image/png,image/webp"
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

          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price</span>
              <span>{inr(basePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customisation</span>
              <span>+{inr(extra)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>You pay (each)</span>
              <span>{inr(basePrice + extra)}</span>
            </div>
          </div>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {(setup.customisation_days ?? 0) > 0 && (
              <li>Takes {setup.customisation_days} extra day{setup.customisation_days === 1 ? "" : "s"} to make.</li>
            )}
            <li>Customised pieces are made for you, so they can't be returned or exchanged.</li>
            {"error" in preview && (value.customSize || value.optionIds.length > 0) && <li className="text-destructive">{preview.error}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
