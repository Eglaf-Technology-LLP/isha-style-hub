import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History } from "lucide-react";
import { RefundHistory } from "@/components/RefundHistory";
import { REFUND_STATE_STYLE, refundDestinationText, summariseRefunds, useOrderRefunds } from "@/hooks/useOrderRefunds";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

// Compact summary for a dense table cell (the boutique's Orders): the amount,
// "Refunded" (green) or "Refund processing" (amber), and where it went - the
// customer's AllBoutiqs Wallet or original payment (client, 27 Nov 2026: a
// wallet refund showed nothing here). With vendorOrderId only that part's
// refund. "Details" opens the full RefundHistory in a dialog.
export function RefundSummaryCell({
  orderId,
  vendorOrderId,
  version,
}: {
  orderId: string;
  vendorOrderId?: string;
  // Changes with the part's status, to read the refunds again.
  version?: string;
}) {
  const { byOrder } = useOrderRefunds([orderId], vendorOrderId, version);
  const [open, setOpen] = useState(false);
  const summary = summariseRefunds(byOrder.get(orderId) ?? []);

  if (!summary) return null;
  const style = REFUND_STATE_STYLE[summary.state];
  const where = refundDestinationText(summary.destinations, "the customer's");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{formatMoney(summary.amount)}</span>
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 whitespace-nowrap", style.className)}>
            {style.label}
          </Badge>
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-1.5" onClick={() => setOpen(true)}>
            <History className="h-3 w-3" /> Details
          </Button>
        </div>
        {where && <p className="text-[11px] text-muted-foreground max-w-[220px]">{where.replace(/^to /, "To ")}</p>}
      </div>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund details</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <RefundHistory orderId={orderId} vendorOrderId={vendorOrderId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
