import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, Percent, Landmark, TrendingUp, Download } from "lucide-react";
import { useVendorEarnings } from "@/hooks/useVendorEarnings";

interface VendorEarningsBreakdownProps {
  vendorId: string;
}

// The vendor-facing mirror of admin's "Platform Earnings Breakdown" on
// PaymentManagement.tsx - a vendor could already read their own
// commission_amount/net_payable per RLS, nothing ever showed it to them.
export function VendorEarningsBreakdown({ vendorId }: VendorEarningsBreakdownProps) {
  const { summary, loading, exportStatement } = useVendorEarnings(vendorId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Earnings Breakdown</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={exportStatement}
          disabled={!summary || summary.orders.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Export Statement
        </Button>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Gross Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₹{(summary?.grossSales || 0).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Across {summary?.orders.length || 0} paid orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              Commission Deducted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              ₹{(summary?.commissionDeducted || 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Platform's cut, per order</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Landmark className="h-4 w-4 text-yellow-500" />
              Gateway Fee (attributed)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₹{(summary?.gatewayFeeAttributed || 0).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">For your reference - already covered by us, not deducted from you</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Net Payable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">₹{(summary?.netPayable || 0).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">What you're owed</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
