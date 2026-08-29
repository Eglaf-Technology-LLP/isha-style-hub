import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Landmark } from "lucide-react";
import { useVendorPayoutHistory } from "@/hooks/useVendorPayoutHistory";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

interface VendorPayoutHistoryProps {
  vendorId: string;
}

// "Payout schedule and history" from the vendor's own side - a direct read
// of vendor_payouts, the same admin-generated weekly runs shown in
// VendorPayoutManagement.tsx, scoped to just this vendor by RLS.
export function VendorPayoutHistory({ vendorId }: VendorPayoutHistoryProps) {
  const { payouts, loading } = useVendorPayoutHistory(vendorId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" /> Payout history
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Weekly runs based on your delivered, paid orders
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : payouts.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No payouts yet - the first weekly run will appear here once you have delivered orders.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Net Payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(p.period_start), "MMM d")} - {format(new Date(p.period_end), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">₹{Number(p.gross_sales).toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      -₹{Number(p.commission_amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="font-medium">₹{Number(p.net_payable).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass[p.status] || "bg-muted"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs">
                      {p.payment_reference || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
