import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RazorpayPayoutsPanel } from "./RazorpayPayoutsPanel";
import { formatINR } from "@/lib/format";

// Boutique payouts through RazorpayX: is RazorpayX ready, money waiting /
// on its way, automatic sending, and each boutique's bank-account check.
// (On the Razorpay Route rail the Route panel shows instead.)

interface Status {
  rail: string;
  auto_send: boolean;
  x_activated: boolean;
  balance: number | null;
  balance_error: string | null;
  accounts: { verified: number; name_mismatch: number; invalid: number; waiting: number };
  pending: { count: number; amount: number };
  processing: { count: number; amount: number };
}

interface AccountRow {
  vendor_id: string;
  name: string;
  holder: string | null;
  last4: string | null;
  bank_name: string | null;
  status: string;
  error: string | null;
}

const money = (n: number) => `${formatINR(Number(n))}`;

const ACCOUNT_STATUS: Record<string, { label: string; className: string }> = {
  none: { label: "No bank details", className: "bg-muted text-muted-foreground" },
  not_started: { label: "Not checked yet", className: "bg-muted text-muted-foreground" },
  registered: { label: "Waiting for RazorpayX", className: "bg-amber-100 text-amber-800" },
  verifying: { label: "Checking (₹1 sent)", className: "bg-amber-100 text-amber-800" },
  verified: { label: "Verified", className: "bg-emerald-100 text-emerald-800" },
  name_mismatch: { label: "Name doesn't match", className: "bg-red-100 text-red-800" },
  invalid: { label: "Bank rejected", className: "bg-red-100 text-red-800" },
  failed: { label: "Couldn't check", className: "bg-red-100 text-red-800" },
};

export function RazorpayXPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: s }, { data: vendors }, { data: accounts }] = await Promise.all([
      invokeEdgeFunction<Status>("razorpayx-payouts", { action: "status" }),
      supabase.from("vendors").select("id, name").eq("status", "approved").order("name"),
      supabase
        .from("vendor_payout_accounts")
        .select("vendor_id, account_holder_name, bank_account_number, rzpx_registered_name, rzpx_status, rzpx_error"),
    ]);
    setStatus(s);
    const byVendor = new Map((accounts ?? []).map((a) => [a.vendor_id, a]));
    setRows(
      (vendors ?? []).map((v) => {
        const a = byVendor.get(v.id);
        return {
          vendor_id: v.id,
          name: v.name,
          holder: a?.account_holder_name ?? null,
          last4: a?.bank_account_number ? String(a.bank_account_number).slice(-4) : null,
          bank_name: a?.rzpx_registered_name ?? null,
          status: a ? a.rzpx_status : "none",
          error: a?.rzpx_error ?? null,
        };
      }),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, body: Record<string, unknown>, done: (data: any) => string) => {
    setBusy(key);
    const { data, errorMessage } = await invokeEdgeFunction("razorpayx-payouts", body);
    setBusy(null);
    if (errorMessage) toast.error(errorMessage);
    else toast.success(done(data));
    load();
  };

  if (status?.rail === "razorpay_route") return <RazorpayPayoutsPanel />;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="max-w-2xl">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Boutique payouts · RazorpayX
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            On payout day, boutique orders whose return/exchange window has closed - and that have no return open - are
            batched in Vendor Payouts below. Send them from there, or switch on automatic sending. Every order is checked
            again at the moment of sending.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy}
            onClick={() => run("check", { action: "check_accounts" }, (d) => `Checked bank accounts (${d?.registered?.length ?? 0} sent to RazorpayX)`)}
          >
            {busy === "check" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Check bank accounts
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy}
            onClick={() => run("sync", { action: "sync" }, () => "Statuses refreshed from RazorpayX")}
          >
            {busy === "sync" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {!status.x_activated && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  RazorpayX isn't activated on the AllBoutiqs Razorpay account yet. Boutiques' bank accounts are being
                  registered, but the ₹1 bank check and payouts start only once RazorpayX is active and its account number
                  is added. Until then, pay by hand and use "Mark credited".
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">RazorpayX balance</p>
                <p className="text-xl font-semibold tabular-nums">
                  {status.balance != null ? money(status.balance) : "—"}
                </p>
                {status.x_activated && status.balance_error && <p className="text-xs text-destructive">{status.balance_error}</p>}
                {status.balance != null && status.balance < status.pending.amount && (
                  <p className="text-xs text-destructive">Less than the payouts waiting to be sent</p>
                )}
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Ready to send</p>
                <p className="text-xl font-semibold tabular-nums">{money(status.pending.amount)}</p>
                <p className="text-xs text-muted-foreground">{status.pending.count} boutique payout(s)</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">On its way to boutiques</p>
                <p className="text-xl font-semibold tabular-nums">{money(status.processing.amount)}</p>
                <p className="text-xs text-muted-foreground">{status.processing.count} payout(s)</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="rzpx-auto" className="text-sm font-medium">
                  Send automatically on payout day
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off: an admin reviews and sends each week's payouts. On: they go at 9:30 AM on payout day.
                </p>
              </div>
              <Switch
                id="rzpx-auto"
                checked={status.auto_send}
                disabled={!!busy}
                onCheckedChange={(v) =>
                  run("auto", { action: "settings", auto_send: v }, () => (v ? "Payouts will go automatically" : "Payouts wait for an admin"))
                }
              />
            </div>
          </>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Boutique</TableHead>
                <TableHead>Bank account</TableHead>
                <TableHead>Name at the bank</TableHead>
                <TableHead>Check</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => {
                const st = ACCOUNT_STATUS[r.status] ?? ACCOUNT_STATUS.not_started;
                return (
                  <TableRow key={r.vendor_id}>
                    <TableCell className="text-sm font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">
                      {r.last4 ? (
                        <>
                          {r.holder} <span className="font-mono text-xs text-muted-foreground">••{r.last4}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.bank_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={st.className}>
                        {st.label}
                      </Badge>
                      {r.error && <div className="text-xs text-destructive mt-1 max-w-[240px]">{r.error}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "name_mismatch" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy}
                          onClick={() =>
                            run(`approve-${r.vendor_id}`, { action: "approve_name", vendor_id: r.vendor_id }, () => `${r.name}'s bank account approved`)
                          }
                        >
                          Approve name
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
