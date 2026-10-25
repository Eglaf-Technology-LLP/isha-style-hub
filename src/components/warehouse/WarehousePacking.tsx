import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Undo2 } from "lucide-react";
import { CourierOption } from "@/hooks/useShipments";
import { WhDispatch, WhOrder, WhReturn, WhVendorOrder } from "@/hooks/useWarehouseData";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import {
  addCalendarDays,
  dispatchByDate,
  formatShortDate,
  inr,
  istToday,
  purposeLabels,
  vendorOrderStatusLabel,
} from "@/lib/warehouse";
import { CourierPickerDialog } from "./CourierPickerDialog";
import { formatWeightKg } from "@/lib/weight";
import { PackParcelDialog, type ParcelSize } from "./PackParcelDialog";
import { PackingSlipButton, PackingSlipData } from "./PackingSlip";
import { PromptDialog } from "./PromptDialog";
import { EmptyState, orderRef, runAction, runRpc, TrackLink, WarehouseInfo, WarehouseViewProps } from "./shared";
import { boutiqueDiscountShare } from "@/lib/coupons";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Same defaults the courier bookings use when a product has no weight/size.
const DEFAULT_ITEM_WEIGHT_GRAMS = 300;
const DEFAULT_ITEM_SIZE = { lengthCm: 25, breadthCm: 20, heightCm: 5 };

type ProductParcelData = { weight_grams: number | null; length_cm: number | null; breadth_cm: number | null; height_cm: number | null };

// The weight and size each boutique entered on its products.
function useProductParcelData(productIds: string[]) {
  const key = [...new Set(productIds)].sort().join(",");
  const [map, setMap] = useState<Map<string, ProductParcelData>>(new Map());
  useEffect(() => {
    if (!key) return;
    supabase
      .from("products")
      .select("id, weight_grams, length_cm, breadth_cm, height_cm")
      .in("id", key.split(","))
      .then(({ data }) => setMap(new Map((data ?? []).map((p) => [p.id, p as ProductParcelData]))));
  }, [key]);
  return map;
}

// Starting weight and size for the warehouse's parcel to the customer, from
// the boutiques' own product entries - never blank (Part 7, 8.2). The outer
// wrap adds next to nothing, so the weight is the pieces' total; pieces are
// laid side by side on the largest footprint and stacked in height.
function suggestParcel(parts: WhVendorOrder[], products: Map<string, ProductParcelData>): ParcelSize {
  let grams = 0;
  let lengthCm = 0;
  let breadthCm = 0;
  let heightCm = 0;
  for (const item of parts.flatMap((p) => p.items)) {
    const p = products.get(item.product_id);
    const qty = Math.max(1, item.quantity);
    grams += (Number(p?.weight_grams) || DEFAULT_ITEM_WEIGHT_GRAMS) * qty;
    lengthCm = Math.max(lengthCm, Number(p?.length_cm) || DEFAULT_ITEM_SIZE.lengthCm);
    breadthCm = Math.max(breadthCm, Number(p?.breadth_cm) || DEFAULT_ITEM_SIZE.breadthCm);
    heightCm += (Number(p?.height_cm) || DEFAULT_ITEM_SIZE.heightCm) * qty;
  }
  return {
    weightKg: Math.max(grams, 100) / 1000,
    lengthCm: Math.ceil(lengthCm || DEFAULT_ITEM_SIZE.lengthCm),
    breadthCm: Math.ceil(breadthCm || DEFAULT_ITEM_SIZE.breadthCm),
    heightCm: Math.ceil(heightCm || DEFAULT_ITEM_SIZE.heightCm),
  };
}

const SUGGESTED_NOTE = "Filled in from the boutiques' product weight and size - change it if the packed parcel is different.";

// What the courier collects for these parts of a Cash on Delivery order: their
// prices + delivery charge, less their share of any coupon (same as the server).
function codAmountFor(order: WhOrder, parts: WhVendorOrder[]): number | null {
  if (order.payment_method !== "cod") return null;
  const subtotal = parts.reduce((s, p) => s + Number(p.subtotal), 0);
  const shipping = parts.reduce((s, p) => s + Number(p.shipping_cost), 0);
  const discount = boutiqueDiscountShare(
    parts.flatMap((p) => p.items),
    Number(order.discount_amount),
    Number(order.subtotal),
  );
  return round2(subtotal + shipping - discount);
}

function slipFor(
  dispatch: WhDispatch,
  order: WhOrder,
  parts: WhVendorOrder[],
  warehouse: WarehouseInfo | null,
  rr: WhReturn | undefined,
): PackingSlipData {
  let groups: PackingSlipData["groups"];
  if (dispatch.purpose === "order") {
    groups = parts.map((p) => ({
      boutique: p.vendor_name,
      items: p.items.map((i) => ({
        title: i.product_title,
        detail: [i.variant_title, i.size && `Size ${i.size}`, i.color].filter(Boolean).join(" · ") || null,
        sku: i.sku,
        quantity: i.quantity,
      })),
    }));
  } else {
    groups = [
      {
        boutique: rr?.vendorNames.join(", ") || "Boutique",
        items: (rr?.items ?? []).map((i) => {
          const replacement = dispatch.purpose === "exchange_replacement";
          const size = replacement ? i.exchange_to?.size ?? i.size : i.size;
          const color = replacement ? i.exchange_to?.color ?? i.color : i.color;
          return {
            title: i.product_title,
            detail: [size && `Size ${size}`, color].filter(Boolean).join(" · ") || null,
            sku: null,
            quantity: i.quantity,
          };
        }),
      },
    ];
  }
  return {
    title: dispatch.purpose === "order" ? "Packing slip" : purposeLabels[dispatch.purpose],
    orderId: order.id,
    packedAt: dispatch.packed_at,
    customer: { name: order.customer_name, phone: order.customer_phone, address: order.shipping_address },
    warehouse: warehouse ? { name: warehouse.name, address: warehouse.address } : null,
    groups,
    codAmount: dispatch.purpose === "order" ? codAmountFor(order, parts) : null,
    parcel: {
      weightKg: Number(dispatch.weight_kg),
      lengthCm: Number(dispatch.length_cm),
      breadthCm: Number(dispatch.breadth_cm),
      heightCm: Number(dispatch.height_cm),
    },
    courier: dispatch.shipment ? { name: dispatch.shipment.courier_name, awb: dispatch.shipment.awb_code } : null,
    invoicesEnclosed: dispatch.purpose === "order" && order.payment_status === "paid",
  };
}

const ratesLoader = (dispatchId: string) => async () => {
  const res = await runAction<{ couriers: CourierOption[]; isCod: boolean; weightKg?: number }>("parcel_rates", { dispatch_id: dispatchId });
  return res && res.couriers ? res : null;
};

function PackedParcel({
  dispatch,
  order,
  parts,
  warehouse,
  rr,
  onChange,
}: {
  dispatch: WhDispatch;
  order: WhOrder;
  parts: WhVendorOrder[];
  warehouse: WarehouseInfo | null;
  rr?: WhReturn;
  onChange: () => void;
}) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium">
          {dispatch.purpose === "order" ? "Packed parcel" : purposeLabels[dispatch.purpose]} · {formatWeightKg(dispatch.weight_kg)} ·{" "}
          {dispatch.length_cm}×{dispatch.breadth_cm}×{dispatch.height_cm} cm
        </p>
        <Badge variant="outline">Not booked yet</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <PackingSlipButton data={slipFor(dispatch, order, parts, warehouse, rr)} />
        <PackParcelDialog
          triggerLabel="Edit size"
          variant="outline"
          title="Parcel weight and size"
          description="As packed - the courier charges on these."
          initial={{ weightKg: dispatch.weight_kg, lengthCm: dispatch.length_cm, breadthCm: dispatch.breadth_cm, heightCm: dispatch.height_cm }}
          onSubmit={async (s) => {
            const ok = await runRpc(
              "warehouse_update_dispatch_parcel",
              { _dispatch_id: dispatch.id, _weight_kg: s.weightKg, _length_cm: s.lengthCm, _breadth_cm: s.breadthCm, _height_cm: s.heightCm },
              "Parcel updated",
            );
            if (ok) onChange();
            return ok;
          }}
        />
        {dispatch.purpose === "order" && (
          <PromptDialog
            trigger={(open) => (
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={open}>
                <Undo2 className="h-3 w-3" /> Unpack
              </Button>
            )}
            title="Unpack this parcel?"
            description="Its parts go back to ready to pack."
            confirmLabel="Unpack"
            onConfirm={async () => {
              const ok = await runRpc("warehouse_cancel_dispatch", { _dispatch_id: dispatch.id }, "Unpacked");
              if (ok) onChange();
              return ok;
            }}
          />
        )}
        <CourierPickerDialog
          triggerLabel="Choose courier & book"
          title={`Book ${orderRef(order.id)} to ${order.customer_name}`}
          description={`From the warehouse to ${order.shipping_address?.city ?? ""} ${order.shipping_address?.pincode ?? ""}.`}
          loadRates={ratesLoader(dispatch.id)}
          onBook={async (courierId, etd) => {
            const res = await runAction("book_dispatch", { dispatch_id: dispatch.id, courier_id: courierId, courier_etd: etd }, "Booked - pickup requested");
            if (res) onChange();
            return !!res;
          }}
        />
      </div>
    </div>
  );
}

// Orders being put together: every part in and passed -> pack one parcel.
export function PackTab({ data, timing, isAdmin, warehouse }: WarehouseViewProps) {
  const today = istToday();
  const productIds = useMemo(() => data.vendorOrders.flatMap((vo) => vo.items.map((i) => i.product_id)), [data.vendorOrders]);
  const productParcelData = useProductParcelData(productIds);
  const packingDispatches = data.dispatches.filter((d) => d.status === "packing");
  const orderIds = [
    ...new Set([
      ...data.vendorOrders.filter((vo) => vo.status === "at_warehouse" && !vo.dispatch_id).map((vo) => vo.order_id),
      ...packingDispatches.map((d) => d.order_id),
    ]),
  ];

  const cards = orderIds
    .map((orderId) => {
      const order = data.orders.get(orderId);
      const parts = data.vendorOrders.filter((vo) => vo.order_id === orderId);
      const unpacked = parts.filter((p) => !p.dispatch_id && !["cancelled", "shipped", "out_for_delivery", "delivered", "ndr", "returned"].includes(p.status));
      const ready = unpacked.filter((p) => p.status === "at_warehouse" && p.qc_status === "passed");
      const missing = unpacked.filter((p) => !ready.includes(p));
      const dispatchBy = ready
        .map((p) => (p.received_at_warehouse_at ? dispatchByDate(p.received_at_warehouse_at, timing) : null))
        .filter((d): d is string => !!d)
        .sort()
        .pop();
      return { order, parts, ready, missing, dispatchBy, packed: packingDispatches.filter((d) => d.order_id === orderId) };
    })
    .filter((c) => c.order)
    .sort((a, b) => (a.dispatchBy ?? "9999").localeCompare(b.dispatchBy ?? "9999"));

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState text="Nothing to pack right now." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {cards.map(({ order, parts, ready, missing, dispatchBy, packed }) => {
        const o = order!;
        const lateDispatch = dispatchBy && dispatchBy < today;
        return (
          <Card key={o.id} data-focus-id={o.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">
                    Order {orderRef(o.id)} · {o.customer_name}
                  </CardTitle>
                  <CardDescription>
                    {o.shipping_address?.city}, {o.shipping_address?.state} {o.shipping_address?.pincode} ·{" "}
                    {o.payment_method === "cod" ? `Cash on Delivery (${inr(o.total)})` : "Prepaid"}
                  </CardDescription>
                </div>
                {dispatchBy && (
                  <Badge variant={lateDispatch ? "destructive" : "secondary"}>Dispatch by {formatShortDate(dispatchBy)}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* A return/exchange parcel alone doesn't need the order's own parts. */}
              <div className={ready.length + missing.length > 0 || packed.some((d) => d.purpose === "order") ? "space-y-2" : "hidden"}>
                {parts.map((p) => {
                  const overdue =
                    missing.includes(p) &&
                    ["pending", "confirmed", "processing", "in_transit_to_warehouse"].includes(p.status) &&
                    !!p.expected_at_warehouse_on &&
                    addCalendarDays(p.expected_at_warehouse_on, timing.maxWaitDays) < today;
                  const state = p.dispatch_id
                    ? p.status === "at_warehouse"
                      ? "In the packed parcel"
                      : vendorOrderStatusLabel(p.status, true)
                    : ready.includes(p)
                      ? `Ready${p.warehouse_shelf ? ` · shelf ${p.warehouse_shelf}` : ""}`
                      : p.status === "at_warehouse"
                        ? "Waiting for inspection"
                        : p.status === "qc_failed"
                          ? "Failed inspection - admin deciding"
                          : p.status === "cancelled"
                            ? "Cancelled"
                            : `Not arrived - expected ${formatShortDate(p.expected_at_warehouse_on) ?? "soon"}`;
                  return (
                    <div key={p.id} className="flex items-start justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0">
                      <div>
                        <p className="font-medium">{p.vendor_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.items.map((i) => `${i.product_title}${i.size ? ` (${i.size})` : ""} × ${i.quantity}`).join(", ")}
                        </p>
                      </div>
                      <div className="text-right space-y-1 shrink-0">
                        <span className={`text-xs ${ready.includes(p) ? "text-green-700" : "text-muted-foreground"}`}>{state}</span>
                        {overdue && <Badge variant="destructive" className="ml-1 text-[10px]">Overdue</Badge>}
                        {isAdmin && missing.includes(p) && p.status !== "qc_failed" && ready.length > 0 && (
                          <div>
                            <PromptDialog
                              trigger={(open) => (
                                <button className="text-xs text-destructive hover:underline" onClick={open}>
                                  Cancel this item
                                </button>
                              )}
                              title={`Cancel ${p.vendor_name}'s part of this order?`}
                              description="The customer is refunded for it (if paid online) and the rest of the order ships without it."
                              label="Reason (shown to the customer)"
                              placeholder="e.g. The boutique couldn't send it in time"
                              required
                              confirmLabel="Cancel item"
                              destructive
                              onConfirm={async (reason) => {
                                const { data: res, errorMessage } = await invokeEdgeFunction<{ skipped: { reason: string }[] }>(
                                  "cancel-order-items",
                                  { vendor_order_ids: [p.id], reason },
                                );
                                if (errorMessage || res?.skipped?.length) {
                                  toast.error(errorMessage ?? `Couldn't cancel - ${res!.skipped[0].reason}`);
                                  return false;
                                }
                                toast.success("Item cancelled");
                                data.refetch();
                                return true;
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {packed.map((d) => (
                <PackedParcel
                  key={d.id}
                  dispatch={d}
                  order={o}
                  parts={parts.filter((p) => p.dispatch_id === d.id)}
                  warehouse={warehouse}
                  rr={data.returns.find((r) => r.id === d.return_request_id)}
                  onChange={data.refetch}
                />
              ))}

              {ready.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {missing.length === 0 ? (
                    <PackParcelDialog
                      triggerLabel="Pack parcel"
                      title={`Pack order ${orderRef(o.id)}`}
                      description="Every part is in and passed. Pack everything in one AllBoutiqs parcel, then weigh and measure it."
                      initial={suggestParcel(ready, productParcelData)}
                      note={SUGGESTED_NOTE}
                      onSubmit={async (s) => {
                        const ok = await runRpc(
                          "warehouse_create_dispatch",
                          {
                            _order_id: o.id,
                            _vendor_order_ids: ready.map((p) => p.id),
                            _weight_kg: s.weightKg,
                            _length_cm: s.lengthCm,
                            _breadth_cm: s.breadthCm,
                            _height_cm: s.heightCm,
                          },
                          "Packed - print the slip and book the courier",
                        );
                        if (ok) data.refetch();
                        return ok;
                      }}
                    />
                  ) : isAdmin ? (
                    <PackParcelDialog
                      triggerLabel="Send what has arrived"
                      variant="outline"
                      title={`Send part of order ${orderRef(o.id)}`}
                      description={`Packs only the ${ready.length} part(s) that are ready. The rest follows in its own parcel when it arrives - or cancel it above.`}
                      initial={suggestParcel(ready, productParcelData)}
                      note={SUGGESTED_NOTE}
                      onSubmit={async (s) => {
                        const ok = await runRpc(
                          "warehouse_create_dispatch",
                          {
                            _order_id: o.id,
                            _vendor_order_ids: ready.map((p) => p.id),
                            _weight_kg: s.weightKg,
                            _length_cm: s.lengthCm,
                            _breadth_cm: s.breadthCm,
                            _height_cm: s.heightCm,
                            _allow_partial: true,
                          },
                          "Packed the parts that arrived",
                        );
                        if (ok) data.refetch();
                        return ok;
                      }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Waiting for {missing.length} more part(s). Only an admin can send part of an order.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const DISPATCH_STATUS: Record<string, { label: string; className: string }> = {
  booked: { label: "Booked - awaiting pickup", className: "bg-blue-100 text-blue-800" },
  shipped: { label: "On the way", className: "bg-indigo-100 text-indigo-800" },
  ndr: { label: "Delivery attempt failed", className: "bg-orange-100 text-orange-800" },
  rto: { label: "Coming back (undelivered)", className: "bg-red-100 text-red-800" },
  delivered: { label: "Delivered", className: "bg-green-100 text-green-800" },
};

// Parcels that have left (or are booked to leave) the warehouse.
export function DispatchedTab({ data, isAdmin, warehouse }: WarehouseViewProps) {
  const rows = data.dispatches.filter((d) => d.status !== "packing");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispatched to customers</CardTitle>
        <CardDescription>
          Booked and shipped parcels. An undelivered parcel comes back here - mark it received, then admin sends it again
          or cancels the order.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState text="No parcels dispatched recently." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Parcel</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => {
                  const order = data.orders.get(d.order_id);
                  if (!order) return null;
                  const parts = data.vendorOrders.filter((p) => p.dispatch_id === d.id);
                  const status = DISPATCH_STATUS[d.status] ?? { label: d.status, className: "bg-muted" };
                  const notPickedUp = !!d.shipment && ["pending", "awb_assigned", "pickup_scheduled"].includes(d.shipment.status);
                  return (
                    <TableRow key={d.id} data-focus-id={`${d.id} ${d.order_id}`}>
                      <TableCell className="font-mono text-xs">{orderRef(d.order_id)}</TableCell>
                      <TableCell className="text-xs">
                        {purposeLabels[d.purpose]}
                        <div className="text-muted-foreground">
                          {formatWeightKg(d.weight_kg)} · {formatShortDate(d.packed_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.customer_name}
                        <div className="text-xs text-muted-foreground">
                          {order.shipping_address?.city} {order.shipping_address?.pincode}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TrackLink shipment={d.shipment} />
                        {d.shipment?.label_url && (
                          <a
                            href={d.shipment.label_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary inline-flex items-center gap-0.5 hover:underline text-xs ml-2"
                          >
                            Label <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={status.className}>{status.label}</Badge>
                        {d.shipment?.status_raw && <div className="text-[11px] text-muted-foreground mt-1">{d.shipment.status_raw}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2 items-center">
                          <PackingSlipButton
                            label="Slip"
                            data={slipFor(d, order, parts, warehouse, data.returns.find((r) => r.id === d.return_request_id))}
                          />
                          {d.status === "booked" && notPickedUp && (
                            <PromptDialog
                              trigger={(open) => (
                                <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={open}>
                                  Cancel booking
                                </Button>
                              )}
                              title="Cancel this courier booking?"
                              description="The parcel goes back to packed, ready to book again (e.g. with another courier)."
                              confirmLabel="Cancel booking"
                              destructive
                              onConfirm={async () => {
                                const res = await runAction("cancel_dispatch_booking", { dispatch_id: d.id }, "Booking cancelled");
                                if (res) data.refetch();
                                return !!res;
                              }}
                            />
                          )}
                          {d.status === "rto" && !d.rto_received_at && (
                            <PromptDialog
                              trigger={(open) => (
                                <Button size="sm" className="h-8 text-xs" onClick={open}>
                                  Parcel is back
                                </Button>
                              )}
                              title="Undelivered parcel received?"
                              description="Confirm the parcel is back at the warehouse. Admin then decides to send it again or cancel the order."
                              confirmLabel="Mark received"
                              onConfirm={async () => {
                                const ok = await runRpc("warehouse_receive_rto", { _dispatch_id: d.id }, "Marked as back at the warehouse");
                                if (ok) data.refetch();
                                return ok;
                              }}
                            />
                          )}
                          {d.status === "rto" && d.rto_received_at && isAdmin && (
                            <>
                              <PromptDialog
                                trigger={(open) => (
                                  <Button size="sm" className="h-8 text-xs" onClick={open}>
                                    Send again
                                  </Button>
                                )}
                                title="Send this order again?"
                                description="Its parts go back to ready to pack, to be packed and booked again."
                                confirmLabel="Send again"
                                onConfirm={async () => {
                                  const ok = await runRpc("admin_redispatch_after_rto", { _dispatch_id: d.id }, "Back in Pack & ship");
                                  if (ok) data.refetch();
                                  return ok;
                                }}
                              />
                              <PromptDialog
                                trigger={(open) => (
                                  <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={open}>
                                    Cancel order
                                  </Button>
                                )}
                                title="Cancel this undelivered order?"
                                description="The customer is refunded (if paid online) and every item goes back to its boutique."
                                label="Reason"
                                placeholder="e.g. Customer unreachable after 3 attempts"
                                confirmLabel="Cancel order"
                                destructive
                                onConfirm={async (reason) => {
                                  const res = await runAction("rto_cancel", { dispatch_id: d.id, reason }, "Order cancelled - items go back to the boutiques");
                                  if (res) data.refetch();
                                  return !!res;
                                }}
                              />
                            </>
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
  );
}
