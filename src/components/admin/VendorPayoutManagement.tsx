import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Landmark, RefreshCw } from "lucide-react";
import { useAdminVendorPayouts, AdminVendorPayout } from "@/hooks/useAdminVendorPayouts";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

interface VendorPayoutManagementProps {
  isAdmin: boolean;
}

// Razorpay Route isn't enabled on this account, so there's no automated
// bank disbursement - this is the admin-operated ledger instead: generate
// a run, do the actual bank transfer yourself outside the app, record the
// reference here so the vendor has something to reconcile against.
export function VendorPayoutManagement({ isAdmin }: VendorPayoutManagementProps) {
  const { payouts, loading, generating, generatePayouts, markPaid } = useAdminVendorPayouts(isAdmin);
  const [markingPayout, setMarkingPayout] = useState<AdminVendorPayout | null>(null);
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [settleDays, setSettleDays] = useState<string>("");
  const [savedSettleDays, setSavedSettleDays] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("payout_settlement_days")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSavedSettleDays(data.payout_settlement_days);
        setSettleDays(String(data.payout_settlement_days));
      });
  }, []);

  const saveSettleDays = async () => {
    const days = Math.round(Number(settleDays));
    if (!Number.isFinite(days) || days < 0 || days > 30) return toast.error("Enter 0 to 30 working days");
    const { error } = await supabase.from("platform_settings").update({ payout_settlement_days: days }).eq("id", true);
    if (error) return toast.error(error.message || "Couldn't save setting");
    setSavedSettleDays(days);
    toast.success(`Online payments now count as settled ${days} working day${days === 1 ? "" : "s"} after payment`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingCount = payouts.filter((p) => p.status === "pending").length;

  const handleConfirmPaid = async () => {
    if (!markingPayout) return;
    setSubmitting(true);
    const ok = await markPaid(markingPayout.id, reference);
    setSubmitting(false);
    if (ok) {
      setMarkingPayout(null);
      setReference("");
    }
  };

  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-6 border-b border-border flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold">Vendor Payouts</h3>
          <p className="text-sm text-muted-foreground">
            Weekly, admin-operated - generate a run, transfer the money yourself, then record it here
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Orders become payable after the boutique's return window (same day if nothing is returnable) and after
            Razorpay settles online payments.
          </p>
          <div className="flex items-center gap-2 mt-2 text-sm">
            <Label htmlFor="settle-days" className="text-xs text-muted-foreground font-normal">
              Razorpay settlement time
            </Label>
            <Input
              id="settle-days"
              type="number"
              min={0}
              max={30}
              value={settleDays}
              onChange={(e) => setSettleDays(e.target.value)}
              className="h-8 w-16"
              disabled={savedSettleDays === null}
            />
            <span className="text-xs text-muted-foreground">working days</span>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={saveSettleDays}
              disabled={savedSettleDays === null || Number(settleDays) === savedSettleDays}
            >
              Save
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && <Badge variant="destructive">{pendingCount} Pending</Badge>}
          <Button size="sm" onClick={generatePayouts} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Generate This Week's Payouts
          </Button>
        </div>
      </div>

      <CardContent className="p-0">
        {payouts.length === 0 ? (
          <div className="text-center py-12">
            <Landmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No payouts yet</h3>
            <p className="text-muted-foreground">Generate the first run once you have delivered, paid orders</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Net Payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p, idx) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(p.periodStart), "MMM d")} - {format(new Date(p.periodEnd), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">{p.vendorName}</TableCell>
                    <TableCell className="text-sm">₹{p.grossSales.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">-₹{p.commissionAmount.toFixed(2)}</TableCell>
                    <TableCell className="font-medium">₹{p.netPayable.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass[p.status] || "bg-muted"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs">
                      {p.paymentReference || "—"}
                    </TableCell>
                    <TableCell>
                      {p.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => setMarkingPayout(p)}>
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!markingPayout} onOpenChange={(open) => !open && setMarkingPayout(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Payout Paid</DialogTitle>
            <DialogDescription>
              {markingPayout &&
                `${markingPayout.vendorName} - ₹${markingPayout.netPayable.toFixed(2)}. Record the bank reference for their own reconciliation.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="payout-reference">Bank reference / UTR (optional)</Label>
              <Input
                id="payout-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. UTR12345678"
              />
            </div>
            <Button className="w-full" onClick={handleConfirmPaid} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Paid
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
