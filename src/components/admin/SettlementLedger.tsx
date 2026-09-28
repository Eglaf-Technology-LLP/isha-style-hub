import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Landmark } from "lucide-react";
import { useSettlements } from "@/hooks/useSettlements";
import { format } from "date-fns";

interface SettlementLedgerProps {
  isAdmin: boolean;
}

// Razorpay depositing the platform's own collected revenue into the
// platform's own bank account, for finance reconciliation - platform-wide
// by nature (one settlement batches many orders), not vendor payouts.
// Route isn't enabled on this account, so vendor payouts stay exactly the
// separate manual ledger process they already are, untouched by this.
export function SettlementLedger({ isAdmin }: SettlementLedgerProps) {
  const { settlements, loading } = useSettlements(isAdmin);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalSettled = settlements.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" />
              Total Settled to Bank
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">₹{totalSettled.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{settlements.length} settlements</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold">Settlement Ledger</h3>
          <p className="text-sm text-muted-foreground">
            Razorpay's deposits of collected revenue into the platform's bank account
          </p>
        </div>
        <CardContent className="p-0">
          {settlements.length === 0 ? (
            <div className="text-center py-12">
              <Landmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No settlements yet</h3>
              <p className="text-muted-foreground">Bank settlements from Razorpay will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Settled On</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Fees</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>UTR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s, idx) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(s.settled_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium">₹{s.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.fees != null ? `₹${s.fees.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.tax != null ? `₹${s.tax.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.utr || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
