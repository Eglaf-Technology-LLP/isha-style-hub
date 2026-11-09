import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { refreshReturnWindowHours } from "@/hooks/useReturnWindowHours";

export function ReturnSettingsCard() {
  const { user } = useAuth();
  const [evidenceRequired, setEvidenceRequired] = useState<boolean | null>(null);
  const [slaHours, setSlaHours] = useState<number | null>(null);
  const [slaDraft, setSlaDraft] = useState("");
  // How long customers can return / exchange after delivery - one window for
  // every boutique (platform_settings.return_window_hours).
  const [windowHours, setWindowHours] = useState<number | null>(null);
  const [windowDraft, setWindowDraft] = useState("");
  // Refund charge on refunds to the bank / original payment (the wallet is free).
  const [charge, setCharge] = useState<{ pct: number; gstPct: number } | null>(null);
  const [chargeDraft, setChargeDraft] = useState({ pct: "", gstPct: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("return_evidence_required, return_vendor_sla_hours, return_window_hours, refund_charge_pct, refund_charge_gst_pct")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setEvidenceRequired(data.return_evidence_required);
        setSlaHours(data.return_vendor_sla_hours);
        setSlaDraft(String(data.return_vendor_sla_hours));
        setWindowHours(data.return_window_hours);
        setWindowDraft(String(data.return_window_hours));
        const loaded = { pct: Number(data.refund_charge_pct), gstPct: Number(data.refund_charge_gst_pct) };
        setCharge(loaded);
        setChargeDraft({ pct: String(loaded.pct), gstPct: String(loaded.gstPct) });
      });
  }, []);

  const save = async (patch: {
    return_evidence_required?: boolean;
    return_vendor_sla_hours?: number;
    return_window_hours?: number;
    refund_charge_pct?: number;
    refund_charge_gst_pct?: number;
  }) => {
    setSaving(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({ ...patch, updated_by: user?.id ?? null })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error(error.message || "Couldn't save setting");
      return false;
    }
    return true;
  };

  const toggleEvidence = async (on: boolean) => {
    if (!(await save({ return_evidence_required: on }))) return;
    setEvidenceRequired(on);
    toast.success(on ? "Photo evidence is now mandatory for returns" : "Photo evidence is now optional for returns");
  };

  const saveSla = async () => {
    const hours = Math.round(Number(slaDraft));
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
      toast.error("Enter a number of hours between 1 and 720");
      return;
    }
    if (!(await save({ return_vendor_sla_hours: hours }))) return;
    setSlaHours(hours);
    toast.success(`Boutiques now have ${hours} hours to respond`);
  };

  const saveWindow = async () => {
    const hours = Math.round(Number(windowDraft));
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
      toast.error("Enter a number of hours between 1 and 720");
      return;
    }
    if (!(await save({ return_window_hours: hours }))) return;
    setWindowHours(hours);
    refreshReturnWindowHours();
    toast.success(`Customers can now return or exchange for ${hours} hours after delivery (orders delivered from now on)`);
  };

  const saveCharge = async () => {
    const pct = Number(chargeDraft.pct);
    const gstPct = Number(chargeDraft.gstPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50 || !Number.isFinite(gstPct) || gstPct < 0 || gstPct > 50) {
      toast.error("Enter percentages between 0 and 50");
      return;
    }
    if (!(await save({ refund_charge_pct: pct, refund_charge_gst_pct: gstPct }))) return;
    setCharge({ pct, gstPct });
    toast.success(`Refund charge is now ${pct}% + ${gstPct}% GST`);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Return settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium">Return window</p>
            <p className="text-xs text-muted-foreground">
              How long customers can ask for a return or exchange after delivery - the same for every boutique. The
              boutique is paid in the weekly payout after it closes. Applies to orders delivered from now on; to give one
              order more time, change it on the order.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={720}
              value={windowDraft}
              onChange={(e) => setWindowDraft(e.target.value)}
              className="w-24 h-9"
              aria-label="Return window in hours"
              disabled={windowHours === null}
            />
            <span className="text-sm text-muted-foreground">hours</span>
            <Button
              size="sm"
              variant="outline"
              onClick={saveWindow}
              disabled={saving || windowHours === null || Number(windowDraft) === windowHours}
            >
              Save
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Photo evidence mandatory</p>
            <p className="text-xs text-muted-foreground">
              On: customers must add 3 photos of every item (front, back and the tag). Off: photos are optional. A video
              is always optional.
            </p>
          </div>
          <Switch
            checked={!!evidenceRequired}
            disabled={evidenceRequired === null || saving}
            onCheckedChange={toggleEvidence}
            aria-label="Photo evidence mandatory"
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium">Boutique response time</p>
            <p className="text-xs text-muted-foreground">
              Requests go to the boutique first. If it doesn't accept or reject within this time, the request escalates
              to you automatically (checked every 15 minutes).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={720}
              value={slaDraft}
              onChange={(e) => setSlaDraft(e.target.value)}
              className="w-24 h-9"
              aria-label="Boutique response time in hours"
              disabled={slaHours === null}
            />
            <span className="text-sm text-muted-foreground">hours</span>
            <Button
              size="sm"
              variant="outline"
              onClick={saveSla}
              disabled={saving || slaHours === null || Number(slaDraft) === slaHours}
            >
              Save
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium">Refund charge</p>
            <p className="text-xs text-muted-foreground">
              Kept from refunds to the customer's bank account or original payment. Refunds to the AllBoutiqs wallet are
              free, and so are returns of damaged, wrong or not-as-described items and cancellations by a boutique or by
              you.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={50}
              step="0.01"
              value={chargeDraft.pct}
              onChange={(e) => setChargeDraft((d) => ({ ...d, pct: e.target.value }))}
              className="w-20 h-9"
              aria-label="Refund charge percent"
              disabled={charge === null}
            />
            <span className="text-sm text-muted-foreground">% +</span>
            <Input
              type="number"
              min={0}
              max={50}
              step="0.01"
              value={chargeDraft.gstPct}
              onChange={(e) => setChargeDraft((d) => ({ ...d, gstPct: e.target.value }))}
              className="w-20 h-9"
              aria-label="GST on the refund charge, percent"
              disabled={charge === null}
            />
            <span className="text-sm text-muted-foreground">% GST</span>
            <Button
              size="sm"
              variant="outline"
              onClick={saveCharge}
              disabled={
                saving ||
                charge === null ||
                (Number(chargeDraft.pct) === charge.pct && Number(chargeDraft.gstPct) === charge.gstPct)
              }
            >
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
