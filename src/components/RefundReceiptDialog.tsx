import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, Receipt as ReceiptIcon } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Refund } from "@/hooks/useRefunds";

interface OrderInfo {
  id: string;
  customer_name: string;
  customer_email: string;
}

// A real downloadable/printable document per refund - no PDF library
// added, browser print-to-PDF does the job (this project's "efficiency
// over everything" bias, and this is a rarely-used feature that doesn't
// justify the bundle weight). The @media print rule below hides
// everything except #refund-receipt-content so what actually prints is
// just the receipt, not the whole dashboard behind the dialog.
export function RefundReceiptDialog({ refund }: { refund: Refund }) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<OrderInfo | null>(null);

  useEffect(() => {
    if (!open || order) return;
    supabase
      .from("orders")
      .select("id, customer_name, customer_email")
      .eq("id", refund.order_id)
      .maybeSingle()
      .then(({ data }) => setOrder(data));
  }, [open, order, refund.order_id]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => setOpen(true)}
      >
        <ReceiptIcon className="h-3.5 w-3.5" /> Receipt
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #refund-receipt-content, #refund-receipt-content * { visibility: visible; }
              #refund-receipt-content { position: absolute; top: 0; left: 0; width: 100%; padding: 24px; }
            }
          `}</style>
          <DialogHeader>
            <DialogTitle>Refund Receipt</DialogTitle>
          </DialogHeader>

          <div id="refund-receipt-content" className="space-y-4 text-sm">
            <div className="text-center border-b border-border pb-3">
              <p className="font-serif text-lg font-semibold">AllBoutiqs</p>
              <p className="text-xs text-muted-foreground">hello@allboutiqs.com</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Order Reference</p>
                <p className="font-mono">{refund.order_id.slice(0, 8).toUpperCase()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Refund Date</p>
                <p>{format(new Date(refund.initiated_at), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p>{order?.customer_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Razorpay Refund ID</p>
                <p className="font-mono text-xs">{refund.razorpay_refund_id || "—"}</p>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="flex justify-between items-baseline">
                <span className="text-muted-foreground">Refund Reason</span>
              </div>
              <p className="mt-1">{refund.reason || "—"}</p>
            </div>

            <div className="border-t border-border pt-3 flex justify-between items-baseline">
              <span className="font-medium">Amount Refunded</span>
              <span className="text-lg font-bold">₹{refund.amount.toFixed(2)}</span>
            </div>

            {refund.gateway_processed_at && (
              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                Processed by Razorpay on {format(new Date(refund.gateway_processed_at), "MMM d, yyyy 'at' h:mm a")}.
                Bank credit to the customer's original payment method can take a few additional days to reflect.
              </p>
            )}
          </div>

          <Button onClick={() => window.print()} className="gap-2 print:hidden">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
