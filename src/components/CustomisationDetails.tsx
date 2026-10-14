import { useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  customisationPrice,
  inr,
  measurementLabel,
  MEASUREMENTS,
  PHOTO_BUCKET,
  type CustomisationChoice,
} from "@/lib/customisation";

// What the customer asked for on a customised order line (or cart line):
// options with prices, their measurements, note and reference photo. The
// boutique makes the piece from this.

function ReferencePhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => live && setUrl(data?.signedUrl ?? null));
    return () => {
      live = false;
    };
  }, [path]);
  if (!url) return <div className="h-16 w-16 rounded bg-muted animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open reference photo">
      <img src={url} alt="Customer's reference photo" className="h-16 w-16 rounded object-cover border border-border" />
    </a>
  );
}

export function CustomisationDetails({
  customisation,
  showPrices = true,
  className,
}: {
  customisation: CustomisationChoice | null | undefined;
  showPrices?: boolean;
  className?: string;
}) {
  const c = customisation;
  if (!c) return null;
  // In the order the customer filled them in.
  const order = (k: string) => {
    const i = MEASUREMENTS.findIndex((m) => m.key === k);
    return i === -1 ? MEASUREMENTS.length : i;
  };
  const measurements = Object.entries(c.custom_size?.measurements ?? {})
    .filter(([, v]) => String(v).trim())
    .sort(([a], [b]) => order(a) - order(b));
  return (
    <div className={cn("rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs space-y-1.5", className)}>
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Scissors className="h-3.5 w-3.5" /> Customised
        {showPrices && customisationPrice(c) > 0 && (
          <span className="font-normal text-muted-foreground">(+{inr(customisationPrice(c))} each)</span>
        )}
      </p>
      {(c.custom_size || c.options.length > 0) && (
        <ul className="space-y-0.5">
          {c.custom_size && (
            <li>
              Custom size{showPrices ? ` · +${inr(c.custom_size.price)}` : ""}
            </li>
          )}
          {c.options.map((o) => (
            <li key={o.id}>
              {o.label}
              {showPrices ? ` · +${inr(o.price)}` : ""}
            </li>
          ))}
        </ul>
      )}
      {measurements.length > 0 && (
        <dl className="flex flex-wrap gap-x-3 gap-y-0.5">
          {measurements.map(([k, v]) => (
            <div key={k} className="flex gap-1 whitespace-nowrap">
              <dt className="text-muted-foreground">{measurementLabel(k)}</dt>
              <dd className="font-medium tabular-nums">{v}"</dd>
            </div>
          ))}
        </dl>
      )}
      {c.note && <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Note: </span>{c.note}</p>}
      {c.photo_path && <ReferencePhoto path={c.photo_path} />}
      {c.days > 0 && <p className="text-muted-foreground">Takes {c.days} extra day{c.days === 1 ? "" : "s"} to make</p>}
    </div>
  );
}
