import { useEffect, useState } from "react";
import { addMonths, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface FoundingVendor {
  id: string;
  name: string;
  is_founding: boolean;
  founding_from: string | null;
  founding_until: string | null;
}

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

// Admin: mark a boutique as a Founding Boutique and set the period in which
// its marketplace commission is 0% (other charges still apply).
export function FoundingBoutiqueDialog({
  vendor,
  open,
  onOpenChange,
  onSaved,
}: {
  vendor: FoundingVendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFrom(vendor.founding_from ?? "");
    setUntil(vendor.founding_until ?? "");
    supabase
      .from("platform_settings")
      .select("launch_date")
      .maybeSingle()
      .then(({ data }) => setLaunchDate(data?.launch_date ?? ""));
  }, [open, vendor]);

  const useLaunchPeriod = async () => {
    const start = launchDate || ymd(new Date());
    if (!launchDate) {
      const { error } = await supabase.from("platform_settings").update({ launch_date: start }).eq("id", true);
      if (error) return toast.error(error.message);
      setLaunchDate(start);
    }
    setFrom(start);
    setUntil(ymd(addMonths(new Date(start), 2)));
  };

  const save = async (makeFounding: boolean) => {
    if (makeFounding && (!from || !until)) return toast.error("Choose the start and end date of the founding period");
    if (makeFounding && until < from) return toast.error("The end date must be on or after the start date");
    setSaving(true);
    const { error } = await supabase
      .from("vendors")
      .update(
        makeFounding
          ? { is_founding: true, founding_from: from, founding_until: until }
          : { is_founding: false, founding_from: null, founding_until: null },
      )
      .eq("id", vendor.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(makeFounding ? `${vendor.name} is a Founding Boutique` : "Founding status removed");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" /> Founding Boutique · {vendor.name}
          </DialogTitle>
          <DialogDescription>
            Shows a Founding Boutique badge. Between these dates the marketplace commission is 0% on its orders and fee
            invoices; the technology fee, GST and all other charges still apply.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="launch-date">Marketplace launch date</Label>
              <Input
                id="launch-date"
                type="date"
                value={launchDate}
                onChange={async (e) => {
                  const v = e.target.value;
                  setLaunchDate(v);
                  if (v) await supabase.from("platform_settings").update({ launch_date: v }).eq("id", true);
                }}
              />
            </div>
            <Button type="button" variant="outline" onClick={useLaunchPeriod}>
              2 months from launch
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="founding-from">0% commission from</Label>
              <Input id="founding-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="founding-until">until (inclusive)</Label>
              <Input id="founding-until" type="date" min={from || undefined} value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {vendor.is_founding ? (
            <Button variant="ghost" className="text-destructive" onClick={() => save(false)} disabled={saving}>
              Remove founding status
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => save(true)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {vendor.is_founding ? "Save period" : "Make Founding Boutique"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
