import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileCheck2 } from "lucide-react";
import { formatMoney } from "@/lib/format";

type Setup = Tables<"vendor_eway_bill_setup">;

// On the boutique's Orders tab: GST needs an e-way bill for an order over the
// limit, and AllBoutiqs makes them through a sub-user the boutique creates
// for it on the portal once. Full steps until the sub-user is in; one line
// after that.
export function EwayBillSetupCard({ vendorId, className = "" }: { vendorId: string; className?: string }) {
  const [setup, setSetup] = useState<Setup | null | undefined>(undefined);
  const [settings, setSettings] = useState<{ threshold: number; email: string; mobile: string | null } | null>(null);
  const [username, setUsername] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("vendor_eway_bill_setup")
      .select("*")
      .eq("vendor_id", vendorId)
      .maybeSingle()
      .then(({ data }) => {
        setSetup(data ?? null);
        setUsername(data?.subuser_username ?? "");
      });
    supabase
      .from("platform_settings")
      .select("eway_bill_threshold, eway_bill_email, eway_bill_subuser_mobile")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({ threshold: Number(data.eway_bill_threshold), email: data.eway_bill_email, mobile: data.eway_bill_subuser_mobile });
        }
      });
  }, [vendorId]);

  if (setup === undefined || !settings) return null;
  const limit = formatMoney(settings.threshold);

  if (setup?.mode === "self") {
    return (
      <p className={`text-xs text-muted-foreground flex items-center gap-1.5 ${className}`}>
        <FileCheck2 className="h-3.5 w-3.5" />
        E-way bills: you make your own for orders over {limit}. The details come by email; send the number and PDF to{" "}
        {settings.email}.
      </p>
    );
  }

  if (setup?.subuser_username && !editing) {
    return (
      <p className={`text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap ${className}`}>
        <CheckCircle2 className={`h-3.5 w-3.5 ${setup.verified_at ? "text-green-600" : ""}`} />
        E-way bills for orders over {limit}: AllBoutiqs makes them through your portal sub-user{" "}
        <span className="font-mono">{setup.subuser_username}</span>
        {setup.verified_at ? "." : " (we'll check it shortly)."}
        <button className="text-primary hover:underline" onClick={() => setEditing(true)}>
          Change
        </button>
      </p>
    );
  }

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.rpc("save_eway_bill_subuser", { _vendor_id: vendorId, _username: username });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSetup(data as Setup);
    setEditing(false);
    toast.success("Thanks - AllBoutiqs will check the sub-user");
  };

  return (
    <Card className={`border-amber-300 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheck2 className="h-4 w-4" /> Set up e-way bills (once)
        </CardTitle>
        <CardDescription>
          GST needs an e-way bill when an order's invoice is over {limit}. AllBoutiqs makes them for you on the government
          portal - for that, please create a sub-user for us on your e-way bill account. Until then, such an order can't be
          shipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Sign in at{" "}
            <a href="https://ewaybillgst.gov.in" target="_blank" rel="noreferrer" className="text-primary underline">
              ewaybillgst.gov.in
            </a>{" "}
            with your e-way bill login (first time: register with your GSTIN and the OTP sent to your GST mobile).
          </li>
          <li>Open User Management and create a sub-user.</li>
          <li>
            Pick a username (e.g. your boutique code and "allb") and enter AllBoutiqs' mobile
            {settings.mobile ? <span className="font-medium"> {settings.mobile}</span> : " (ask us for it)"} and email{" "}
            <span className="font-medium">{settings.email}</span>, so its sign-in codes come to us.
          </li>
          <li>Allow it to generate, update and cancel e-way bills and to see reports, for your place of business.</li>
          <li>Enter the sub-user's username below.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          If the portal shows a password for the sub-user, give it to AllBoutiqs on a call - never by email or WhatsApp. Never
          share your own main password. Prefer to make your own e-way bills? Tell AllBoutiqs: you'll then get the details by
          email for each such order and send us the number.
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="ewb-subuser" className="text-xs">
              Sub-user username
            </Label>
            <Input
              id="ewb-subuser"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-9 w-64 font-mono"
              maxLength={60}
            />
          </div>
          <Button size="sm" onClick={save} disabled={saving || !username.trim()}>
            Save
          </Button>
          {editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
