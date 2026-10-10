import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatShortDate } from "@/lib/warehouse";
import { WarehouseInfo } from "./shared";

export interface WarehouseSettingsRow {
  warehouse_routing_enabled: boolean;
  default_prep_days: number;
  warehouse_handling_days: number;
  warehouse_cutoff_hour: number;
  warehouse_max_wait_days: number;
  warehouse_inbound_transit_days: number;
}

interface Props {
  warehouse: WarehouseInfo | null;
  settings: WarehouseSettingsRow | null;
  holidays: { holiday_date: string; name: string }[];
  onSaved: () => void;
}

const ADDRESS_FIELDS: [string, string][] = [
  ["address_line1", "Address line 1"],
  ["address_line2", "Address line 2"],
  ["city", "City"],
  ["state", "State"],
  ["pincode", "PIN code"],
];

// Admin only: where the warehouse is, its rules, holidays and staff.
export function WarehouseSettingsTab({ warehouse, settings, holidays, onSaved }: Props) {
  const [details, setDetails] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<Record<string, string>>({});
  const [routing, setRouting] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [staff, setStaff] = useState<{ user_id: string; email: string; added_at: string }[]>([]);
  const [staffEmail, setStaffEmail] = useState("");

  useEffect(() => {
    if (warehouse) {
      setDetails({
        name: warehouse.name,
        contact_name: warehouse.contact_name,
        contact_phone: warehouse.contact_phone,
        contact_email: warehouse.contact_email,
        ...Object.fromEntries(ADDRESS_FIELDS.map(([k]) => [k, warehouse.address?.[k] ?? ""])),
      });
    }
  }, [warehouse]);

  useEffect(() => {
    if (settings) {
      setRouting(settings.warehouse_routing_enabled);
      setRules({
        default_prep_days: String(settings.default_prep_days),
        warehouse_handling_days: String(settings.warehouse_handling_days),
        warehouse_cutoff_hour: String(settings.warehouse_cutoff_hour),
        warehouse_max_wait_days: String(settings.warehouse_max_wait_days),
        warehouse_inbound_transit_days: String(settings.warehouse_inbound_transit_days),
      });
    }
  }, [settings]);

  const loadStaff = async () => {
    const { data, error } = await supabase.rpc("admin_list_warehouse_staff");
    if (!error) setStaff((data ?? []) as typeof staff);
  };
  useEffect(() => {
    loadStaff();
  }, []);

  const saveDetails = async () => {
    if (!warehouse) return;
    if (!/^\d{6}$/.test(details.pincode ?? "")) return toast.error("Enter a 6-digit PIN code");
    if (!/^\d{10}$/.test((details.contact_phone ?? "").replace(/\D/g, "").slice(-10))) return toast.error("Enter a 10-digit phone number");
    setSaving("details");
    const { error } = await supabase
      .from("warehouses")
      .update({
        name: details.name.trim(),
        contact_name: details.contact_name.trim(),
        contact_phone: details.contact_phone.replace(/\D/g, "").slice(-10),
        contact_email: details.contact_email.trim(),
        address: {
          ...Object.fromEntries(ADDRESS_FIELDS.map(([k]) => [k, (details[k] ?? "").trim()])),
          country: "India",
        },
      })
      .eq("id", warehouse.id);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Warehouse saved - a changed address is registered with the courier on the next booking");
    onSaved();
  };

  const saveRules = async () => {
    setSaving("rules");
    const n = (k: string) => Math.round(Number(rules[k]));
    const { error } = await supabase
      .from("platform_settings")
      .update({
        warehouse_routing_enabled: routing,
        default_prep_days: n("default_prep_days"),
        warehouse_handling_days: n("warehouse_handling_days"),
        warehouse_cutoff_hour: n("warehouse_cutoff_hour"),
        warehouse_max_wait_days: n("warehouse_max_wait_days"),
        warehouse_inbound_transit_days: n("warehouse_inbound_transit_days"),
      })
      .eq("id", true);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Rules saved");
    onSaved();
  };

  const addHoliday = async () => {
    if (!holidayDate || !holidayName.trim()) return;
    const { error } = await supabase.from("warehouse_holidays").insert({ holiday_date: holidayDate, name: holidayName.trim() });
    if (error) return toast.error(error.message);
    setHolidayDate("");
    setHolidayName("");
    onSaved();
  };

  const removeHoliday = async (date: string) => {
    const { error } = await supabase.from("warehouse_holidays").delete().eq("holiday_date", date);
    if (error) return toast.error(error.message);
    onSaved();
  };

  const setStaffMember = async (email: string, enabled: boolean) => {
    const { error } = await supabase.rpc("admin_set_warehouse_staff", { _email: email, _enabled: enabled });
    if (error) return toast.error(error.message);
    toast.success(enabled ? "Added to warehouse staff" : "Removed from warehouse staff");
    setStaffEmail("");
    loadStaff();
  };

  const ruleField = (key: string, label: string, help: string, max: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`wr-${key}`}>{label}</Label>
      <Input
        id={`wr-${key}`}
        type="number"
        min={0}
        max={max}
        value={rules[key] ?? ""}
        onChange={(e) => setRules((r) => ({ ...r, [key]: e.target.value }))}
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Warehouse</CardTitle>
          <CardDescription>The courier collects from and delivers to this address. Phone is what couriers call.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ["name", "Name"],
            ["contact_name", "Contact name"],
            ["contact_phone", "Phone (10 digits)"],
            ["contact_email", "Email"],
            ...ADDRESS_FIELDS,
          ].map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`wd-${k}`}>{label}</Label>
              <Input id={`wd-${k}`} value={details[k] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [k]: e.target.value }))} />
            </div>
          ))}
          <Button onClick={saveDetails} disabled={saving === "details" || !warehouse}>
            {saving === "details" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save warehouse
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
            <CardDescription>Used for delivery dates, dispatch deadlines and overdue alerts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Send new orders through the warehouse</p>
                <p className="text-xs text-muted-foreground">
                  Off: new orders ship straight from the boutique, as before. Orders already placed keep their route.
                </p>
              </div>
              <Switch checked={routing} onCheckedChange={setRouting} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {ruleField("warehouse_handling_days", "Days at the warehouse", "Working days to check and repack (agreed: 1).", 10)}
              {ruleField("warehouse_cutoff_hour", "Cut-off hour (0-23)", "Parcels received from this hour count from the next day (agreed: 17 = 5pm).", 23)}
              {ruleField("warehouse_max_wait_days", "Wait limit (days)", "How long past its expected date a parcel may be late before admin is alerted (agreed: 3).", 30)}
              {ruleField("default_prep_days", "Default preparation (days)", "For boutiques that haven't set their own (agreed: 2).", 60)}
              {ruleField("warehouse_inbound_transit_days", "Courier days to the warehouse", "Planning figure until a boutique books its parcel.", 15)}
            </div>
            <Button onClick={saveRules} disabled={saving === "rules"}>
              {saving === "rules" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save rules
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Holidays</CardTitle>
            <CardDescription>The warehouse is closed on Sundays and these days - they don't count as working days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className="w-44" />
              <Input placeholder="e.g. Diwali" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} className="flex-1 min-w-[140px]" />
              <Button variant="outline" onClick={addHoliday} disabled={!holidayDate || !holidayName.trim()}>
                Add
              </Button>
            </div>
            {holidays.length === 0 ? (
              <p className="text-xs text-muted-foreground">No holidays listed.</p>
            ) : (
              <div className="space-y-1">
                {holidays.map((h) => (
                  <div key={h.holiday_date} className="flex items-center justify-between text-sm">
                    <span>
                      {formatShortDate(h.holiday_date)} · {h.name}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeHoliday(h.holiday_date)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Warehouse staff</CardTitle>
            <CardDescription>
              Staff see only the warehouse screens (receive, inspect, pack, book). They must sign up first with this email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="staff@email.com" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} />
              <Button variant="outline" className="gap-1" onClick={() => setStaffMember(staffEmail.trim(), true)} disabled={!staffEmail.trim()}>
                <UserPlus className="h-4 w-4" /> Add
              </Button>
            </div>
            {staff.length === 0 ? (
              <p className="text-xs text-muted-foreground">No warehouse staff yet - admins can use the warehouse screens too.</p>
            ) : (
              staff.map((s) => (
                <div key={s.user_id} className="flex items-center justify-between text-sm">
                  <span>{s.email}</span>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setStaffMember(s.email, false)}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
