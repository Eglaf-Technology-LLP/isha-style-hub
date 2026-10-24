import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, Percent, Receipt, TrendingUp, Download } from "lucide-react";
import { useVendorEarnings, type FeeBreakdown } from "@/hooks/useVendorEarnings";
import { formatMoney } from "@/lib/format";

interface VendorEarningsBreakdownProps {
  vendorId: string;
}

const FEE_LINES: [keyof FeeBreakdown, string][] = [
  ["techFee", "Technology fee"],
  ["feeGst", "GST on AllBoutiqs fees"],
  ["gateway", "Payment gateway fee"],
  ["courierAndCod", "Courier & COD"],
  ["tcs", "GST TCS"],
  ["tds", "Income-tax TDS"],
];

// What the boutique earned from paid orders: Gross Sales - Commission -
// Fees & taxes = Net Payable, every amount with paise and the same figures
// net_payable is made of, so the cards always add up (Developer
// Corrections Part 8, 6).
export function VendorEarningsBreakdown({ vendorId }: VendorEarningsBreakdownProps) {
  const { summary, loading, exportStatement } = useVendorEarnings(vendorId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const rates = [...new Set((summary?.orders ?? []).map((o) => o.commissionRate))];
  const feeLines = FEE_LINES.filter(([key]) => (summary?.fees[key] ?? 0) !== 0);

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
            <p className="text-2xl font-bold tabular-nums">{formatMoney(summary?.grossSales)}</p>
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
            <p className="text-2xl font-bold text-destructive tabular-nums">-{formatMoney(summary?.commissionDeducted)}</p>
            <p className="text-xs text-muted-foreground">
              {rates.length === 1 ? `${rates[0]}% of sales (before GST)` : "Commission % of each sale (before GST)"}
              {rates.length === 1 && rates[0] === 0 && " - Founding Boutique, no commission"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Fees &amp; taxes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive tabular-nums">-{formatMoney(summary?.feesTotal)}</p>
            {feeLines.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {feeLines.map(([key, label]) => (
                  <li key={key} className="flex justify-between gap-2">
                    <span>{label}</span>
                    <span className="tabular-nums">{formatMoney(summary?.fees[key])}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Fees, GST TCS and TDS on your sales</p>
            )}
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
            <p className="text-2xl font-bold text-primary tabular-nums">{formatMoney(summary?.netPayable)}</p>
            <p className="text-xs text-muted-foreground">Gross Sales - Commission - Fees &amp; taxes</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
