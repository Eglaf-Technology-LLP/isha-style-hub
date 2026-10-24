import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Receipt, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FeeInvoiceView, type FeeInvoice } from "./FeeInvoiceView";
import { formatDate } from "@/lib/dates";

const money = (n: number) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ALL = "__all__";

// AllBoutiqs' weekly fee invoices. A boutique sees its own (vendorId); admins
// see every boutique's, can filter by boutique and issue due invoices now.
export function FeeInvoicesCard({ vendorId, admin = false }: { vendorId?: string; admin?: boolean }) {
  const [invoices, setInvoices] = useState<FeeInvoice[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState<string>(vendorId ?? ALL);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from("fee_invoices").select("*").order("payout_date", { ascending: false }).limit(200);
    if (filter !== ALL) q = q.eq("vendor_id", filter);
    const { data } = await q;
    setInvoices(data ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!admin) return;
    supabase.from("vendors").select("id, name").order("name").then(({ data }) => setVendors(data ?? []));
  }, [admin]);

  const issueNow = async () => {
    setIssuing(true);
    const { data, error } = await supabase.rpc("generate_fee_invoices", {});
    setIssuing(false);
    if (error) return toast.error(error.message);
    toast.success(data ? `${data} fee invoice${data === 1 ? "" : "s"} issued` : "No orders are due for a fee invoice yet");
    load();
  };

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? "";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> AllBoutiqs fee invoices
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Marketplace commission and technology &amp; service fee with GST, issued with each weekly payout.
          </p>
        </div>
        {admin && (
          <div className="flex flex-wrap gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All boutiques</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={issueNow} disabled={issuing} className="gap-2">
              {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Issue due invoices now
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No fee invoices yet - the first one is issued with the first weekly payout.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  {admin && <TableHead>Boutique</TableHead>}
                  <TableHead>Payout date</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    {admin && <TableCell className="text-sm">{vendorName(inv.vendor_id) || inv.recipient_name}</TableCell>}
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(new Date(inv.payout_date))}</TableCell>
                    <TableCell className="text-right text-sm">{inv.order_count}</TableCell>
                    <TableCell className="text-right text-sm">{money(inv.taxable_value)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {money(Number(inv.cgst_amount) + Number(inv.sgst_amount) + Number(inv.igst_amount))}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{money(inv.total)}</TableCell>
                    <TableCell>
                      <FeeInvoiceView invoice={inv} />
                    </TableCell>
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
