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
import { Loader2, Landmark, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminVendorPayouts, AdminVendorPayout } from "@/hooks/useAdminVendorPayouts";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};
const statusLabel: Record<string, string> = {
  pending: "Processing",
  processing: "Processing",
  paid: "Credited",
  failed: "Declined",
};

const DECLINE_REASONS = [
  "Invalid account number",
  "Account closed or frozen",
  "Account holder name mismatch",
  "Invalid IFSC code",
  "Beneficiary bank rejected the transfer",
];

interface TransferDetails {
  account_holder_name: string;
  bank_account_number: string;
  bank_ifsc: string;
}

interface VendorPayoutManagementProps {
  isAdmin: boolean;
}

// Razorpay Route isn't enabled on this account, so there's no automated
// bank disbursement - this is the admin-operated ledger instead: generate
// a run, do the actual bank transfer yourself outside the app, record the
// reference here so the vendor has something to reconcile against.
export function VendorPayoutManagement({ isAdmin }: VendorPayoutManagementProps) {
  const { payouts, loading, generating, generatePayouts, markPaid, markFailed } = useAdminVendorPayouts(isAdmin);
  const [markingPayout, setMarkingPayout] = useState<AdminVendorPayout | null>(null);
  const [decliningPayout, setDecliningPayout] = useState<AdminVendorPayout | null>(null);
  const [transfer, setTransfer] = useState<TransferDetails | null | undefined>(undefined);
  const [reference, setReference] = useState("");
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);
  const [declineNote, setDeclineNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // The admin makes the bank transfer outside the app - show exactly where to send it.
  useEffect(() => {
    if (!markingPayout) return;
    setTransfer(undefined);
    supabase
      .from("vendor_payout_accounts")
      .select("account_holder_name, bank_account_number, bank_ifsc")
      .eq("vendor_id", markingPayout.vendorId)
      .maybeSingle()
      .then(({ data }) => setTransfer((data as TransferDetails) ?? null));
  }, [markingPayout]);
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
    if (!reference.trim()) return toast.error("Enter the bank transfer reference (UTR)");
    setSubmitting(true);
    const ok = await markPaid(markingPayout.id, reference);
    setSubmitting(false);
    if (ok) {
      setMarkingPayout(null);
      setReference("");
    }
  };

  const handleConfirmDeclined = async () => {
    if (!decliningPayout) return;
    const reason = declineNote.trim() ? `${declineReason} - ${declineNote.trim()}` : declineReason;
    setSubmitting(true);
    const ok = await markFailed(decliningPayout.id, reason);
    setSubmitting(false);
    if (ok) {
      setDecliningPayout(null);
      setDeclineNote("");
      setDeclineReason(DECLINE_REASONS[0]);
    }
  };

  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-6 border-b border-border flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold">Manual payouts (fallback)</h3>
          <p className="text-sm text-muted-foreground">
            Only for exceptions Razorpay can't pay automatically - generate a run, transfer the money yourself, then record the UTR
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
                  <TableHead>Orders</TableHead>
                  <TableHead>To account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference (UTR)</TableHead>
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
                    <TableCell className="text-sm">{p.orderCount}</TableCell>
                    <TableCell className="text-sm font-mono text-xs">{p.bankLast4 ? `••${p.bankLast4}` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass[p.status] || "bg-muted"}>
                        {statusLabel[p.status] ?? p.status}
                      </Badge>
                      {p.status === "failed" && p.failureReason && (
                        <div className="text-xs text-destructive mt-1 max-w-[220px]">{p.failureReason}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs">
                      {p.paymentReference || "—"}
                    </TableCell>
                    <TableCell>
                      {p.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setMarkingPayout(p)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Mark credited
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDecliningPayout(p)}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Declined
                          </Button>
                        </div>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark payout credited</DialogTitle>
            <DialogDescription>
              Transfer the money from your bank first, then record the bank's reference (UTR). The boutique gets an
              email with it so they can match the credit on their statement.
            </DialogDescription>
          </DialogHeader>
          {markingPayout && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Boutique</span>
                  <span className="font-medium">{markingPayout.vendorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount to transfer</span>
                  <span className="font-semibold">₹{markingPayout.netPayable.toFixed(2)}</span>
                </div>
                {transfer === undefined ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : transfer ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account holder</span>
                      <span>{transfer.account_holder_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account number</span>
                      <span className="font-mono">{transfer.bank_account_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IFSC</span>
                      <span className="font-mono">{transfer.bank_ifsc}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-destructive">This boutique has no bank details on file.</p>
                )}
              </div>
              <div>
                <Label htmlFor="payout-reference">Bank reference / UTR (required)</Label>
                <Input
                  id="payout-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. HDFCN52026100612345"
                />
              </div>
              <Button className="w-full" onClick={handleConfirmPaid} disabled={submitting || !reference.trim() || !transfer}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm credited
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!decliningPayout} onOpenChange={(open) => !open && setDecliningPayout(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bank declined this payout</DialogTitle>
            <DialogDescription>
              {decliningPayout &&
                `₹${decliningPayout.netPayable.toFixed(2)} to ${decliningPayout.vendorName}. The orders go back into their payout queue, their bank details are flagged for update, and they're emailed the reason.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Select value={declineReason} onValueChange={setDeclineReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECLINE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="decline-note">Details from the bank (optional)</Label>
              <Input
                id="decline-note"
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                placeholder="e.g. return code R03"
              />
            </div>
            <Button variant="destructive" className="w-full" onClick={handleConfirmDeclined} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Mark declined
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
