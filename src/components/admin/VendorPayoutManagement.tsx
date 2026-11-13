import { useEffect, useState } from "react";
import { RAZORPAYX_PAYOUTS_ENABLED } from "@/lib/payoutRail";
import { PAYOUT_SCHEDULE_NOTE_ENABLED } from "@/lib/hiddenFeatures";
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
import { Loader2, Landmark, RefreshCw, CheckCircle2, XCircle, Send, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminVendorPayouts, AdminVendorPayout } from "@/hooks/useAdminVendorPayouts";
import { PayoutBreakdownDialog } from "@/components/PayoutBreakdownDialog";
import { PAYOUT_PROOF_ACCEPT, openPayoutProof, payoutProofProblem, uploadPayoutProof } from "@/lib/payoutProof";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";

const statusClass: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};
const statusLabel: Record<string, string> = {
  pending: "To transfer",
  processing: "Sending",
  paid: "Paid",
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

// Boutique payouts are bank transfers an admin makes (Razorpay's automatic
// payouts need conditions AllBoutiqs doesn't meet). Every payout day
// (Wednesday, 9:30 AM) the ready orders are batched into one payout per
// boutique with every charge already taken off; the admin transfers each
// amount from the bank, uploads the proof and marks it paid with the UTR,
// and the boutique is emailed and sees it on its dashboard.
export function VendorPayoutManagement({ isAdmin }: VendorPayoutManagementProps) {
  const { payouts, loading, generating, generatePayouts, markPaid, markFailed, sending, sendViaRazorpayX } =
    useAdminVendorPayouts(isAdmin);
  const [markingPayout, setMarkingPayout] = useState<AdminVendorPayout | null>(null);
  const [decliningPayout, setDecliningPayout] = useState<AdminVendorPayout | null>(null);
  const [transfer, setTransfer] = useState<TransferDetails | null | undefined>(undefined);
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);
  const [declineNote, setDeclineNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // The admin makes the bank transfer outside the app - show exactly where to send it.
  useEffect(() => {
    if (!markingPayout) return;
    setTransfer(undefined);
    setReference("");
    setProof(null);
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

  const toTransfer = payouts.filter((p) => p.status === "pending");
  const toTransferTotal = toTransfer.reduce((s, p) => s + p.netPayable, 0);

  const handleConfirmPaid = async () => {
    if (!markingPayout) return;
    if (!reference.trim()) return toast.error("Enter the bank transfer reference (UTR)");
    const problem = payoutProofProblem(proof);
    if (problem) return toast.error(problem);
    setSubmitting(true);
    try {
      const path = await uploadPayoutProof(markingPayout.vendorId, markingPayout.id, proof!);
      const ok = await markPaid(markingPayout.id, reference, path);
      if (ok) setMarkingPayout(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload the proof");
    } finally {
      setSubmitting(false);
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

  const showProof = async (path: string) => {
    const problem = await openPayoutProof(path);
    if (problem) toast.error(problem);
  };

  return (
    <Card>
      <div className="flex flex-row items-start justify-between p-6 border-b border-border flex-wrap gap-3">
        <div className="max-w-3xl">
          <h3 className="text-lg font-semibold">Boutique payouts</h3>
          {/* Hidden for now (src/lib/hiddenFeatures.ts). */}
          {PAYOUT_SCHEDULE_NOTE_ENABLED && (
            <>
              <p className="text-sm text-muted-foreground">
                Every Wednesday at 9:30 AM the orders that are ready - delivered, return window closed, money received - are
                put into one payout per boutique, with commission, fees and taxes already taken off. Transfer each amount from
                the bank, then press <span className="font-medium">Mark paid</span>, enter the UTR and upload the proof. The
                boutique is emailed and sees it on its dashboard.
              </p>
              <div className="flex items-center gap-2 mt-2 text-sm">
                <Label htmlFor="settle-days" className="text-xs text-muted-foreground font-normal">
                  Online payments reach AllBoutiqs after
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
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toTransfer.length > 0 && (
            <Badge variant="destructive">
              {toTransfer.length} to transfer · {formatMoney(toTransferTotal)}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={generatePayouts} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Prepare ready payouts
          </Button>
          {RAZORPAYX_PAYOUTS_ENABLED && toTransfer.length > 0 && (
            <Button size="sm" onClick={() => sendViaRazorpayX("all")} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send all via RazorpayX
            </Button>
          )}
        </div>
      </div>

      <CardContent className="p-0">
        {payouts.length === 0 ? (
          <div className="text-center py-12">
            <Landmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No payouts yet</h3>
            <p className="text-muted-foreground">
              They appear here every Wednesday once orders are ready - or press "Prepare ready payouts".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payout day</TableHead>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>To transfer</TableHead>
                  <TableHead>To account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>UTR &amp; proof</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id} data-focus-id={p.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(new Date(p.payoutDate ?? p.createdAt))}
                      <div className="text-xs text-muted-foreground">
                        Delivered {formatDate(new Date(p.periodStart))} - {formatDate(new Date(p.periodEnd))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{p.vendorName}</TableCell>
                    <TableCell className="text-sm">{p.orderCount}</TableCell>
                    <TableCell className="text-sm tabular-nums">{formatMoney(p.grossSales)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">-{formatMoney(p.commissionAmount)}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatMoney(p.netPayable)}</TableCell>
                    <TableCell className="text-sm font-mono text-xs">{p.bankLast4 ? `••${p.bankLast4}` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass[p.status] || "bg-muted"}>
                        {statusLabel[p.status] ?? p.status}
                      </Badge>
                      {p.status === "paid" && p.paidAt && (
                        <div className="text-xs text-muted-foreground mt-1">{formatDate(new Date(p.paidAt))}</div>
                      )}
                      {p.status === "failed" && p.failureReason && (
                        <div className="text-xs text-destructive mt-1 max-w-[220px]">{p.failureReason}</div>
                      )}
                      {p.method === "razorpayx" && p.status === "processing" && (
                        <div className="text-xs text-muted-foreground mt-1">
                          RazorpayX · {p.rzpxStatus ?? "sent"}
                          {p.rzpxMode ? ` · ${p.rzpxMode}` : ""}
                        </div>
                      )}
                      {p.status === "pending" && p.rzpxError && (
                        <div className="text-xs text-destructive mt-1 max-w-[220px]">{p.rzpxError}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-mono text-muted-foreground">{p.paymentReference || "—"}</div>
                      {p.paymentProofPath && (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
                          onClick={() => showProof(p.paymentProofPath!)}
                        >
                          <FileText className="h-3 w-3" /> Proof
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <PayoutBreakdownDialog
                          payout={{
                            id: p.id,
                            vendorName: p.vendorName,
                            netPayable: p.netPayable,
                            paymentReference: p.paymentReference,
                            paymentProofPath: p.paymentProofPath,
                          }}
                        />
                        {p.status === "pending" && (
                          <>
                            {RAZORPAYX_PAYOUTS_ENABLED && (
                              <Button size="sm" onClick={() => sendViaRazorpayX([p.id])} disabled={sending}>
                                <Send className="h-4 w-4 mr-1" /> Send via RazorpayX
                              </Button>
                            )}
                            <Button size="sm" onClick={() => setMarkingPayout(p)}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDecliningPayout(p)}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Declined
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!markingPayout} onOpenChange={(open) => !open && !submitting && setMarkingPayout(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mark payout paid</DialogTitle>
            <DialogDescription>
              Transfer the amount from the bank first (online or at the branch). Then enter the bank's reference (UTR) and
              upload the proof - the boutique is emailed both and sees them on its dashboard.
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
                  <span className="font-semibold">{formatMoney(markingPayout.netPayable)}</span>
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
              <div className="space-y-1.5">
                <Label htmlFor="payout-reference">Bank reference / UTR (required)</Label>
                <Input
                  id="payout-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. HDFCN52026100612345"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payout-proof">Proof of transfer (required)</Label>
                <Input
                  id="payout-proof"
                  type="file"
                  accept={PAYOUT_PROOF_ACCEPT}
                  onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  Bank screenshot, transfer receipt or deposit slip - photo or PDF, up to 10 MB.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={handleConfirmPaid}
                disabled={submitting || !reference.trim() || !proof || !transfer}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Upload proof &amp; mark paid
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
                `${formatMoney(decliningPayout.netPayable)} to ${decliningPayout.vendorName}. The orders go back into their payout queue, their bank details are flagged for update, and they're emailed the reason.`}
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
