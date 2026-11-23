import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
}

// Admin: makes one boutique a Founding Boutique - the badge and 0%
// commission in the founding period. The period is the same for every
// Founding Boutique, set by the system (29 Nov 2026 to 28 Jan 2027, under
// Fees, taxes & payout timing), then the normal commission on its own - no
// boutique has its own dates (client corrections Part 2, A15.1 / A18.1).
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
  const [saving, setSaving] = useState(false);
  const { period, refetch } = useFoundingPeriod();

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  const save = async (makeFounding: boolean) => {
    setSaving(true);
    const { error } = await supabase.from("vendors").update({ is_founding: makeFounding }).eq("id", vendor.id);
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
            Shows a Founding Boutique badge on the boutique's store and cards, and gives it the founding period's 0%
            commission.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-muted/40 p-3 text-sm">
          {period ? (
            <>
              Every Founding Boutique pays <strong>0% marketplace commission</strong> on orders placed from{" "}
              <strong>{formatDate(period.from)}</strong> to <strong>{formatDate(period.until)}</strong>, then the normal
              commission automatically. The same dates for every Founding Boutique, set under Fees, taxes &amp; payout
              timing. Other boutiques pay the normal commission. The technology fee, GST and other charges still apply.
            </>
          ) : (
            <>No founding period is set (Fees, taxes &amp; payout timing).</>
          )}
        </p>
        <DialogFooter className="gap-2 sm:justify-between">
          {vendor.is_founding ? (
            <Button variant="ghost" className="text-destructive" onClick={() => save(false)} disabled={saving}>
              Remove founding status
            </Button>
          ) : (
            <span />
          )}
          {!vendor.is_founding && (
            <Button onClick={() => save(true)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Make Founding Boutique
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
