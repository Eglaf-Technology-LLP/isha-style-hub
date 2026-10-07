import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BoutiqueRow {
  vendor_id: string;
  name: string;
  razorpay_status: string;
  razorpay_error: string | null;
  inTransit: number;
  credited: number;
}

const STATUS: Record<string, { label: string; className: string }> = {
  not_created: { label: "Not set up", className: "bg-muted text-muted-foreground" },
  created: { label: "Verifying", className: "bg-amber-100 text-amber-800" },
  under_review: { label: "Under review", className: "bg-amber-100 text-amber-800" },
  activated: { label: "Verified", className: "bg-emerald-100 text-emerald-800" },
  needs_clarification: { label: "Needs fixing", className: "bg-red-100 text-red-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
};

// Automatic payouts through Razorpay Route: per-boutique verification state
// and a manual trigger for the daily release run.
export function RazorpayPayoutsPanel() {
  const [rows, setRows] = useState<BoutiqueRow[] | null>(null);
  const [releasing, setReleasing] = useState(false);

  const load = async () => {
    const [{ data: vendors }, { data: accounts }, { data: sent }] = await Promise.all([
      supabase.from("vendors").select("id, name").eq("status", "approved").order("name"),
      supabase.from("vendor_payout_accounts").select("vendor_id, razorpay_status, razorpay_error"),
      supabase.from("vendor_orders").select("vendor_id, net_payable, rzp_transfer_amount, rzp_settled_at").eq("rzp_transfer_status", "released"),
    ]);
    const acct = new Map((accounts ?? []).map((a) => [a.vendor_id, a]));
    setRows(
      (vendors ?? []).map((v) => {
        const mine = (sent ?? []).filter((o) => o.vendor_id === v.id);
        const amt = (o: any) => Number(o.rzp_transfer_amount ?? o.net_payable);
        return {
          vendor_id: v.id,
          name: v.name,
          razorpay_status: acct.get(v.id)?.razorpay_status ?? "not_created",
          razorpay_error: acct.get(v.id)?.razorpay_error ?? null,
          inTransit: mine.filter((o) => !o.rzp_settled_at).reduce((s, o) => s + amt(o), 0),
          credited: mine.filter((o) => o.rzp_settled_at).reduce((s, o) => s + amt(o), 0),
        };
      }),
    );
  };

  useEffect(() => {
    load();
  }, []);

  const releaseNow = async () => {
    setReleasing(true);
    const { data, errorMessage } = await invokeEdgeFunction<{
      released: { amount: number }[];
      skipped: { reason: string }[];
      failed: { error: string }[];
      settled: number;
    }>("razorpay-route-release", {});
    setReleasing(false);
    if (errorMessage) return toast.error(errorMessage);
    const total = (data?.released ?? []).reduce((s, r) => s + r.amount, 0);
    toast.success(`Released ${data?.released.length ?? 0} payout(s) - ₹${Math.round(total)}`, {
      description: [
        data?.settled ? `${data.settled} credited to bank` : null,
        data?.skipped.length ? `${data.skipped.length} not yet payable` : null,
        data?.failed.length ? `${data.failed.length} failed: ${data.failed.map((f) => f.error).join("; ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      duration: 10000,
    });
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Automatic payouts (Razorpay)</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Each boutique's share is held in Razorpay from payment and released automatically every day at 10:00 once
            delivery and the return window are done; Razorpay then credits the boutique's bank.
          </p>
        </div>
        <Button size="sm" onClick={releaseNow} disabled={releasing}>
          {releasing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Release due payouts now
        </Button>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Razorpay account</TableHead>
                  <TableHead>On the way to bank</TableHead>
                  <TableHead>Credited</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.vendor_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={(STATUS[r.razorpay_status] ?? STATUS.not_created).className}>
                        {(STATUS[r.razorpay_status] ?? STATUS.not_created).label}
                      </Badge>
                      {r.razorpay_error && <div className="text-xs text-destructive mt-1 max-w-[320px]">{r.razorpay_error}</div>}
                    </TableCell>
                    <TableCell className="tabular-nums">₹{Math.round(r.inTransit)}</TableCell>
                    <TableCell className="tabular-nums">₹{Math.round(r.credited)}</TableCell>
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
