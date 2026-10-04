import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function ReturnSettingsCard() {
  const { user } = useAuth();
  const [evidenceRequired, setEvidenceRequired] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("return_evidence_required")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEvidenceRequired(data.return_evidence_required);
      });
  }, []);

  const toggleEvidence = async (on: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({ return_evidence_required: on, updated_by: user?.id ?? null })
      .eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message || "Couldn't save setting");
    setEvidenceRequired(on);
    toast.success(on ? "Photo evidence is now mandatory for returns" : "Photo evidence is now optional for returns");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Return settings</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
