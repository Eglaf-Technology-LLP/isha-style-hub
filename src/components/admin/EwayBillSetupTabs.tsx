import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gstinChecksumOk } from "@/lib/vendorKyc";

const ID_RE = /^[0-9A-Z]{15}$/;

// A GSTIN's last character is a checksum; a TRANSIN may not follow it, so
// this only warns.
function checksumWarning(raw: string) {
  const id = raw.trim().toUpperCase();
  if (!ID_RE.test(id) || gstinChecksumOk(id)) return null;
  return (
    <p className="text-xs text-amber-700">
      This doesn't pass the GSTIN check - if it's a GSTIN there's a typo, and the portal will reject the file. Copy it from the
      portal.
    </p>
  );
}

// Admin > E-way bills > Settings: the limit and AllBoutiqs' transporter
// details, and the courier partners' transporter IDs.
export function EwaySettingsTab({ onSaved }: { onSaved?: () => void }) {
  return (
    <div className="space-y-6">
      <TransporterSettingsCard onSaved={onSaved} />
      <CourierPartnersCard />
    </div>
  );
}

// The limit and AllBoutiqs' transporter details that go on every e-way bill
// (and the bulk JSON).
function TransporterSettingsCard({ onSaved }: { onSaved?: () => void }) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [portalUserId, setPortalUserId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("eway_bill_threshold, eway_bill_transporter_id, eway_bill_transporter_name, eway_bill_portal_user_id")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setThreshold(String(Number(data.eway_bill_threshold)));
        setTransporterId(data.eway_bill_transporter_id ?? "");
        setTransporterName(data.eway_bill_transporter_name ?? "AllBoutiqs");
        setPortalUserId(data.eway_bill_portal_user_id ?? "");
        setLoaded(true);
      });
  }, []);

  const save = async () => {
    const limit = Number(threshold);
    if (!Number.isFinite(limit) || limit < 0) {
      toast.error("Enter the limit in rupees");
      return;
    }
    const id = transporterId.trim().toUpperCase();
    const userId = portalUserId.trim().toUpperCase();
    if (id && !ID_RE.test(id)) {
      toast.error("A transporter ID is 15 letters and digits (GSTIN or TRANSIN)");
      return;
    }
    if (userId && !ID_RE.test(userId)) {
      toast.error("The portal login ID is 15 letters and digits");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({
        eway_bill_threshold: limit,
        eway_bill_transporter_id: id || null,
        eway_bill_transporter_name: transporterName.trim() || "AllBoutiqs",
        eway_bill_portal_user_id: userId || null,
        updated_by: user?.id ?? null,
      })
      .eq("id", true);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("E-way bill settings saved");
      onSaved?.();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          AllBoutiqs is enrolled as a transporter on the e-way bill portal and makes every boutique's e-way bills. A
          movement whose goods (GST and delivery charge included, after the coupon) are over the limit can't be booked
          until its number is in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-1">
          <Label htmlFor="ewb-limit">Limit (₹)</Label>
          <Input id="ewb-limit" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={!loaded} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ewb-transporter-id">AllBoutiqs transporter ID</Label>
          <Input
            id="ewb-transporter-id"
            className="font-mono"
            placeholder="15 characters - GSTIN or TRANSIN"
            value={transporterId}
            onChange={(e) => setTransporterId(e.target.value)}
            disabled={!loaded}
          />
          <p className="text-xs text-muted-foreground">
            The GSTIN (or TRANSIN) AllBoutiqs signs in to ewaybillgst.gov.in with - shown at the top of the portal after you
            sign in. It goes on every e-way bill as the transporter and as the uploader of the JSON.
          </p>
          {checksumWarning(transporterId)}
        </div>
        <div className="space-y-1">
          <Label htmlFor="ewb-transporter-name">Transporter name</Label>
          <Input id="ewb-transporter-name" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} disabled={!loaded} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ewb-portal-user">Portal login GSTIN / ID (if different)</Label>
          <Input
            id="ewb-portal-user"
            className="font-mono"
            placeholder="Same as the transporter ID"
            value={portalUserId}
            onChange={(e) => setPortalUserId(e.target.value)}
            disabled={!loaded}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty unless the portal account's GSTIN differs from the transporter ID above. If the portal says "Login
            Gstin and User Gstin is Different", this (or the transporter ID) doesn't match the account you're signed in with.
          </p>
          {checksumWarning(portalUserId)}
        </div>
        <Button onClick={save} disabled={!loaded || saving}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------- courier partners' transporter IDs ----------

interface PartnerRow {
  id: string | null; // null: not saved yet
  partner: string;
  match_names: string;
  transporter_id: string;
  sort_order: number;
}

// Each courier partner's GST transporter ID. When a boutique / the warehouse
// picks a courier for a parcel on an e-way bill, the partner whose name word
// is in the courier's name ("Blue Dart Air" -> bluedart) is found here and
// its ID saved on the e-way bill (see courierTransporter on the server).
function CourierPartnersCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PartnerRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("courier_partner_transporters")
      .select("id, partner, match_names, transporter_id, sort_order")
      .order("sort_order")
      .order("partner");
    if (error) {
      toast.error(error.message);
      setRows([]);
      return;
    }
    setRows(data ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const change = (i: number, patch: Partial<PartnerRow>) =>
    setRows((list) => (list ?? []).map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async (i: number) => {
    const r = rows?.[i];
    if (!r) return;
    const partner = r.partner.trim();
    const id = r.transporter_id.trim().toUpperCase();
    if (!partner) return toast.error("Enter the courier partner's name");
    if (!ID_RE.test(id)) return toast.error("A transporter ID is 15 letters and digits (a GSTIN or the portal's TRANSIN)");
    setBusy(i);
    const row = {
      partner,
      match_names: r.match_names.trim().toLowerCase(),
      transporter_id: id,
      sort_order: Number(r.sort_order) || 0,
      updated_by: user?.id ?? null,
    };
    const { error } = r.id
      ? await supabase.from("courier_partner_transporters").update(row).eq("id", r.id)
      : await supabase.from("courier_partner_transporters").insert(row);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${partner} saved`);
    load();
  };

  const remove = async (i: number) => {
    const r = rows?.[i];
    if (!r) return;
    if (!r.id) {
      setRows((list) => (list ?? []).filter((_, idx) => idx !== i));
      return;
    }
    setBusy(i);
    const { error } = await supabase.from("courier_partner_transporters").delete().eq("id", r.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${r.partner} removed`);
    load();
  };

  const add = () =>
    setRows((list) => [
      ...(list ?? []),
      {
        id: null,
        partner: "",
        match_names: "",
        transporter_id: "",
        sort_order: ((list ?? []).reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) || 0) + 10,
      },
    ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Courier partners' transporter IDs</CardTitle>
        <CardDescription>
          When a boutique or the warehouse picks the courier for a parcel that needs an e-way bill, that courier's partner
          is found here by name ("Blue Dart Air" begins with "bluedart") and its transporter ID is saved on the e-way bill.
          AllBoutiqs makes the e-way bill as its transporter, then updates the transporter on the portal (e-Waybill &gt;
          Update Transporter) to the ID shown on the request. A courier with no partner here can't carry such a parcel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1.3fr_70px_auto] gap-2 text-xs text-muted-foreground">
              <span>Courier partner</span>
              <span>Courier names starting with</span>
              <span>Transporter ID</span>
              <span>Order</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={r.id ?? `new-${i}`} className="space-y-1">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.3fr_70px_auto] gap-2 items-center">
                  <Input value={r.partner} placeholder="Bluedart" onChange={(e) => change(i, { partner: e.target.value })} />
                  <Input
                    value={r.match_names}
                    placeholder="bluedart (commas for more)"
                    onChange={(e) => change(i, { match_names: e.target.value })}
                  />
                  <Input
                    value={r.transporter_id}
                    placeholder="15 letters and digits"
                    maxLength={15}
                    className="font-mono uppercase"
                    onChange={(e) => change(i, { transporter_id: e.target.value })}
                  />
                  <Input
                    value={String(r.sort_order)}
                    inputMode="numeric"
                    onChange={(e) => change(i, { sort_order: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-9" disabled={busy === i} onClick={() => save(i)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 text-destructive" disabled={busy === i} onClick={() => remove(i)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {!r.match_names.trim() && r.id && (
                  <p className="text-xs text-muted-foreground">Not matched to any courier (no name words) - kept for reference.</p>
                )}
                {checksumWarning(r.transporter_id)}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={add}>
              Add courier partner
            </Button>
            <p className="text-xs text-muted-foreground">
              The first partner (lowest order) whose word begins a word of the courier's name wins ("Blue Dart Air" → bluedart). Spaces and punctuation are ignored.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
