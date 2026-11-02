import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VendorOption {
  id: string;
  name: string;
  boutique_code: string;
  status: string;
}

interface ProductVendorSelectProps {
  id?: string;
  value: string | null;
  onChange: (vendorId: string) => void;
  // A product that already belongs to a boutique stays with it.
  locked?: boolean;
}

// Every product an admin adds belongs to a boutique. The storefront only
// shows approved boutiques' products, so only those are offered - plus the
// product's current boutique when editing, whatever its status.
export function ProductVendorSelect({ id, value, onChange, locked }: ProductVendorSelectProps) {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name, boutique_code, status")
      .order("name")
      .then(({ data, error }) => {
        if (!error) setVendors((data || []) as VendorOption[]);
        setLoaded(true);
      });
  }, []);

  const options = vendors.filter((v) => v.status === "approved" || v.id === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Vendor (boutique) *</Label>
      <Select value={value ?? ""} onValueChange={onChange} disabled={locked}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select the boutique this product belongs to" />
        </SelectTrigger>
        <SelectContent>
          {options.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name} · {v.boutique_code}
              {v.status !== "approved" ? ` (${v.status})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {locked && <p className="text-xs text-muted-foreground">A product stays with the boutique it was added for.</p>}
      {loaded && options.length === 0 && (
        <p className="text-xs text-destructive">No approved boutiques yet - approve one under Vendors first.</p>
      )}
    </div>
  );
}
