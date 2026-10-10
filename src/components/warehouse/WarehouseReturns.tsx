import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeftRight, CheckCircle, ExternalLink, PackageOpen, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CourierOption } from "@/hooks/useShipments";
import { WhReturn } from "@/hooks/useWarehouseData";
import { formatShortDate, inr, returnStatusLabels, sendBackReasonLabels } from "@/lib/warehouse";
import { CourierPickerDialog } from "./CourierPickerDialog";
import { PromptDialog } from "./PromptDialog";
import { EmptyState, orderRef, runAction, runRpc, TrackLink, WarehouseViewProps } from "./shared";

const AWAITING_ARRIVAL = ["approved", "pickup_scheduled", "picked_up", "pickup_failed"];
const DONE = ["completed", "returned_to_customer", "replacement_shipped"];

const refundFor = (rr: WhReturn) =>
  Number(rr.refund_amount) > 0
    ? Number(rr.refund_amount)
    : rr.items.reduce((s, i) => s + Number(i.price ?? 0) * Number(i.quantity ?? 1), 0);

function ReturnItems({ rr }: { rr: WhReturn }) {
  return (
    <div className="space-y-1">
      {rr.items.map((i) => (
        <div key={i.order_item_id} className="text-xs">
          <span className="font-medium">{i.product_title}</span>
          <span className="text-muted-foreground">
            {" "}
            × {i.quantity}
            {(i.size || i.color) && ` (${[i.size, i.color].filter(Boolean).join(" · ")})`}
          </span>
          {rr.request_type === "exchange" && (i.exchange_to?.size || i.exchange_to?.color) && (
            <div className="text-primary">
              Exchange for {[i.exchange_to?.size, i.exchange_to?.color].filter(Boolean).join(" / ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function InspectButtons({ rr, onDone, replacement = false }: { rr: WhReturn; onDone: () => void; replacement?: boolean }) {
  const amount = refundFor(rr);
  const action = replacement ? "replacement_qc" : "return_qc";
  return (
    <div className="flex flex-wrap gap-2">
      <PromptDialog
        trigger={(open) => (
          <Button size="sm" className="h-8 text-xs gap-1" onClick={open}>
            <CheckCircle className="h-3 w-3" /> Pass
          </Button>
        )}
        title={replacement ? "Replacement passed inspection" : "Return passed inspection"}
        description={
          replacement
            ? "The replacement matches what the customer asked for and is in perfect condition."
            : rr.request_type === "return"
              ? `The items are unused, with tags. Passing refunds the customer ${inr(amount)} now (online payments; a Cash on Delivery order is flagged to admin to refund by hand) and the items go on to the boutique.`
              : "The old item is fine. It goes on to the boutique, and the replacement ships once it's here and passed."
        }
        label="Notes (optional)"
        confirmLabel="Pass"
        onConfirm={async (notes) => {
          const res = await runAction<{ refunded?: boolean; refund_error?: string | null }>(
            action,
            { return_request_id: rr.id, passed: true, notes },
            "Passed",
          );
          if (res?.refund_error) toast.warning(`Refund failed: ${res.refund_error} - admin has been told`);
          if (res) onDone();
          return !!res;
        }}
      />
      <PromptDialog
        trigger={(open) => (
          <Button size="sm" variant="destructive" className="h-8 text-xs gap-1" onClick={open}>
            <XCircle className="h-3 w-3" /> Fail
          </Button>
        )}
        title={replacement ? "Replacement failed inspection" : "Return failed inspection"}
        description={
          replacement
            ? "It goes back to the boutique, who are asked to send another."
            : "No refund. The items are packed to go back to the customer (see Pack & ship), and they're told why."
        }
        label="What's wrong?"
        placeholder={replacement ? "e.g. wrong size sent" : "e.g. tags removed, worn, item not ours"}
        multiline
        required
        confirmLabel="Fail"
        destructive
        onConfirm={async (notes) => {
          const res = await runAction(action, { return_request_id: rr.id, passed: false, notes }, "Marked as failed");
          if (res) onDone();
          return !!res;
        }}
      />
    </div>
  );
}

// Customer returns (and exchanges) coming back through the warehouse.
export function ReturnsTab({ data }: WarehouseViewProps) {
  const rows = [...data.returns].sort((a, b) => {
    const rank = (r: WhReturn) => (DONE.includes(r.status) ? 2 : r.status === "at_warehouse" ? 0 : 1);
    return rank(a) - rank(b) || b.created_at.localeCompare(a.created_at);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Returns &amp; exchanges</CardTitle>
        <CardDescription>
          Receive and inspect returns. A return that passes is refunded straight away and goes on to the boutique; one
          that fails goes back to the customer. Exchange replacements come here from the boutique and are sent on once
          the old item has passed.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState text="No returns coming through the warehouse." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((rr) => {
                  const order = data.orders.get(rr.order_id);
                  const replacementShipment = rr.replacements[0] ?? null;
                  return (
                    <TableRow key={rr.id} data-focus-id={`${rr.id} ${rr.order_id}`}>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="gap-1 mb-1">
                          {rr.request_type === "return" ? <RotateCcw className="h-3 w-3" /> : <ArrowLeftRight className="h-3 w-3" />}
                          {rr.request_type === "return" ? "Return" : "Exchange"}
                        </Badge>
                        <div className="font-mono">{orderRef(rr.order_id)}</div>
                        <div className="text-muted-foreground">{order?.customer_name}</div>
                        <div className="text-muted-foreground">{rr.vendorNames.join(", ")}</div>
                        <div className="text-muted-foreground max-w-[200px] truncate" title={rr.reason}>
                          {rr.reason}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ReturnItems rr={rr} />
                      </TableCell>
                      <TableCell>
                        <TrackLink shipment={rr.pickup} />
                        {rr.pickup?.status_raw && <div className="text-[11px] text-muted-foreground">{rr.pickup.status_raw}</div>}
                        {rr.received_at_warehouse_at && (
                          <div className="text-[11px] text-muted-foreground">
                            Received {formatShortDate(rr.received_at_warehouse_at)}
                            {rr.warehouse_shelf ? ` · shelf ${rr.warehouse_shelf}` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={rr.status === "qc_failed" ? "destructive" : "secondary"}>
                          {returnStatusLabels[rr.status] ?? rr.status}
                        </Badge>
                        {rr.warehouse_qc_notes && <div className="text-[11px] text-muted-foreground mt-1 max-w-[200px]">{rr.warehouse_qc_notes}</div>}
                        {rr.status === "qc_passed" && rr.request_type === "return" && (
                          <div className="text-[11px] text-amber-700 mt-1">Refund needs admin ({inr(refundFor(rr))})</div>
                        )}
                      </TableCell>
                      <TableCell className="space-y-2">
                        {AWAITING_ARRIVAL.includes(rr.status) || (rr.status === "at_warehouse" && !rr.received_at_warehouse_at) ? (
                          <PromptDialog
                            trigger={(open) => (
                              <Button size="sm" className="h-8 text-xs gap-1" onClick={open}>
                                <PackageOpen className="h-3 w-3" /> {rr.status === "at_warehouse" ? "Confirm receipt" : "Receive"}
                              </Button>
                            )}
                            title="Receive the returned items"
                            description={`Check the parcel holds ${rr.items.reduce((s, i) => s + i.quantity, 0)} piece(s) from order ${orderRef(rr.order_id)}.`}
                            label="Shelf / bin (optional)"
                            placeholder="e.g. R-2"
                            confirmLabel="Mark received"
                            onConfirm={async (shelf) => {
                              const ok = await runRpc("warehouse_receive_return", { _return_request_id: rr.id, _shelf: shelf || null }, "Return received");
                              if (ok) data.refetch();
                              return ok;
                            }}
                          />
                        ) : rr.status === "at_warehouse" ? (
                          <InspectButtons rr={rr} onDone={data.refetch} />
                        ) : null}

                        {rr.request_type === "exchange" && !DONE.includes(rr.status) && rr.status !== "qc_failed" && (
                          <div className="rounded-md border border-border p-2 space-y-1.5 text-xs">
                            <p className="font-medium">Replacement from the boutique</p>
                            {rr.replacement_received_at ? (
                              rr.replacement_qc_status === "passed" ? (
                                <p className="text-green-700">
                                  Passed{rr.warehouse_qc_status === "passed" ? " - pack it in Pack & ship" : " - waiting for the old item"}
                                </p>
                              ) : (
                                <InspectButtons rr={rr} onDone={data.refetch} replacement />
                              )
                            ) : (
                              <>
                                {replacementShipment ? (
                                  <TrackLink shipment={replacementShipment} />
                                ) : (
                                  <p className="text-muted-foreground">Not sent by the boutique yet</p>
                                )}
                                {rr.replacement_qc_notes && (
                                  <p className="text-destructive">Last one failed: {rr.replacement_qc_notes}</p>
                                )}
                                {replacementShipment && (
                                  <PromptDialog
                                    trigger={(open) => (
                                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={open}>
                                        Receive replacement
                                      </Button>
                                    )}
                                    title="Replacement received?"
                                    confirmLabel="Mark received"
                                    onConfirm={async () => {
                                      const ok = await runRpc("warehouse_receive_replacement", { _return_request_id: rr.id }, "Replacement received");
                                      if (ok) data.refetch();
                                      return ok;
                                    }}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        )}
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

// Items going back from the warehouse to their boutique.
export function SendBacksTab({ data }: WarehouseViewProps) {
  const rows = [...data.sendBacks].sort((a, b) => {
    const rank = (s: string) => (s === "required" ? 0 : s === "booked" ? 1 : 2);
    return rank(a.status) - rank(b.status) || b.created_at.localeCompare(a.created_at);
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Back to boutiques</CardTitle>
        <CardDescription>
          Cancelled orders, items that failed inspection, and returns that passed - each booked back to its boutique.
          AllBoutiqs pays the courier.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState text="Nothing to send back to boutiques." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sb) => (
                  <TableRow key={sb.id} data-focus-id={sb.id}>
                    <TableCell className="text-sm">
                      {sb.vendor_name}
                      <div className="text-xs font-mono text-muted-foreground">{orderRef(sb.order_id)}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {sendBackReasonLabels[sb.reason] ?? sb.reason}
                      {sb.notes && <div className="text-muted-foreground max-w-[200px]">{sb.notes}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {sb.items.map((i, idx) => (
                        <div key={idx}>
                          {i.product_title} × {i.quantity}
                          {(i.size || i.color) && <span className="text-muted-foreground"> ({[i.size, i.color].filter(Boolean).join(" · ")})</span>}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>
                      {sb.status === "delivered" ? (
                        <Badge className="bg-green-100 text-green-800">Delivered to boutique</Badge>
                      ) : sb.shipment && sb.status === "booked" ? (
                        <div className="space-y-1">
                          <TrackLink shipment={sb.shipment} />
                          {sb.shipment.label_url && (
                            <a href={sb.shipment.label_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5 hover:underline text-xs">
                              Label <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not booked</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sb.status === "required" && (
                        <CourierPickerDialog
                          triggerLabel="Choose courier & book"
                          title={`Send back to ${sb.vendor_name}`}
                          description="From the warehouse to the boutique's pickup address."
                          loadRates={async () => {
                            const res = await runAction<{ couriers: CourierOption[]; isCod: boolean }>("parcel_rates", { send_back_id: sb.id });
                            return res && res.couriers ? res : null;
                          }}
                          onBook={async (courierId, etd) => {
                            const res = await runAction("book_send_back", { send_back_id: sb.id, courier_id: courierId, courier_etd: etd }, "Booked - pickup requested");
                            if (res) data.refetch();
                            return !!res;
                          }}
                        />
                      )}
                      {sb.status === "booked" && sb.shipment && ["pending", "awb_assigned", "pickup_scheduled"].includes(sb.shipment.status) && (
                        <PromptDialog
                          trigger={(open) => (
                            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={open}>
                              Cancel booking
                            </Button>
                          )}
                          title="Cancel this courier booking?"
                          confirmLabel="Cancel booking"
                          destructive
                          onConfirm={async () => {
                            const res = await runAction("cancel_send_back_booking", { send_back_id: sb.id }, "Booking cancelled");
                            if (res) data.refetch();
                            return !!res;
                          }}
                        />
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
