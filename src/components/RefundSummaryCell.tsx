import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History } from "lucide-react";
import { useRefunds } from "@/hooks/useRefunds";
import { RefundHistory, refundStatusConfig } from "@/components/RefundHistory";

// Compact summary for a dense table cell (vendor/admin order lists) - the
// full RefundHistory card (reason, initiated-by, gateway timestamp,
// receipt button) is right for a dialog/detail context but was blowing
// out a table column's width when rendered inline. Shows just amount +
// status here; "Details" opens the same RefundHistory content in a
// dialog - mirrors ShipmentTimelineDialog's identical compact-cell +
// dialog pattern already used elsewhere in the same table.
export function RefundSummaryCell({ orderId }: { orderId: string }) {
  const { refunds } = useRefunds(orderId);
  const [open, setOpen] = useState(false);

  if (refunds.length === 0) return null;

  const latest = refunds[0];
  const config = refundStatusConfig[latest.status] || refundStatusConfig.initiated;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium">₹{latest.amount.toFixed(2)}</span>
        <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
          {refunds.length > 1 ? `${refunds.length} refunds` : config.label}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1 px-1.5"
          onClick={() => setOpen(true)}
        >
          <History className="h-3 w-3" /> Details
        </Button>
      </div>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund details</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <RefundHistory orderId={orderId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
