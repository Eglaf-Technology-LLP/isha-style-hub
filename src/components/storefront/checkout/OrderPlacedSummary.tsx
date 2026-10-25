import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/format";
import { formatDateWithDay } from "@/lib/dates";

interface PlacedOrder {
  id: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  shipping_cost: number;
  discount_amount: number;
  discount_code: string | null;
  cod_charge: number;
  total: number;
  customer_name: string;
  shipping_address: { address_line1?: string; address_line2?: string; city?: string; state?: string; pincode?: string } | null;
  estimated_delivery_date: string | null;
  order_items: { id: string; product_title: string; variant_title: string | null; quantity: number; price: number }[];
}

const isPlaced = (o: Pick<PlacedOrder, "payment_method" | "payment_status">) =>
  o.payment_method === "cod" || ["paid", "refunded"].includes(o.payment_status);

// "Your order is placed" with what was ordered - loaded from the order
// itself, so it is the same after a refresh or when the phone reopens the
// tab (Extra list G: it used to live only in the open page, and a refresh
// showed an empty cart). Calls onMissing when the order isn't this
// customer's or isn't placed.
export function OrderPlacedSummary({ orderId, onMissing }: { orderId: string; onMissing: () => void }) {
  const [order, setOrder] = useState<PlacedOrder | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("orders")
      .select(
        "id, payment_method, payment_status, subtotal, shipping_cost, discount_amount, discount_code, cod_charge, total, customer_name, shipping_address, estimated_delivery_date, order_items(id, product_title, variant_title, quantity, price)",
      )
      .eq("id", orderId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data || !isPlaced(data)) onMissing();
        else setOrder(data as unknown as PlacedOrder);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, onMissing]);

  if (!order) {
    return (
      <div className="flex justify-center py-40">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const a = order.shipping_address ?? {};
  const place = [a.city, a.state].filter(Boolean).join(", ");
  return (
    <div className="store-container py-14 md:py-20">
      <div className="mx-auto max-w-lg text-center">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-gold/40 bg-ivory">
          <CheckCircle className="h-9 w-9 text-gold" strokeWidth={1.5} />
        </span>
        <p className="eyebrow mt-8 text-gold">Thank you</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">
          Your order is <em className="font-normal text-primary">placed</em>
        </h1>
        <p className="mt-4 text-muted-foreground">
          {order.payment_method === "cod"
            ? `Pay ${formatINR(order.total)} in cash when it arrives. We've emailed you the details.`
            : "Your payment went through. We've emailed you the details."}
        </p>
        <p className="mt-6 inline-flex items-center gap-2 border border-border bg-ivory px-4 py-2 text-sm">
          Order <span className="font-mono font-medium">#{order.id.slice(0, 8).toUpperCase()}</span>
        </p>
      </div>

      <section aria-label="Order summary" className="mx-auto mt-10 max-w-lg border border-border bg-ivory p-5 text-sm md:p-6">
        <ul className="divide-y divide-border">
          {order.order_items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4 py-3 first:pt-0">
              <div className="min-w-0">
                <p className="line-clamp-2">{i.product_title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {i.variant_title && i.variant_title !== "Default" ? `${i.variant_title} · ` : ""}Qty {i.quantity}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{formatINR(Number(i.price) * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatINR(order.subtotal)}</dd>
          </div>
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between text-primary">
              <dt>Discount{order.discount_code ? ` (${order.discount_code})` : ""}</dt>
              <dd className="tabular-nums">-{formatINR(order.discount_amount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd className="tabular-nums">{Number(order.shipping_cost) > 0 ? formatINR(order.shipping_cost) : "Free"}</dd>
          </div>
          {Number(order.cod_charge) > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Cash on Delivery charge</dt>
              <dd className="tabular-nums">{formatINR(order.cod_charge)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-base font-medium">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatINR(order.total)}</dd>
          </div>
        </dl>
        <div className="mt-4 space-y-1 border-t border-border pt-4 text-muted-foreground">
          <p>
            <span className="text-foreground">Delivering to</span> {order.customer_name},{" "}
            {[a.address_line1, a.address_line2, place && a.pincode ? `${place} ${a.pincode}` : place].filter(Boolean).join(", ")}
          </p>
          {order.estimated_delivery_date && (
            <p>
              <span className="text-foreground">Expected by</span> {formatDateWithDay(order.estimated_delivery_date)}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto mt-8 flex max-w-lg flex-col justify-center gap-3 sm:flex-row">
        <Link
          to={`/orders?focus=${order.id}`}
          className="inline-flex h-12 items-center justify-center border border-foreground px-8 text-[11px] font-medium uppercase tracking-[0.22em] hover:bg-foreground hover:text-background"
        >
          Track your order
        </Link>
        <Link
          to="/"
          className="inline-flex h-12 items-center justify-center bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground hover:bg-maroon-deep"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
