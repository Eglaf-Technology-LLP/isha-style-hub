import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Printer, FileText } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

interface Invoice {
  invoice_number: string;
  issued_at: string;
  subtotal: number;
  shipping_cost: number;
  tax_amount: number;
  total: number;
  seller_name: string;
  seller_gstin: string | null;
  seller_address: { address_line1?: string; city?: string; state?: string; pincode?: string } | null;
  billing_name: string;
  billing_address: { address_line1?: string; address_line2?: string; city?: string; state?: string; pincode?: string };
}

interface InvoiceItem {
  product_title: string;
  variant_title: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  price: number;
}

const formatAddress = (a: Invoice["seller_address"] | Invoice["billing_address"] | null) => {
  if (!a) return "—";
  return [a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(", ");
};

// Structural v1 invoice, per vendor_order (each vendor is the legal seller
// of their own goods) - same browser print-to-PDF pattern already
// established by RefundReceiptDialog.tsx, no PDF library added. Generated
// once server-side on first open (generate-invoice), then just displayed.
export function InvoiceDownloadButton({ vendorOrderId }: { vendorOrderId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || invoice || loading) return;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, errorMessage } = await invokeEdgeFunction<{ invoice: Invoice }>("generate-invoice", {
        vendor_order_id: vendorOrderId,
      });
      if (errorMessage || !data) {
        setError(errorMessage || "Could not generate invoice");
        setLoading(false);
        return;
      }
      setInvoice(data.invoice);

      const { data: itemsData } = await supabase
        .from("order_items")
        .select("product_title, variant_title, size, color, quantity, price")
        .eq("vendor_order_id", vendorOrderId);
      setItems(itemsData ?? []);
      setLoading(false);
    })();
  }, [open, invoice, loading, vendorOrderId]);

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5" /> Invoice
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #invoice-content, #invoice-content * { visibility: visible; }
              #invoice-content { position: absolute; top: 0; left: 0; width: 100%; padding: 24px; }
            }
          `}</style>
          <DialogHeader>
            <DialogTitle>Invoice</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">{error}</p>
          ) : invoice ? (
            <div id="invoice-content" className="space-y-4 text-sm">
              <div className="text-center border-b border-border pb-3">
                <p className="font-serif text-lg font-semibold">{invoice.seller_name}</p>
                {invoice.seller_gstin && (
                  <p className="text-xs text-muted-foreground">GSTIN: {invoice.seller_gstin}</p>
                )}
                <p className="text-xs text-muted-foreground">{formatAddress(invoice.seller_address)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Number</p>
                  <p className="font-mono text-xs">{invoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Date</p>
                  <p>{format(new Date(invoice.issued_at), "MMM d, yyyy")}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Billed To</p>
                  <p>{invoice.billing_name}</p>
                  <p className="text-xs text-muted-foreground">{formatAddress(invoice.billing_address)}</p>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>
                      {item.product_title}
                      {item.variant_title && ` (${item.variant_title})`}
                      {" "}x{item.quantity}
                    </span>
                    <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{invoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>₹{invoice.shipping_cost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>₹{invoice.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Total</span>
                  <span>₹{invoice.total.toFixed(2)}</span>
                </div>
              </div>

              {invoice.tax_amount === 0 && (
                <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
                  Tax not yet itemised on this invoice - not a substitute for a GST-compliant tax invoice.
                </p>
              )}

              <Button onClick={() => window.print()} className="w-full gap-2 print:hidden">
                <Printer className="h-4 w-4" /> Print / Save as PDF
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
