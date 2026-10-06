import { AlertTriangle, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPayoutDate, todayIst } from "@/lib/payoutDates";

interface UpcomingPayoutOrder {
  id: string;
  order_id: string;
  net_payable: number;
  status: string;
  delivered_at: string | null;
  payout_eligible_on: string | null;
  payout_id: string | null;
}

export function UpcomingPayoutsCard({
  orders,
  hasPayoutAccount,
}: {
  orders: UpcomingPayoutOrder[];
  hasPayoutAccount: boolean;
}) {
  const upcoming = orders
    .filter((o) => o.status === "delivered" && !o.payout_id && o.payout_eligible_on)
    .sort((a, b) => (a.payout_eligible_on! < b.payout_eligible_on! ? -1 : 1));
  const total = upcoming.reduce((s, o) => s + Number(o.net_payable || 0), 0);
  const today = todayIst();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> Upcoming payouts
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Delivered orders become payable after the return window (same day if nothing in the order is
          returnable), and after Razorpay settles online payments.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasPayoutAccount && upcoming.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <p>
              <strong>₹{Math.round(total).toLocaleString("en-IN")}</strong> is waiting for you, but your payout account
              isn't set up yet. Add your bank details below so we can pay you.
            </p>
          </div>
        )}

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No delivered orders waiting for payout.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payout date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((o) => {
                  const due = o.payout_eligible_on! <= today;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.order_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">
                        {o.delivered_at
                          ? new Date(o.delivered_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                          : "—"}
                      </TableCell>
                      <TableCell className="font-medium">₹{Math.round(Number(o.net_payable)).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Badge variant={due ? "default" : "outline"} className="whitespace-nowrap">
                          {due ? "Due - next payout run" : formatPayoutDate(o.payout_eligible_on!)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
