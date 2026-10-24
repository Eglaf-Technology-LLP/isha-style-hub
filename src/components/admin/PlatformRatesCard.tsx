import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarPlus, Loader2, Percent, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformRates, WEEKDAYS, type PlatformRates } from "@/hooks/usePlatformRates";
import { formatDate } from "@/lib/dates";

type RateForm = Omit<PlatformRates, "id" | "created_at" | "created_by">;

const PCT_FIELDS: { key: keyof RateForm; label: string; help?: string }[] = [
  { key: "marketplace_commission_pct", label: "Marketplace commission %", help: "of product value" },
  { key: "technology_fee_pct", label: "Technology & service fee %", help: "of product value" },
  { key: "fee_gst_pct", label: "GST on AllBoutiqs fees %" },
  { key: "payment_gateway_fee_pct", label: "Payment gateway fee %", help: "online orders only" },
  { key: "gst_tcs_pct", label: "GST TCS %", help: "of net taxable value" },
  { key: "tds_pct", label: "Income-tax TDS %" },
  { key: "tds_no_pan_pct", label: "TDS % without PAN" },
];

const pct = (n: number | string) => `${Number(n)}%`;
const time12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

function Summary({ r }: { r: PlatformRates }) {
  const rows: [string, string][] = [
    ["Marketplace commission", pct(r.marketplace_commission_pct)],
    ["Technology & service fee", pct(r.technology_fee_pct)],
    ["GST on AllBoutiqs fees", `${pct(r.fee_gst_pct)} · SAC ${r.fee_sac_code}`],
    ["Payment gateway fee", `${pct(r.payment_gateway_fee_pct)} (online only)`],
    ["Courier & logistics", r.charge_courier_to_boutique ? "Charged to boutique" : "Borne by AllBoutiqs"],
    ["GST TCS", pct(r.gst_tcs_pct)],
    ["Income-tax TDS", `${pct(r.tds_pct)} · ${pct(r.tds_no_pan_pct)} without PAN · individuals exempt up to ₹${Number(r.tds_individual_exempt_upto).toLocaleString("en-IN")}`],
    [
      "Payouts",
      `${r.payout_hold_hours}h after delivery · cut-off ${WEEKDAYS[r.payout_cutoff_weekday]} ${time12(r.payout_cutoff_time)} · paid ${WEEKDAYS[r.payout_weekday]}`,
    ],
  ];
  return (
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-border/60 pb-1">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// Admin: every fee, tax and payout timing, each set with the date it
// applies from. Invoices and statements use the rates in force on their
// date, so started versions can't be changed - schedule a new one.
export function PlatformRatesCard() {
  const { versions, current, today, loading, refetch } = usePlatformRates();
  const [form, setForm] = useState<RateForm | null>(null);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    if (!current) return;
    const { id: _id, created_at: _c, created_by: _b, ...rest } = current;
    setForm({ ...rest, effective_from: today, note: "" });
  };

  const save = async () => {
    if (!form) return;
    if (form.effective_from < today) {
      toast.error("New rates must start today or later");
      return;
    }
    setSaving(true);
    const existing = versions.find((v) => v.effective_from === form.effective_from);
    const { error } = existing
      ? await supabase.from("platform_rates").update(form).eq("id", existing.id)
      : await supabase.from("platform_rates").insert(form);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Rates saved - they apply from ${formatDate(new Date(form.effective_from))}`);
    setForm(null);
    refetch();
  };

  const remove = async (v: PlatformRates) => {
    const { error } = await supabase.from("platform_rates").delete().eq("id", v.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Scheduled rates removed");
      refetch();
    }
  };

  const set = <K extends keyof RateForm>(k: K, v: RateForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" /> Fees, taxes &amp; payout timing
          </h3>
          <p className="text-sm text-muted-foreground">
            Each set of rates applies from its start date. Orders, fee invoices and statements keep the rates of their
            own date.
          </p>
        </div>
        <Button onClick={openNew} disabled={!current} className="gap-2">
          <CalendarPlus className="h-4 w-4" /> Schedule new rates
        </Button>
      </div>
      <CardContent className="p-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : current ? (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                In force now <Badge variant="secondary">since {formatDate(new Date(current.effective_from))}</Badge>
              </p>
              <Summary r={current} />
            </div>
            {versions.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">All versions</p>
                <ul className="divide-y divide-border rounded-md border border-border text-sm">
                  {versions.map((v) => {
                    const future = v.effective_from > today;
                    const live = v.id === current.id;
                    return (
                      <li key={v.id} className="flex items-center justify-between gap-3 p-2.5">
                        <span>
                          From {formatDate(new Date(v.effective_from))} · commission {pct(v.marketplace_commission_pct)} · tech fee{" "}
                          {pct(v.technology_fee_pct)} · TCS {pct(v.gst_tcs_pct)} · TDS {pct(v.tds_pct)}
                          {v.note ? <span className="text-muted-foreground"> · {v.note}</span> : null}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {live ? <Badge variant="secondary">In force</Badge> : future ? <Badge>Scheduled</Badge> : <Badge variant="outline">Past</Badge>}
                          {future && (
                            <Button variant="ghost" size="icon" aria-label="Remove scheduled rates" onClick={() => remove(v)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No rates set.</p>
        )}
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Schedule new rates</DialogTitle>
            <DialogDescription>
              Starts from the date you choose (today or later). Everything before it keeps the current rates.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rates-from">Applies from</Label>
                  <Input id="rates-from" type="date" min={today} value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rates-note">Note (optional)</Label>
                  <Input id="rates-note" value={form.note ?? ""} placeholder="Why the change" onChange={(e) => set("note", e.target.value)} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {PCT_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={`rates-${f.key}`}>
                      {f.label}
                      {f.help && <span className="text-muted-foreground font-normal"> ({f.help})</span>}
                    </Label>
                    <Input
                      id={`rates-${f.key}`}
                      type="number"
                      min={0}
                      step="0.001"
                      value={String(form[f.key] ?? "")}
                      onChange={(e) => set(f.key, Number(e.target.value) as never)}
                    />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label htmlFor="rates-sac">SAC code for AllBoutiqs fees</Label>
                  <Input id="rates-sac" value={form.fee_sac_code} onChange={(e) => set("fee_sac_code", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rates-tds-limit">TDS-free sales for individuals/HUF (₹ per year)</Label>
                  <Input
                    id="rates-tds-limit"
                    type="number"
                    min={0}
                    value={form.tds_individual_exempt_upto}
                    onChange={(e) => set("tds_individual_exempt_upto", Number(e.target.value))}
                  />
                </div>
              </div>
              <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                Charge courier &amp; logistics cost to the boutique
                <Switch checked={form.charge_courier_to_boutique} onCheckedChange={(v) => set("charge_courier_to_boutique", v)} />
              </label>
              <div className="grid sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rates-hold">Payable after delivery (hours)</Label>
                  <Input id="rates-hold" type="number" min={0} value={form.payout_hold_hours} onChange={(e) => set("payout_hold_hours", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cut-off day</Label>
                  <Select value={String(form.payout_cutoff_weekday)} onValueChange={(v) => set("payout_cutoff_weekday", Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.slice(1).map((d, i) => (
                        <SelectItem key={d} value={String(i + 1)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rates-cutoff">Cut-off time</Label>
                  <Input id="rates-cutoff" type="time" value={form.payout_cutoff_time.slice(0, 5)} onChange={(e) => set("payout_cutoff_time", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment day</Label>
                  <Select value={String(form.payout_weekday)} onValueChange={(v) => set("payout_weekday", Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.slice(1).map((d, i) => (
                        <SelectItem key={d} value={String(i + 1)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save rates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
