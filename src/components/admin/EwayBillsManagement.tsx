import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useEwayBillsAdmin, AdminEwayBill, VendorEwayBillSetup } from "@/hooks/useEwayBillsAdmin";
import { useFlashFocus, useUrlTab } from "@/hooks/useDeepLink";
import { formatMoney } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { EWAY_LEG_LABELS, EwayBillLeg, formatEwbNumber, movementLabel, orderRefOf } from "@/lib/ewayBill";
import { PromptDialog } from "@/components/warehouse/PromptDialog";
import { DeliveryChallanButton } from "@/components/DeliveryChallanButton";
import { ReturnInvoiceButton } from "@/components/ReturnInvoiceButton";
import { EwayBillRequestCard } from "./EwayBillRequestCard";
import { EwayBillRecordDialog } from "./EwayBillRecordDialog";
import { EwayBoutiquesTab, EwayCouriersTab, EwaySettingsTab } from "./EwayBillSetupTabs";

const EXPIRING_SOON_MS = 8 * 3_600_000;

function setupLabel(setup: VendorEwayBillSetup | undefined) {
  if (setup?.mode === "self") return <Badge variant="outline">Boutique makes its own - emails the number</Badge>;
  if (!setup?.subuser_username) return <Badge variant="destructive">No portal sub-user yet - ask the boutique to set it up</Badge>;
  return (
    <Badge variant={setup.verified_at ? "secondary" : "outline"}>
      Sub-user <span className="font-mono ml-1">{setup.subuser_username}</span>
      {setup.verified_at ? " · works" : " · not checked"}
    </Badge>
  );
}

function CancelButton({ bill, label, onDone }: { bill: AdminEwayBill; label: string; onDone: () => void }) {
  return (
    <PromptDialog
      trigger={(open) => (
        <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={open}>
          {label}
        </Button>
      )}
      title="Cancel this e-way bill?"
      description="Cancel it on the portal first (allowed within 24 hours of making it, if the goods haven't moved). This only records it here."
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

// Admin > E-way bills. Requests: what to make on the portal (oldest first,
// by boutique so one sign-in covers a boutique's requests), then the numbers
// in use. Boutiques / Couriers / Settings: the set-up behind them.
export function EwayBillsManagement() {
  const [sub, setSub] = useUrlTab("requests", "sub");
  const { bills, setups, transporters, loading, refetch } = useEwayBillsAdmin();
  useFlashFocus(!loading && sub === "requests");

  const pending = bills.filter((b) => b.status === "pending");
  const active = bills.filter((b) => b.status === "active");
  const cancelled = bills.filter((b) => b.status === "cancelled").reverse();
  const byVendor = new Map<string, AdminEwayBill[]>();
  for (const b of pending) byVendor.set(b.vendor_id, [...(byVendor.get(b.vendor_id) ?? []), b]);
  // Made, but the part was cancelled before it shipped - cancel on the portal.
  const orphaned = active.filter((b) => b.partStatus === "cancelled" && (!b.shipment || b.shipment.status === "cancelled"));

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
        <TabsTrigger value="boutiques">Boutiques</TabsTrigger>
        <TabsTrigger value="couriers">Couriers</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="requests" className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
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

            <Card>
              <CardHeader>
                <CardTitle>Waiting for an e-way bill</CardTitle>
                <CardDescription>
                  Make each on ewaybillgst.gov.in - signed in as the boutique's sub-user - with the details shown, then enter
                  the number. The boutique (or warehouse) is told to book straight away. A boutique that makes its own was
                  emailed the details; enter the number it emails back.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {pending.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nothing waiting.</p>}
                {[...byVendor.entries()].map(([vendorId, list]) => {
                  const setup = setups.get(vendorId);
                  return (
                    <div key={vendorId} className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">
                          {list[0].vendorName}
                          {list[0].boutiqueCode && <span className="text-xs text-muted-foreground font-mono ml-1.5">{list[0].boutiqueCode}</span>}
                        </p>
                        {setupLabel(setup)}
                      </div>
                      {list.map((b) => (
                        <EwayBillRequestCard
                          key={b.id}
                          bill={b}
                          madeBy={setup?.mode === "self" ? "boutique" : "allboutiqs"}
                          transporters={transporters}
                          onChanged={refetch}
                        />
                      ))}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>E-way bills made</CardTitle>
                <CardDescription>
                  Validity starts when the courier fills Part B. Extend one on the portal if the parcel won't arrive in time
                  (from 8 hours before it ends).
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
                          <TableHead>Courier</TableHead>
                          <TableHead>Valid until</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...active].reverse().map((b) => {
                          const until = b.valid_until ? new Date(b.valid_until).getTime() : null;
                          const expiring = until != null && until - Date.now() < EXPIRING_SOON_MS;
                          return (
                            <TableRow key={b.id} data-focus-id={b.id}>
                              <TableCell className="font-mono text-xs whitespace-nowrap">{formatEwbNumber(b.ewb_number)}</TableCell>
                              <TableCell className="text-xs">
                                {orderRefOf(b.order_id)}
                                <div className="text-muted-foreground">{b.vendorName}</div>
                              </TableCell>
                              <TableCell className="text-xs">
                                {movementLabel(b.movement)} · {EWAY_LEG_LABELS[b.leg as EwayBillLeg]}
                                <div className="text-muted-foreground">{formatMoney(b.value)}</div>
                              </TableCell>
                              <TableCell className="text-xs font-mono">{b.document_number}</TableCell>
                              <TableCell className="text-xs">
                                {b.courier_name ?? "-"}
                                <div className="text-muted-foreground">
                                  {b.shipment?.awb_code ? `Booked · AWB ${b.shipment.awb_code}` : "Not booked yet"}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {b.valid_until ? (
                                  <span className={expiring ? "text-destructive font-medium" : ""}>{formatDateTime(b.valid_until)}</span>
                                ) : (
                                  <span className="text-muted-foreground">Starts with Part B</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 items-center">
                                  <EwayBillRecordDialog bill={b} transporters={transporters} onSaved={refetch} />
                                  {b.challan_id && <DeliveryChallanButton challanId={b.challan_id} />}
                                  {b.returnInvoice && <ReturnInvoiceButton returnInvoiceId={b.returnInvoice.id} />}
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

      <TabsContent value="boutiques">
        <EwayBoutiquesTab setups={setups} onSaved={refetch} />
      </TabsContent>
      <TabsContent value="couriers">
        <EwayCouriersTab transporters={transporters} bills={bills} onSaved={refetch} />
      </TabsContent>
      <TabsContent value="settings">
        <EwaySettingsTab />
      </TabsContent>
    </Tabs>
  );
}
