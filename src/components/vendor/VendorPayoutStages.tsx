import { format } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Hourglass, Landmark, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useVendorPayoutHistory, VendorPayout } from "@/hooks/useVendorPayoutHistory";
import { formatPayoutDate, todayIst } from "@/lib/payoutDates";
import { cn } from "@/lib/utils";

interface PayoutOrder {
  id: string;
  order_id: string;
  net_payable: number;
  status: string;
  delivered_at: string | null;
  payout_eligible_on: string | null;
  payout_id: string | null;
}

interface VendorPayoutStagesProps {
  vendorId: string;
  orders: PayoutOrder[];
  hasPayoutAccount: boolean;
  accountStatus: string;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const sum = (rows: { net_payable: number }[]) => rows.reduce((s, r) => s + Number(r.net_payable || 0), 0);

function Stage({
  icon: Icon,
  label,
  amount,
  hint,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  amount: number;
  hint: string;
  tone: "muted" | "amber" | "blue" | "green";
}) {
  const tones = {
    muted: "text-muted-foreground bg-muted",
    amber: "text-amber-700 bg-amber-100",
    blue: "text-blue-700 bg-blue-100",
    green: "text-emerald-700 bg-emerald-100",
  };
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("rounded-full p-1.5", tones[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{rupees(amount)}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TransferStatus({ p }: { p: VendorPayout }) {
  if (p.status === "paid") {
    return (
      <div>
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Credited
        </Badge>
        <div className="text-xs text-muted-foreground mt-1">
          {p.paid_at ? format(new Date(p.paid_at), "d MMM yyyy") : ""}
          {p.payment_reference ? ` · UTR ${p.payment_reference}` : ""}
        </div>
      </div>
    );
  }
  if (p.status === "failed") {
    return (
      <div>
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" /> Declined by bank
        </Badge>
        <div className="text-xs text-destructive mt-1 max-w-[260px]">
          {p.failure_reason} - amount returned to your queue
        </div>
      </div>
    );
  }
  return (
    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
      <Loader2 className="h-3 w-3 mr-1" /> Processing
    </Badge>
  );
}

export function VendorPayoutStages({ vendorId, orders, hasPayoutAccount, accountStatus }: VendorPayoutStagesProps) {
  const { payouts, loading } = useVendorPayoutHistory(vendorId);
  const today = todayIst();

  const unpaid = orders.filter((o) => o.status === "delivered" && !o.payout_id && o.payout_eligible_on);
  const inWindow = unpaid
    .filter((o) => o.payout_eligible_on! > today)
    .sort((a, b) => (a.payout_eligible_on! < b.payout_eligible_on! ? -1 : 1));
  const queued = unpaid
    .filter((o) => o.payout_eligible_on! <= today)
    .sort((a, b) => (a.payout_eligible_on! < b.payout_eligible_on! ? -1 : 1));
  const processing = payouts.filter((p) => p.status === "pending" || p.status === "processing");
  const credited = payouts.filter((p) => p.status === "paid");
  const lastDecline = payouts.find((p) => p.status === "failed");

  const blocked = !hasPayoutAccount || accountStatus === "not_setup"
    ? "missing"
    : accountStatus === "needs_update"
      ? "declined"
      : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" /> Your money
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            After delivery, each order waits for its return window (no wait if nothing is returnable), then joins the
            queue for our next bank transfer. You get an email at every step.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stage icon={Hourglass} tone="muted" label="Waiting for return window" amount={sum(inWindow)} hint={`${inWindow.length} order(s)`} />
            <Stage icon={Clock} tone="amber" label="In queue for bank transfer" amount={sum(queued)} hint={`${queued.length} order(s)`} />
            <Stage
              icon={Loader2}
              tone="blue"
              label="Processing"
              amount={processing.reduce((s, p) => s + Number(p.net_payable), 0)}
              hint={`${processing.length} transfer(s) in progress`}
            />
            <Stage
              icon={CheckCircle2}
              tone="green"
              label="Credited to your bank"
              amount={credited.reduce((s, p) => s + Number(p.net_payable), 0)}
              hint={`${credited.length} transfer(s) so far`}
            />
          </div>

          {blocked && (queued.length > 0 || inWindow.length > 0) && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <p>
                {blocked === "missing" ? (
                  <>
                    <strong>{rupees(sum(queued) + sum(inWindow))}</strong> is coming to you, but your payout account isn't
                    set up. Add your bank details below - until then, ready money waits safely in your queue.
                  </>
                ) : (
                  <>
                    Your bank declined our last transfer
                    {lastDecline?.failure_reason ? ` (${lastDecline.failure_reason})` : ""}. Please check and update your
                    bank details below - the money is back in your queue and goes out in the next transfer after that.
                  </>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hourglass className="h-4 w-4" /> Delivered - waiting for the return window
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inWindow.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Joins the queue on</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inWindow.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.order_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">
                        {o.delivered_at ? format(new Date(o.delivered_at), "d MMM") : "—"}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">{rupees(Number(o.net_payable))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <CalendarClock className="h-3 w-3" /> {formatPayoutDate(o.payout_eligible_on!)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> In queue for your next bank transfer
          </CardTitle>
        </CardHeader>
        <CardContent>
          {queued.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in the queue right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Ready since</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queued.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.order_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">{formatPayoutDate(o.payout_eligible_on!)}</TableCell>
                      <TableCell className="font-medium tabular-nums">{rupees(Number(o.net_payable))}</TableCell>
                      <TableCell>
                        {blocked ? (
                          <Badge variant="destructive">Waiting for bank details</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Next bank transfer</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> Bank transfers
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            "Credited" shows the bank reference (UTR) - match it with the credit on your bank statement.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bank transfers yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>To account</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(p.created_at), "d MMM yyyy")}</TableCell>
                      <TableCell className="text-sm">{p.order_count}</TableCell>
                      <TableCell className="text-sm tabular-nums">{rupees(Number(p.gross_sales))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        -{rupees(Number(p.commission_amount))}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">{rupees(Number(p.net_payable))}</TableCell>
                      <TableCell className="font-mono text-xs">{p.bank_account_last4 ? `••${p.bank_account_last4}` : "—"}</TableCell>
                      <TableCell>
                        <TransferStatus p={p} />
                      </TableCell>
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
