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
// details that go on every e-way bill (and the bulk JSON).
export function EwaySettingsTab({ onSaved }: { onSaved?: () => void }) {
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
