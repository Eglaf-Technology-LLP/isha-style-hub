import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ShieldAlert, ExternalLink } from "lucide-react";
import { useDisputes } from "@/hooks/useDisputes";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Open", variant: "destructive" },
  under_review: { label: "Under Review", variant: "outline" },
  won: { label: "Won", variant: "default" },
  lost: { label: "Lost", variant: "secondary" },
  closed: { label: "Closed", variant: "secondary" },
};

interface DisputeManagementProps {
  isAdmin: boolean;
}

// Visibility only - no in-app response flow. Evidence submission for an
// active dispute happens in Razorpay's own dashboard; this exists so a
// dispute is never silently missed, with the response deadline surfaced
// clearly since that's the one thing that's genuinely time-critical.
export function DisputeManagement({ isAdmin }: DisputeManagementProps) {
  const { disputes, loading } = useDisputes(isAdmin);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const now = Date.now();

  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-6 border-b border-border flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold">Payment Disputes</h3>
          <p className="text-sm text-muted-foreground">
            Chargebacks and disputes raised against payments - respond in Razorpay's dashboard
          </p>
        </div>
        <Badge variant={disputes.some((d) => d.status === "open") ? "destructive" : "secondary"}>
          {disputes.filter((d) => d.status === "open").length} Open
        </Badge>
      </div>

      <CardContent className="p-0">
        {disputes.length === 0 ? (
          <div className="text-center py-12">
            <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No disputes</h3>
            <p className="text-muted-foreground">Disputes raised against payments will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispute ID</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Respond By</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disputes.map((dispute) => {
                  const config = statusConfig[dispute.status] || statusConfig.open;
                  const respondByMs = dispute.respond_by ? new Date(dispute.respond_by).getTime() : null;
                  const deadlinePassed = respondByMs !== null && respondByMs < now && dispute.status === "open";
                  return (
                    <TableRow key={dispute.id}>
                      <TableCell className="font-mono text-xs">
                        {dispute.razorpay_dispute_id}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {dispute.order_id ? dispute.order_id.slice(0, 8).toUpperCase() : "—"}
                      </TableCell>
                      <TableCell className="font-medium">₹{dispute.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dispute.reason_code || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </TableCell>
                      <TableCell className={`text-sm ${deadlinePassed ? "text-destructive font-medium" : ""}`}>
                        {dispute.respond_by ? format(new Date(dispute.respond_by), "MMM d, yyyy") : "—"}
                        {deadlinePassed && " (passed)"}
                      </TableCell>
                      <TableCell>
                        <a
                          href="https://dashboard.razorpay.com/app/disputes"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          View in Razorpay <ExternalLink className="h-3 w-3" />
                        </a>
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
