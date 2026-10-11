import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Archive, ArchiveRestore, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshCustomerShipping } from "@/hooks/useCustomerShipping";

// The "Rs 99 shipping" Archive / Unarchive switch: archived = customers pay
// no shipping and the site says "Free shipping on all orders".
export function CustomerShippingCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshCustomerShipping().then(setEnabled);
  }, []);

  const toggle = async () => {
    if (enabled === null) return;
    setSaving(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({ customer_shipping_enabled: !enabled, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEnabled(await refreshCustomerShipping());
    toast.success(enabled ? "Shipping charge archived - shipping is now free for customers" : "Shipping charge restored");
  };

  return (
    <Card>
      <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Truck className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="font-semibold flex items-center gap-2 flex-wrap">
              Shipping charge to customers
              {enabled === null ? null : enabled ? (
                <Badge variant="secondary">Active</Badge>
              ) : (
                <Badge variant="outline">Archived</Badge>
              )}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {enabled
                ? "Customers pay each boutique's flat shipping (₹99 by default), free above its threshold (₹999 by default)."
                : "Customers pay no shipping on any order, and the site shows \"Free shipping on all orders\"."}
            </p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={enabled === null || saving} className="gap-2 shrink-0">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : enabled ? (
                <Archive className="h-4 w-4" />
              ) : (
                <ArchiveRestore className="h-4 w-4" />
              )}
              {enabled ? "Archive shipping charge" : "Unarchive shipping charge"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{enabled ? "Stop charging shipping?" : "Start charging shipping again?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {enabled
                  ? "From now on, every order gets free shipping and the ₹99 / free-above-₹999 messages are hidden. Orders already placed keep what they were charged."
                  : "From now on, checkout adds each boutique's flat shipping again (free above its threshold), and the site shows the free-above-₹999 message."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={toggle}>{enabled ? "Archive" : "Unarchive"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
