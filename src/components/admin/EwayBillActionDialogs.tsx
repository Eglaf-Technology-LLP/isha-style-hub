import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { EWAY_LEG_LABELS, EWAY_LEGS, EwayBillLeg, formatEwbNumber, orderRefOf, localInput } from "@/lib/ewayBill";
import type { AdminEwayBill } from "@/hooks/useEwayBillsAdmin";

// ---------- extend ----------

// Extended on the portal (from 8 hours before to 8 hours after it runs
// out): the new end, so the reminders stop.
export function EwayBillExtendDialog({ bill, onSaved }: { bill: AdminEwayBill; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { errorMessage } = await invokeEdgeFunction("eway-bill-actions", {
      action: "extend",
      eway_bill_id: bill.id,
      valid_until: new Date(until).toISOString(),
    });
    setSaving(false);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    toast.success("New validity saved");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 text-xs"
        onClick={() => {
          setUntil(bill.valid_until ? localInput(new Date(new Date(bill.valid_until).getTime() + 86_400_000)) : "");
          setOpen(true);
        }}
      >
        Extend
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Extend {formatEwbNumber(bill.ewb_number)}</DialogTitle>
          <DialogDescription>
            Extend it on ewaybillgst.gov.in (e-Waybill &gt; Extend Validity) first - allowed from 8 hours before to 8 hours
            after it runs out. Then enter the new end the portal shows.
            {bill.valid_until && <> Currently until {formatDateTime(bill.valid_until)}.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="ewb-extend">New valid until</Label>
          <Input id="ewb-extend" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!until || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- a request by hand ----------

interface PartOption {
  id: string;
  status: string;
  vendorName: string;
}
interface ReturnOption {
  id: string;
  label: string;
}
interface SendBackOption {
  id: string;
  vendorOrderId: string | null;
  label: string;
}

const NONE = "none";

// Anything the automatic requests don't cover - most often a return or
// send-back: pick the order, the boutique's part, the movement and what it
// belongs to. The document (delivery challan) is issued and it joins the list.
export function EwayBillCreateDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [finding, setFinding] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [returns, setReturns] = useState<ReturnOption[]>([]);
  const [sendBacks, setSendBacks] = useState<SendBackOption[]>([]);
  const [partId, setPartId] = useState("");
  const [leg, setLeg] = useState<EwayBillLeg | "">("");
  const [forWhat, setForWhat] = useState(NONE);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setRef("");
    setOrderId(null);
    setParts([]);
    setReturns([]);
    setSendBacks([]);
    setPartId("");
    setLeg("");
    setForWhat(NONE);
  };

  const find = async () => {
    const hex = ref.replace(/[^0-9a-f]/gi, "").toLowerCase();
    if (hex.length !== 8) {
      toast.error("Enter the 8-character order number, e.g. #3F2A91C0");
      return;
    }
    setFinding(true);
    // An order number is the start of the order's id.
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .gte("id", `${hex}-0000-0000-0000-000000000000`)
      .lte("id", `${hex}-ffff-ffff-ffff-ffffffffffff`)
      .limit(2);
    if (!orders?.length) {
      setFinding(false);
      toast.error("No order with that number");
      return;
    }
    const id = orders[0].id;
    const [{ data: vos }, { data: rrs }, { data: sbs }] = await Promise.all([
      supabase.from("vendor_orders").select("id, status, vendors(name)").eq("order_id", id),
      supabase.from("return_requests").select("id, request_type, status, created_at").eq("order_id", id).order("created_at"),
      supabase.from("boutique_send_backs").select("id, vendor_order_id, reason, status, created_at").eq("order_id", id).order("created_at"),
    ]);
    setFinding(false);
    setOrderId(id);
    setParts(
      (vos ?? []).map((v) => ({ id: v.id, status: v.status, vendorName: (v.vendors as { name?: string } | null)?.name ?? "Boutique" })),
    );
    setReturns(
      (rrs ?? []).map((r) => ({ id: r.id, label: `${r.request_type === "exchange" ? "Exchange" : "Return"} · ${r.status.replace(/_/g, " ")} · ${formatDateTime(r.created_at)}` })),
    );
    setSendBacks(
      (sbs ?? []).map((s) => ({
        id: s.id,
        vendorOrderId: s.vendor_order_id,
        label: `Send-back · ${String(s.reason).replace(/_/g, " ")} · ${s.status}`,
      })),
    );
    setPartId(vos?.length === 1 ? vos[0].id : "");
  };

  const create = async () => {
    setCreating(true);
    const [kind, id] = forWhat === NONE ? [NONE, null] : forWhat.split(":");
    const { errorMessage } = await invokeEdgeFunction("eway-bill-actions", {
      action: "create",
      vendor_order_id: partId,
      leg,
      return_request_id: kind === "rr" ? id : null,
      send_back_id: kind === "sb" ? id : null,
    });
    setCreating(false);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    toast.success("Request added - it's in the list and the next JSON download");
    setOpen(false);
    reset();
    onCreated();
  };

  const sendBacksForPart = sendBacks.filter((s) => s.vendorOrderId === partId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> New request
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New e-way bill request</DialogTitle>
          <DialogDescription>
            Orders, warehouse parcels, send-backs and return pickups over the limit are asked for automatically. Use this
            for anything else, e.g. a return sent by another route.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="space-y-1 flex-1">
              <Label htmlFor="ewb-new-order">Order number</Label>
              <Input
                id="ewb-new-order"
                placeholder="#3F2A91C0"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && find()}
              />
            </div>
            <Button variant="outline" onClick={find} disabled={finding}>
              {finding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Find
            </Button>
          </div>

          {orderId && (
            <>
              <div className="space-y-1">
                <Label>Boutique's part of order {orderRefOf(orderId)}</Label>
                <Select value={partId} onValueChange={(v) => { setPartId(v); setForWhat(NONE); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick the boutique" />
                  </SelectTrigger>
                  <SelectContent>
                    {parts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.vendorName} ({p.status.replace(/_/g, " ")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Movement</Label>
                <Select value={leg} onValueChange={(v) => setLeg(v as EwayBillLeg)}>
                  <SelectTrigger>
                    <SelectValue placeholder="From where to where" />
                  </SelectTrigger>
                  <SelectContent>
                    {EWAY_LEGS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {EWAY_LEG_LABELS[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Goods</Label>
                <Select value={forWhat} onValueChange={setForWhat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Everything in this part (as invoiced)</SelectItem>
                    {returns.map((r) => (
                      <SelectItem key={r.id} value={`rr:${r.id}`}>
                        {r.label}
                      </SelectItem>
                    ))}
                    {sendBacksForPart.map((s) => (
                      <SelectItem key={s.id} value={`sb:${s.id}`}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A return or send-back carries only its items, on a delivery challan of its own.
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!partId || !leg || creating}>
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
