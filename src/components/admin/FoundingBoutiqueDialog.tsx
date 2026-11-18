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
import { twoMonthsFrom } from "@/lib/founding";

interface FoundingVendor {
  id: string;
  name: string;
  is_founding: boolean;
  founding_from: string | null;
  founding_until: string | null;
}

// Admin: makes one boutique a Founding Boutique - the badge and 0%
// commission in the founding period (set under Fees, taxes & payout timing;
// only Founding Boutiques get it, client corrections Part 2, A15.1 / A18.1)
// - and optionally an extra 0% period just for it.
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
  const { period, launchDate, refetch } = useFoundingPeriod();

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
          <DialogDescription>
            Shows a Founding Boutique badge on the boutique's store and cards, and gives it the founding period's 0%
            commission.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="rounded-md bg-muted/40 p-3 text-sm">
            {period ? (
              <>
                Every Founding Boutique pays <strong>0% marketplace commission</strong> on orders placed from{" "}
                <strong>{formatDate(period.from)}</strong> to <strong>{formatDate(period.until)}</strong> (founding
                period, set under Fees, taxes &amp; payout timing). Other boutiques pay the normal commission. The
                technology fee, GST and other charges still apply.
              </>
            ) : (
              <>No founding period is set (Fees, taxes &amp; payout timing).</>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Leave both empty for the founding period only.</p>
              {/* 3.4.3: fills both dates from the launch date. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!launchDate}
                title={launchDate ? `Launch: ${formatDate(launchDate)}` : "No launch date set"}
                onClick={() => {
                  if (!launchDate) return;
                  setFrom(launchDate);
                  setUntil(twoMonthsFrom(launchDate));
                }}
              >
                2 months from launch
              </Button>
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
            {vendor.is_founding ? "Save" : "Make Founding Boutique"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
