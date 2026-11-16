import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFoundingPeriod } from "@/hooks/useFoundingPeriod";
import { formatDate } from "@/lib/dates";

interface FoundingVendor {
  id: string;
  name: string;
  is_founding: boolean;
  founding_from: string | null;
  founding_until: string | null;
}

// Admin: the Founding Boutique badge for one boutique, and optionally an
// extra 0% commission period just for it. The founding period itself (0%
// for every boutique) is set under Fees, taxes & payout timing.
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
  const [saving, setSaving] = useState(false);
  const { period, refetch } = useFoundingPeriod();

  useEffect(() => {
    if (!open) return;
    setFrom(vendor.founding_from ?? "");
    setUntil(vendor.founding_until ?? "");
    refetch();
  }, [open, vendor, refetch]);

  const save = async (makeFounding: boolean) => {
    if (makeFounding && !!from !== !!until) return toast.error("Choose both dates of the extra period, or leave both empty");
    if (makeFounding && from && until < from) return toast.error("The end date must be on or after the start date");
    setSaving(true);
    const { error } = await supabase
      .from("vendors")
      .update(
        makeFounding
          ? { is_founding: true, founding_from: from || null, founding_until: until || null }
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
          <DialogDescription>Shows a Founding Boutique badge on the boutique's store and cards.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="rounded-md bg-muted/40 p-3 text-sm">
            {period ? (
              <>
                Every boutique already pays <strong>0% marketplace commission</strong> on orders placed from{" "}
                <strong>{formatDate(period.from)}</strong> to <strong>{formatDate(period.until)}</strong> (founding
                period, set under Fees, taxes &amp; payout timing). The technology fee, GST and other charges still apply.
              </>
            ) : (
              <>No founding period is set for all boutiques (Fees, taxes &amp; payout timing).</>
            )}
          </p>
          <div className="space-y-2">
            <p className="text-sm font-medium">Extra 0% period for this boutique only (optional)</p>
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
            <p className="text-xs text-muted-foreground">Leave both empty for the badge only.</p>
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
            {vendor.is_founding ? "Save" : "Make Founding Boutique"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
