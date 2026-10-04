import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function ReturnSettingsCard() {
  const { user } = useAuth();
  const [evidenceRequired, setEvidenceRequired] = useState<boolean | null>(null);
  const [slaHours, setSlaHours] = useState<number | null>(null);
  const [slaDraft, setSlaDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("return_evidence_required, return_vendor_sla_hours")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setEvidenceRequired(data.return_evidence_required);
        setSlaHours(data.return_vendor_sla_hours);
        setSlaDraft(String(data.return_vendor_sla_hours));
      });
  }, []);

  const save = async (patch: { return_evidence_required?: boolean; return_vendor_sla_hours?: number }) => {
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Return settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Photo evidence mandatory</p>
            <p className="text-xs text-muted-foreground">
              On: customers must add at least one photo per item. Off: photos are optional. A video is always optional.
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
      </CardContent>
    </Card>
  );
}
