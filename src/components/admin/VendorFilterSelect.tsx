import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_VENDORS = "__all__";

interface VendorOption {
  id: string;
  name: string;
}

interface VendorFilterSelectProps {
  value: string | null;
  onChange: (vendorId: string | null) => void;
  className?: string;
}

// Shared vendor picker for the admin views (Products, Inventory, Analytics,
// Orders, Returns, Payments) so a super admin can isolate one vendor's slice
// instead of always seeing every vendor mixed together.
export function VendorFilterSelect({ value, onChange, className }: VendorFilterSelectProps) {
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => {
        if (error) return;
        setVendors((data || []) as VendorOption[]);
      });
  }, []);

  return (
    <Select
      value={value ?? ALL_VENDORS}
      onValueChange={(v) => onChange(v === ALL_VENDORS ? null : v)}
    >
      <SelectTrigger className={className ?? "w-56 h-9"}>
        <SelectValue placeholder="All Vendors" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VENDORS}>All Vendors</SelectItem>
        {vendors.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
