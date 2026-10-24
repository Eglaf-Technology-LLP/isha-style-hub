import { Badge } from "@/components/ui/badge";
import { CustomisationDetails } from "@/components/CustomisationDetails";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, PackageOpen, XCircle } from "lucide-react";
import { toast } from "sonner";
import { WhVendorOrder } from "@/hooks/useWarehouseData";
import {
  addCalendarDays,
  dispatchByDate,
  formatShortDate,
  istToday,
  vendorOrderStatusColors,
  vendorOrderStatusLabel,
} from "@/lib/warehouse";
import { PromptDialog } from "./PromptDialog";
import { EmptyState, orderRef, runAction, runRpc, TrackLink, WarehouseViewProps } from "./shared";
import { formatDate, formatDateTime } from "@/lib/dates";

const ON_THE_WAY = ["pending", "confirmed", "processing", "in_transit_to_warehouse"];

function ItemsList({ vo }: { vo: WhVendorOrder }) {
  return (
    <div className="space-y-1">
      {vo.items.map((i) => (
        <div key={i.id} className="text-xs">
          <span className="font-medium">{i.product_title}</span>
          <span className="text-muted-foreground"> × {i.quantity}</span>
          {(i.variant_title || i.size || i.color) && (
            <span className="text-muted-foreground">
              {" "}
              ({[i.variant_title, i.size && `Size ${i.size}`, i.color].filter(Boolean).join(" · ")})
            </span>
          )}
          {i.sku && <div className="font-mono text-muted-foreground">SKU {i.sku}</div>}
          {i.customisation && <CustomisationDetails customisation={i.customisation} showPrices={false} className="mt-1" />}
        </div>
      ))}
    </div>
  );
}

function ReceiveButton({ vo, onDone, label = "Receive" }: { vo: WhVendorOrder; onDone: () => void; label?: string }) {
  return (
    <PromptDialog
      trigger={(open) => (
        <Button size="sm" className="h-8 text-xs gap-1" onClick={open}>
          <PackageOpen className="h-3 w-3" /> {label}
        </Button>
      )}
      title={`Receive parcel - ${vo.vendor_name}`}
      description={
        vo.status === "cancelled"
          ? "This order was cancelled while the parcel was on its way. Receive it and it goes on the list to send back to the boutique."
          : `Order ${orderRef(vo.order_id)}: check the parcel is from ${vo.vendor_name} and has ${vo.items.reduce((s, i) => s + i.quantity, 0)} piece(s), then note where you shelve it.`
      }
      label="Shelf / bin (optional)"
      placeholder="e.g. A-3"
      confirmLabel="Mark received"
      onConfirm={async (shelf) => {
        const ok = await runRpc("warehouse_receive_parcel", { _vendor_order_id: vo.id, _shelf: shelf || null }, "Parcel received");
        if (ok) onDone();
        return ok;
      }}
    />
  );
}

// Boutique parcels on their way to the warehouse.
export function IncomingTab({ data, timing }: WarehouseViewProps) {
  const today = istToday();
  const rows = data.vendorOrders
    .filter(
      (vo) =>
        ON_THE_WAY.includes(vo.status) ||
        (vo.status === "cancelled" &&
          !vo.received_at_warehouse_at &&
          vo.inbound &&
          ["picked_up", "in_transit", "out_for_delivery", "delivered"].includes(vo.inbound.status)),
    )
    .sort((a, b) => (a.expected_at_warehouse_on ?? "9999").localeCompare(b.expected_at_warehouse_on ?? "9999"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Incoming parcels</CardTitle>
        <CardDescription>
          Boutique parcels on their way to the warehouse. A parcel more than {timing.maxWaitDays} days past its expected
          date is overdue - admin then sends what has arrived or cancels the missing item.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState text="Nothing on its way right now." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hand to courier by</TableHead>
                  <TableHead>Expected here</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((vo) => {
                  const booked = !!vo.inbound && vo.inbound.status !== "cancelled";
                  const late = !booked && !!vo.ready_by && vo.ready_by < today && vo.status !== "cancelled";
                  const overdue =
                    !!vo.expected_at_warehouse_on && addCalendarDays(vo.expected_at_warehouse_on, timing.maxWaitDays) < today;
                  return (
                    <TableRow key={vo.id} data-focus-id={`${vo.id} ${vo.order_id}`}>
                      <TableCell className="font-mono text-xs">
                        {orderRef(vo.order_id)}
                        <div className="text-muted-foreground">{formatDate(vo.created_at)}</div>
                      </TableCell>
                      <TableCell className="text-sm">{vo.vendor_name}</TableCell>
                      <TableCell>
                        <ItemsList vo={vo} />
                      </TableCell>
                      <TableCell>
                        <Badge className={vendorOrderStatusColors[vo.status] || "bg-muted"}>
                          {vo.status === "cancelled" ? "Cancelled - send back" : vendorOrderStatusLabel(vo.status, true)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatShortDate(vo.ready_by) ?? "-"}
                        {late && <Badge variant="destructive" className="ml-1 text-[10px]">Late</Badge>}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatShortDate(vo.expected_at_warehouse_on) ?? "-"}
                        {overdue && <Badge variant="destructive" className="ml-1 text-[10px]">Overdue</Badge>}
                      </TableCell>
                      <TableCell>
                        {booked ? (
                          <div className="space-y-0.5">
                            <TrackLink shipment={vo.inbound} />
                            {vo.inbound?.status_raw && (
                              <div className="text-[11px] text-muted-foreground">{vo.inbound.status_raw}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not booked yet</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {booked && <ReceiveButton vo={vo} onDone={data.refetch} />}
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

// Parcels at the warehouse: confirm receipt, then inspect.
export function InspectTab({ data, timing, isAdmin }: WarehouseViewProps) {
  const rows = data.vendorOrders
    .filter((vo) => (vo.status === "at_warehouse" && vo.qc_status !== "passed" && !vo.dispatch_id) || vo.status === "qc_failed")
    .sort((a, b) => (a.arrived_at_warehouse_at ?? a.updated_at).localeCompare(b.arrived_at_warehouse_at ?? b.updated_at));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receive &amp; inspect</CardTitle>
        <CardDescription>
          Confirm each parcel is in and where it's shelved, then check every item. Passed items move to Pack &amp; ship.
          An item that fails goes to admin: cancel and refund it (default), or ask the boutique for a replacement.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState text="Nothing waiting to be received or inspected." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Dispatch by</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((vo) => (
                  <TableRow key={vo.id} data-focus-id={`${vo.id} ${vo.order_id}`}>
                    <TableCell className="font-mono text-xs">{orderRef(vo.order_id)}</TableCell>
                    <TableCell className="text-sm">{vo.vendor_name}</TableCell>
                    <TableCell>
                      <ItemsList vo={vo} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {vo.received_at_warehouse_at ? (
                        <>
                          {formatDateTime(vo.received_at_warehouse_at)}
                          {vo.warehouse_shelf && <div className="text-muted-foreground">Shelf {vo.warehouse_shelf}</div>}
                        </>
                      ) : (
                        <Badge variant="outline">Delivered by courier - confirm</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {vo.received_at_warehouse_at ? formatShortDate(dispatchByDate(vo.received_at_warehouse_at, timing)) : "-"}
                    </TableCell>
                    <TableCell>
                      {!vo.received_at_warehouse_at ? (
                        <ReceiveButton vo={vo} onDone={data.refetch} label="Confirm receipt" />
                      ) : vo.status === "qc_failed" ? (
                        <div className="space-y-2 max-w-[280px]">
                          <p className="text-xs text-destructive">Failed: {vo.qc_notes}</p>
                          {isAdmin ? (
                            <div className="flex flex-wrap gap-2">
                              <PromptDialog
                                trigger={(open) => (
                                  <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={open}>
                                    Cancel &amp; refund
                                  </Button>
                                )}
                                title="Cancel and refund this item"
                                description="The customer is refunded for this boutique's items (if paid online) and told why; the item goes back to the boutique. The rest of the order ships."
                                confirmLabel="Cancel and refund"
                                destructive
                                onConfirm={async () => {
                                  const res = await runAction("resolve_qc_failure", { vendor_order_id: vo.id, decision: "cancel" }, "Cancelled - the item goes back to the boutique");
                                  if (res?.refund_error) toast.warning(`Refund failed: ${res.refund_error}`);
                                  if (res) data.refetch();
                                  return !!res;
                                }}
                              />
                              <PromptDialog
                                trigger={(open) => (
                                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={open}>
                                    Ask for replacement
                                  </Button>
                                )}
                                title="Ask the boutique for a replacement"
                                description="The failed item goes back to the boutique and they send a new one to the warehouse. The order waits for it."
                                confirmLabel="Ask for replacement"
                                onConfirm={async () => {
                                  const res = await runAction("resolve_qc_failure", { vendor_order_id: vo.id, decision: "replacement" }, "Boutique asked for a replacement");
                                  if (res) data.refetch();
                                  return !!res;
                                }}
                              />
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Waiting for an admin decision.</p>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <PromptDialog
                            trigger={(open) => (
                              <Button size="sm" className="h-8 text-xs gap-1" onClick={open}>
                                <CheckCircle className="h-3 w-3" /> Pass
                              </Button>
                            )}
                            title="Passed inspection"
                            description="Every item matches the order (product, size, colour, quantity) and is in perfect condition."
                            label="Notes (optional)"
                            confirmLabel="Pass"
                            onConfirm={async (notes) => {
                              const ok = await runRpc("warehouse_record_qc", { _vendor_order_id: vo.id, _passed: true, _notes: notes || null }, "Passed - ready to pack");
                              if (ok) data.refetch();
                              return ok;
                            }}
                          />
                          <PromptDialog
                            trigger={(open) => (
                              <Button size="sm" variant="destructive" className="h-8 text-xs gap-1" onClick={open}>
                                <XCircle className="h-3 w-3" /> Fail
                              </Button>
                            )}
                            title="Failed inspection"
                            description="Admin and the boutique are told; admin decides whether to cancel and refund it or ask for a replacement."
                            label="What's wrong?"
                            placeholder="e.g. stain on the sleeve, wrong size sent"
                            multiline
                            required
                            confirmLabel="Fail item"
                            destructive
                            onConfirm={async (notes) => {
                              const ok = await runRpc("warehouse_record_qc", { _vendor_order_id: vo.id, _passed: false, _notes: notes }, "Marked as failed");
                              if (ok) data.refetch();
                              return ok;
                            }}
                          />
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
    </Card>
  );
}
