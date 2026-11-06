import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ExternalLink, FileDown, FileText, Loader2, Paperclip } from "lucide-react";
import { useEwayBillsAdmin, AdminEwayBill } from "@/hooks/useEwayBillsAdmin";
import { useFlashFocus, useUrlTab } from "@/hooks/useDeepLink";
import { formatMoney } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import {
  EWAY_LEG_LABELS,
  EwayBillLeg,
  formatEwbNumber,
  openEwayBillPdf,
  orderRefOf,
  uploadEwayBillPdf,
} from "@/lib/ewayBill";
import { buildBulkJson, downloadJson } from "@/lib/ewayBillJson";
import { PromptDialog } from "@/components/warehouse/PromptDialog";
import { DeliveryChallanButton } from "@/components/DeliveryChallanButton";
import { EwayBillRequestCard } from "./EwayBillRequestCard";
import { EwayBillRecordDialog } from "./EwayBillRecordDialog";
import { EwayBillBulkEntryDialog, EwayBillPdfUploadDialog } from "./EwayBillBulkDialogs";
import { EwayBillCreateDialog, EwayBillExtendDialog } from "./EwayBillActionDialogs";
import { EwaySettingsTab } from "./EwayBillSetupTabs";

const EXPIRING_SOON_MS = 8 * 3_600_000;

function CancelButton({ bill, label, onDone }: { bill: AdminEwayBill; label: string; onDone: () => void }) {
  return (
    <PromptDialog
      trigger={(open) => (
        <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={open}>
          {label}
        </Button>
      )}
      title="Cancel this e-way bill?"
      description="Cancel it on the portal first (e-Waybill > Cancel - allowed within 24 hours of making it, if the goods haven't moved). This only records it here."
      label="Reason"
      required
      confirmLabel="Mark cancelled"
      destructive
      onConfirm={async (reason) => {
        const { errorMessage } = await invokeEdgeFunction("eway-bill-actions", { action: "cancel", eway_bill_id: bill.id, reason });
        if (errorMessage) {
          toast.error(errorMessage);
          return false;
        }
        toast.success("Marked cancelled");
        onDone();
        return true;
      }}
    />
  );
}

// View the PDF, or attach / replace it.
function PdfCell({ bill, onDone }: { bill: AdminEwayBill; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const attach = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const error = await uploadEwayBillPdf(bill, file);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (error) toast.error(error);
    else {
      toast.success("PDF attached");
      onDone();
    }
  };
  return (
    <div className="flex items-center gap-1">
      <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
      {bill.pdf_path ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={async () => {
              const err = await openEwayBillPdf(bill.pdf_path!);
              if (err) toast.error(err);
            }}
          >
            <FileText className="h-3 w-3" /> PDF
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" disabled={busy} onClick={() => input.current?.click()}>
            Replace
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />} Attach PDF
        </Button>
      )}
    </div>
  );
}

// Admin > E-way bills. AllBoutiqs is the transporter on every e-way bill:
//   1. requests arrive by email / notification when an order is placed (and
//      for warehouse parcels, send-backs and returns);
//   2. download them as one JSON file and upload it on the portal
//      (e-Waybill > Generate Bulk);
//   3. enter the numbers in bulk and attach the PDFs - each boutique is
//      emailed and can print its copy, the warehouse is told to book.
export function EwayBillsManagement() {
  const [sub, setSub] = useUrlTab("requests", "sub");
  const { bills, settings, loading, refetch } = useEwayBillsAdmin();
  useFlashFocus(!loading && sub === "requests");

  const pending = useMemo(() => bills.filter((b) => b.status === "pending"), [bills]);
  const active = useMemo(() => bills.filter((b) => b.status === "active"), [bills]);
  const cancelled = useMemo(() => bills.filter((b) => b.status === "cancelled").reverse(), [bills]);
  const open = useMemo(() => [...pending, ...active.filter((b) => !b.shipment_id)], [pending, active]);

  // Selected for the JSON / bulk entry: by default everything not yet in a download.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<{ bill: AdminEwayBill; problems: string[] }[]>([]);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    setSelected(new Set(pending.filter((b) => !b.exported_at).map((b) => b.id)));
  }, [pending]);
  const selectedBills = pending.filter((b) => selected.has(b.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const byVendor = new Map<string, AdminEwayBill[]>();
  for (const b of pending) byVendor.set(b.vendor_id, [...(byVendor.get(b.vendor_id) ?? []), b]);

  // Made, but the part was cancelled before it shipped - cancel on the portal.
  const orphaned = active.filter(
    (b) => b.partStatus === "cancelled" && !b.return_request_id && !b.send_back_id && (!b.shipment || b.shipment.status === "cancelled"),
  );
  // Running out while the parcel is still on its way.
  const expiring = active.filter((b) => {
    if (!b.valid_until) return false;
    const left = new Date(b.valid_until).getTime() - Date.now();
    return left < EXPIRING_SOON_MS && left > -EXPIRING_SOON_MS && !["delivered", "cancelled", "lost"].includes(b.shipment?.status ?? "");
  });

  const exportJson = async () => {
    if (!selectedBills.length) return;
    setExporting(true);
    const result = buildBulkJson(
      selectedBills.map((b) => ({ bill: b, invoice: b.invoice, lines: b.lines })),
      settings,
    );
    setSkipped(result.skipped.map((s) => ({ bill: selectedBills.find((b) => b.id === s.id)!, problems: s.problems })));
    if (result.included.length) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      downloadJson(result.json, `allboutiqs-ewaybills-${stamp}.json`);
      const { errorMessage } = await invokeEdgeFunction("eway-bill-actions", { action: "mark_exported", eway_bill_ids: result.included });
      if (errorMessage) toast.error(errorMessage);
      toast.success(
        `${result.included.length} in the file${result.skipped.length ? ` - ${result.skipped.length} left out, see below` : ""}. Upload it on the portal: e-Waybill > Generate Bulk.`,
      );
      refetch();
    } else {
      toast.error("Nothing could go in the file - see the problems below");
    }
    setExporting(false);
  };

  return (
    <Tabs value={sub} onValueChange={setSub} className="space-y-6">
      <TabsList className="flex flex-wrap h-auto w-full max-w-3xl justify-start">
        <TabsTrigger value="requests" className="gap-1.5">
          Requests
          {pending.length > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
              {pending.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="requests" className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {!settings.transporterId && (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="py-3 text-sm text-amber-950 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Enter AllBoutiqs' transporter ID in Settings - the JSON for the portal needs it.
                  <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => setSub("settings")}>
                    Settings
                  </Button>
                </CardContent>
              </Card>
            )}

            {orphaned.length > 0 && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">Cancel these on the portal</CardTitle>
                  <CardDescription>
                    Their order part was cancelled after the e-way bill was made. Cancel each on ewaybillgst.gov.in (within
                    24 hours of making it), then mark it cancelled here.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {orphaned.map((b) => (
                    <div key={b.id} data-focus-id={b.id} className="flex items-center justify-between gap-3 text-sm flex-wrap">
                      <span>
                        <span className="font-mono">{formatEwbNumber(b.ewb_number)}</span> · {b.vendorName} · order{" "}
                        {orderRefOf(b.order_id)} · made {formatDateTime(b.ewb_date)}
                      </span>
                      <CancelButton bill={b} label="Mark cancelled" onDone={refetch} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {expiring.length > 0 && (
              <Card className="border-amber-400">
                <CardHeader>
                  <CardTitle className="text-base text-amber-800">Running out - extend on the portal</CardTitle>
                  <CardDescription>
                    The parcel is still on its way. Extend it on ewaybillgst.gov.in (from 8 hours before to 8 hours after it
                    ends), then enter the new date here.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {expiring.map((b) => (
                    <div key={b.id} data-focus-id={b.id} className="flex items-center justify-between gap-3 text-sm flex-wrap">
                      <span>
                        <span className="font-mono">{formatEwbNumber(b.ewb_number)}</span> · {b.vendorName} · order{" "}
                        {orderRefOf(b.order_id)} · until {formatDateTime(b.valid_until)}
                      </span>
                      <EwayBillExtendDialog bill={b} onSaved={refetch} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Waiting for an e-way bill</CardTitle>
                <CardDescription>
                  1. Download the JSON for the ticked requests. 2. Upload it on ewaybillgst.gov.in (e-Waybill &gt; Generate
                  Bulk), signed in as AllBoutiqs. 3. Enter the numbers and attach the PDFs - each boutique is emailed and can
                  print its copy; the warehouse is told to book. Boutiques were told it takes {"1-2 hours"}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs mr-2">
                    <Checkbox
                      checked={pending.length > 0 && selectedBills.length === pending.length}
                      onCheckedChange={(v) => setSelected(v === true ? new Set(pending.map((b) => b.id)) : new Set())}
                      disabled={!pending.length}
                    />
                    All ({selectedBills.length}/{pending.length} ticked)
                  </label>
                  <Button size="sm" className="h-8 text-xs gap-1" onClick={exportJson} disabled={!selectedBills.length || exporting}>
                    {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                    Download JSON ({selectedBills.length})
                  </Button>
                  <EwayBillBulkEntryDialog bills={selectedBills.length ? selectedBills : pending} onSaved={refetch} />
                  <EwayBillPdfUploadDialog bills={open} onSaved={refetch} />
                  <EwayBillCreateDialog onCreated={refetch} />
                  <a
                    href="https://ewaybillgst.gov.in"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline ml-auto"
                  >
                    Open the portal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {skipped.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1">
                    <p className="font-medium text-destructive">Left out of the file - fix these, then download again:</p>
                    {skipped.map((s) => (
                      <p key={s.bill.id}>
                        Order {orderRefOf(s.bill.order_id)} · {s.bill.vendorName} · {s.bill.document_number}: {s.problems.join("; ")}
                      </p>
                    ))}
                    {skipped.some((s) => s.problems.some((p) => p.includes("GSTIN"))) && (
                      <p className="pt-1 text-foreground">
                        Fix a boutique's GSTIN in Admin &gt; Vendors &gt; View &gt; GST number. An invoice already issued keeps the
                        GSTIN it was issued with, so these requests can't be fixed - cancel the order itself (cancelling only the
                        request brings it back while the order is open). The next order picks up the corrected GSTIN.
                      </p>
                    )}
                  </div>
                )}

                {pending.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nothing waiting.</p>}
                {[...byVendor.entries()].map(([vendorId, list]) => (
                  <div key={vendorId} className="space-y-2">
                    <p className="font-medium">
                      {list[0].vendorName}
                      {list[0].boutiqueCode && <span className="text-xs text-muted-foreground font-mono ml-1.5">{list[0].boutiqueCode}</span>}
                    </p>
                    {list.map((b) => (
                      <EwayBillRequestCard
                        key={b.id}
                        bill={b}
                        settings={settings}
                        selected={selected.has(b.id)}
                        onSelect={(on) => toggle(b.id, on)}
                        onChanged={refetch}
                      />
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>E-way bills made</CardTitle>
                <CardDescription>
                  Validity starts when Part B is filled. Attach the PDF so the boutique can print it. Extend one on the portal
                  if the parcel won't arrive in time.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {active.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">None yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>E-way bill</TableHead>
                          <TableHead>Order</TableHead>
                          <TableHead>Movement</TableHead>
                          <TableHead>Document</TableHead>
                          <TableHead>Booking</TableHead>
                          <TableHead>Valid until</TableHead>
                          <TableHead>PDF</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...active].reverse().map((b) => {
                          const until = b.valid_until ? new Date(b.valid_until).getTime() : null;
                          const ending = until != null && until - Date.now() < EXPIRING_SOON_MS;
                          return (
                            <TableRow key={b.id} data-focus-id={b.id}>
                              <TableCell className="font-mono text-xs whitespace-nowrap">{formatEwbNumber(b.ewb_number)}</TableCell>
                              <TableCell className="text-xs">
                                {orderRefOf(b.order_id)}
                                <div className="text-muted-foreground">{b.vendorName}</div>
                              </TableCell>
                              <TableCell className="text-xs">
                                {EWAY_LEG_LABELS[b.leg as EwayBillLeg] ?? b.leg}
                                <div className="text-muted-foreground">{formatMoney(b.value)}</div>
                              </TableCell>
                              <TableCell className="text-xs font-mono">{b.document_number}</TableCell>
                              <TableCell className="text-xs">
                                {b.shipment?.awb_code ? `AWB ${b.shipment.awb_code}` : "Not booked yet"}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {b.valid_until ? (
                                  <span className={ending ? "text-destructive font-medium" : ""}>{formatDateTime(b.valid_until)}</span>
                                ) : (
                                  <span className="text-muted-foreground">Starts with Part B</span>
                                )}
                                {b.extended_count > 0 && <div className="text-muted-foreground">Extended ×{b.extended_count}</div>}
                              </TableCell>
                              <TableCell>
                                <PdfCell bill={b} onDone={refetch} />
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 items-center">
                                  <EwayBillRecordDialog bill={b} onSaved={refetch} />
                                  <EwayBillExtendDialog bill={b} onSaved={refetch} />
                                  {b.challan_id && <DeliveryChallanButton challanId={b.challan_id} />}
                                  {(!b.shipment || b.shipment.status === "cancelled") && (
                                    <CancelButton bill={b} label="Cancel" onDone={refetch} />
                                  )}
                                </div>
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

            {cancelled.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cancelled (last 30 days)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs">
                  {cancelled.map((b) => (
                    <p key={b.id} data-focus-id={b.id}>
                      {formatDateTime(b.cancelled_at)} · {b.vendorName} · order {orderRefOf(b.order_id)}
                      {b.ewb_number ? ` · ${formatEwbNumber(b.ewb_number)}` : ""} - {b.cancel_reason}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </TabsContent>

      <TabsContent value="settings">
        <EwaySettingsTab onSaved={refetch} />
      </TabsContent>
    </Tabs>
  );
}
