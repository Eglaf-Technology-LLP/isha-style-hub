import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatPayoutDate, todayIst } from "@/lib/payoutDates";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/format";

// Cash on Delivery money: the courier collects the cash, Shiprocket remits
// it to AllBoutiqs, AllBoutiqs pays the boutique. A boutique sees its own
// COD orders (vendorId); admins see every boutique's, can check Shiprocket
// now and mark cash received by hand (bank UTR) when Shiprocket is late.

type CodRow = Database["public"]["Functions"]["cod_tracking"]["Returns"][number];
type Stage = "awaiting_delivery" | "collected" | "received" | "paid" | "not_collected" | "cancelled";

const money = (n: number) => `${formatINR(Number(n))}`;
const day = (d: string | null) => (d ? formatDate(new Date(d)) : "");
const ALL = "__all__";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "collected", label: "Collected" },
  { stage: "received", label: "Received by AllBoutiqs" },
  { stage: "paid", label: "Paid to boutique" },
];
const STAGE_FILTERS: [string, string][] = [
  [ALL, "All COD orders"],
  ["awaiting_delivery", "Not delivered yet"],
  ["collected", "Collected - waiting for Shiprocket"],
  ["received", "Received - payout due"],
  ["paid", "Paid to boutique"],
];

function StageTrack({ stage }: { stage: Stage }) {
  if (stage === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  if (stage === "not_collected") return <Badge variant="outline">Returned to boutique - no cash</Badge>;
  if (stage === "awaiting_delivery") return <span className="text-xs text-muted-foreground">Not delivered yet</span>;
  const reached = STEPS.findIndex((s) => s.stage === stage);
  return (
    <ol className="flex items-center gap-1" aria-label={`COD status: ${STEPS[reached].label}`}>
      {STEPS.map((s, i) => (
        <li key={s.stage} className="flex items-center gap-1">
          {i > 0 && <span className={cn("h-px w-3", i <= reached ? "bg-emerald-500" : "bg-border")} />}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap",
              i < reached && "border-emerald-200 bg-emerald-50 text-emerald-800",
              i === reached && "border-emerald-600 bg-emerald-600 text-white",
              i > reached && "border-border text-muted-foreground",
            )}
          >
            {i <= reached && <Check className="h-3 w-3" />}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Tile({ label, amount, count, hint }: { label: string; amount: number; count: number; hint: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{money(amount)}</p>
      <p className="text-xs text-muted-foreground">
        {count} order{count === 1 ? "" : "s"} · {hint}
      </p>
    </div>
  );
}

export function CodTrackingCard({ vendorId, admin = false }: { vendorId?: string; admin?: boolean }) {
  const [rows, setRows] = useState<CodRow[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [boutique, setBoutique] = useState<string>(vendorId ?? ALL);
  const [stageFilter, setStageFilter] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markOpen, setMarkOpen] = useState(false);
  const [utr, setUtr] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayIst());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("cod_tracking", { _vendor_id: boutique === ALL ? null : boutique });
    if (error) toast.error(error.message);
    setRows(data ?? []);
    setSelected(new Set());
    setLoading(false);
  }, [boutique]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!admin) return;
    supabase.from("vendors").select("id, name").order("name").then(({ data }) => setVendors(data ?? []));
  }, [admin]);

  const totals = useMemo(() => {
    const by = (s: Stage) => rows.filter((r) => r.stage === s);
    const amount = (rs: CodRow[]) => rs.reduce((sum, r) => sum + Number(r.cod_amount), 0);
    const payable = (rs: CodRow[]) => rs.reduce((sum, r) => sum + Number(r.net_payable), 0);
    return {
      collected: { rows: by("collected"), amount: amount(by("collected")) },
      received: { rows: by("received"), amount: payable(by("received")) },
      paid: { rows: by("paid"), amount: payable(by("paid")) },
    };
  }, [rows]);

  const shown = stageFilter === ALL ? rows : rows.filter((r) => r.stage === stageFilter);
  const selectable = (r: CodRow) => admin && r.stage === "collected";

  const checkShiprocket = async () => {
    setSyncing(true);
    const { data, errorMessage } = await invokeEdgeFunction<{
      checked: number;
      cod_parcels: number;
      remitted: number;
      errors: { error: string }[];
    }>("shiprocket-cod-sync", {});
    setSyncing(false);
    if (errorMessage) return toast.error(errorMessage);
    toast.success(`Checked ${data?.cod_parcels ?? 0} COD parcel(s) with Shiprocket`, {
      description: [
        `${data?.remitted ?? 0} remitted to AllBoutiqs`,
        data?.errors.length ? `${data.errors.length} could not be read: ${data.errors.map((e) => e.error).join("; ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
    load();
  };

  const markReceived = async () => {
    setSaving(true);
    const { data, error } = await supabase.rpc("mark_cod_received", {
      _vendor_order_ids: [...selected],
      _utr: utr.trim(),
      _received_on: receivedOn,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Marked COD cash received for ${data} order${data === 1 ? "" : "s"}`);
    setMarkOpen(false);
    setUtr("");
    load();
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="max-w-2xl">
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" /> Cash on Delivery money
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            The courier collects the cash, Shiprocket sends it to AllBoutiqs, and{" "}
            {admin ? "the boutique is paid" : "you are paid"} in the next weekly payout after it arrives. Shiprocket's
            COD charge on each parcel is taken from Shiprocket and shown below.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <Select value={boutique} onValueChange={setBoutique}>
              <SelectTrigger className="w-48" aria-label="Boutique">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All boutiques</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-60" aria-label="COD status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_FILTERS.map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {admin && (
            <Button variant="outline" onClick={checkShiprocket} disabled={syncing} className="gap-2">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check Shiprocket now
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile
            label="Collected - waiting for Shiprocket"
            amount={totals.collected.amount}
            count={totals.collected.rows.length}
            hint="cash with the courier / Shiprocket"
          />
          <Tile
            label={admin ? "Received by AllBoutiqs - payout due" : "Received by AllBoutiqs - your payout due"}
            amount={totals.received.amount}
            count={totals.received.rows.length}
            hint={admin ? "to pay boutiques" : "paid in the next weekly payout"}
          />
          <Tile
            label={admin ? "Paid to boutiques" : "Paid to you"}
            amount={totals.paid.amount}
            count={totals.paid.rows.length}
            hint="net payout"
          />
        </div>

        {admin && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <span>
              {selected.size} order{selected.size === 1 ? "" : "s"} selected
            </span>
            <Button size="sm" onClick={() => setMarkOpen(true)}>
              Mark cash received
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {rows.length === 0 ? "No Cash on Delivery orders yet." : "No COD orders at this stage."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {admin && <TableHead className="w-8" />}
                  <TableHead>Order</TableHead>
                  {admin && <TableHead>Boutique</TableHead>}
                  <TableHead className="text-right">Cash collected</TableHead>
                  <TableHead className="text-right">Shiprocket COD charge</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.vendor_order_id} data-focus-id={r.vendor_order_id}>
                    {admin && (
                      <TableCell>
                        {selectable(r) && (
                          <Checkbox
                            aria-label={`Select ${r.order_number}`}
                            checked={selected.has(r.vendor_order_id)}
                            onCheckedChange={(v) => toggle(r.vendor_order_id, v === true)}
                          />
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="font-mono text-sm">{r.order_number}</div>
                      <div className="text-xs text-muted-foreground">{day(r.order_date)}</div>
                    </TableCell>
                    {admin && (
                      <TableCell className="text-sm">
                        {r.boutique_name}
                        <div className="text-xs text-muted-foreground">{r.boutique_code}</div>
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums text-sm">{money(r.cod_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {Number(r.cod_charge) > 0 ? money(r.cod_charge) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <StageTrack stage={r.stage as Stage} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground space-y-0.5 min-w-[200px]">
                      {r.delivered_at && <div>Delivered {day(r.delivered_at)}{r.awb_code ? ` · AWB ${r.awb_code}` : ""}</div>}
                      {r.stage === "collected" && (
                        <div>Waiting for Shiprocket's remittance{r.shiprocket_status ? ` (${r.shiprocket_status})` : ""}</div>
                      )}
                      {r.cod_received_at && (
                        <div>
                          Received {day(r.cod_received_at)}
                          {r.cod_received_utr ? ` · UTR ${r.cod_received_utr}` : ""}
                          {admin ? ` · ${r.cod_received_source === "manual" ? "marked by admin" : "from Shiprocket"}` : ""}
                        </div>
                      )}
                      {r.stage === "received" && r.payout_on && <div>Payout on {formatPayoutDate(r.payout_on)} · {money(r.net_payable)}</div>}
                      {r.stage === "paid" && (
                        <div>
                          Paid {day(r.paid_at)} · {money(r.net_payable)}
                          {r.payout_utr ? ` · UTR ${r.payout_utr}` : ""}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={markOpen} onOpenChange={setMarkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark COD cash received</DialogTitle>
            <DialogDescription>
              For {selected.size} order{selected.size === 1 ? "" : "s"} whose cash reached AllBoutiqs' bank but isn't
              showing from Shiprocket yet. The boutique is then paid in the next weekly payout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cod-utr">Bank UTR / reference</Label>
              <Input id="cod-utr" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. UTIBR52026101200123" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cod-date">Received on</Label>
              <Input id="cod-date" type="date" max={todayIst()} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={markReceived} disabled={saving || !utr.trim() || !receivedOn} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Mark received
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
