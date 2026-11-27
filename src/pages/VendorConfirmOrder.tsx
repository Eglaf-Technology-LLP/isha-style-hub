import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShoppingBag } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatDateTimeInWords } from "@/lib/dates";

// Opened from the boutique's new-order email. Only the Confirm order button
// confirms the order (client, 27 Nov 2026: no order is ever confirmed on its
// own) - opening the link, or a mail scanner checking it, changes nothing.
// supabase/functions/accept-vendor-order does the work.

type Result = "pending" | "accepted" | "already_accepted" | "expired" | "not_pending" | "invalid";

interface OrderInfo {
  result: Result;
  order_ref?: string;
  placed_at?: string;
  items?: { title: string; options: string; quantity: number }[];
}

const MESSAGES: Record<Exclude<Result, "pending">, { title: string; text: string }> = {
  accepted: { title: "Order confirmed", text: "Thank you. The customer and the AllBoutiqs team have been told. Prepare the order and ship it from your Seller Dashboard." },
  already_accepted: { title: "Already confirmed", text: "This order is already confirmed. Nothing more to do here." },
  expired: { title: "Link expired", text: "This link has expired. Please confirm the order from your Seller Dashboard." },
  not_pending: { title: "Order no longer waiting", text: "This order can't be confirmed from this link any more. Check its status in your Seller Dashboard." },
  invalid: { title: "Link not valid", text: "This link isn't valid. Open the latest order email, or confirm the order from your Seller Dashboard." },
};

export default function VendorConfirmOrder() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [info, setInfo] = useState<OrderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invokeEdgeFunction<OrderInfo>("accept-vendor-order", { token, action: "check" }).then(({ data, errorMessage }) => {
      if (cancelled) return;
      if (errorMessage || !data) setError(errorMessage || "Something went wrong. Please confirm the order from your Seller Dashboard.");
      else setInfo(data);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = async () => {
    setConfirming(true);
    const { data, errorMessage } = await invokeEdgeFunction<{ result: Result }>("accept-vendor-order", { token, action: "confirm" });
    setConfirming(false);
    if (errorMessage || !data) {
      setError(errorMessage || "Something went wrong. Please confirm the order from your Seller Dashboard.");
      return;
    }
    setInfo((prev) => ({ ...(prev ?? {}), result: data.result }));
  };

  const done = info && info.result !== "pending" ? MESSAGES[info.result] ?? MESSAGES.invalid : null;

  return (
    <div className="min-h-screen bg-background">
      <Header variant="seller" />
      <main className="store-container py-16">
        <div className="mx-auto max-w-lg border border-border bg-background p-8">
          {!info && !error ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <>
              <h1 className="font-serif text-3xl">Couldn't open this order</h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{error}</p>
            </>
          ) : done ? (
            <>
              {info?.result === "accepted" && <CheckCircle2 className="mb-4 h-10 w-10 text-primary" />}
              <h1 className="font-serif text-3xl">{done.title}</h1>
              {info?.order_ref && <p className="mt-1 font-mono text-sm">Order {info.order_ref}</p>}
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{done.text}</p>
            </>
          ) : (
            <>
              <ShoppingBag className="mb-4 h-8 w-8 text-gold" strokeWidth={1.5} />
              <h1 className="font-serif text-3xl">Confirm this order?</h1>
              <p className="mt-1 font-mono text-sm">Order {info?.order_ref}</p>
              {info?.placed_at && (
                <p className="text-xs text-muted-foreground">Placed {formatDateTimeInWords(info.placed_at)}</p>
              )}
              <ul className="mt-5 space-y-2 border-y border-border py-4 text-sm">
                {(info?.items ?? []).map((item, n) => (
                  <li key={n}>
                    {item.title} × {item.quantity}
                    {item.options && <span className="block text-xs text-muted-foreground">{item.options}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Confirm only if you can prepare and send it on time. The customer and AllBoutiqs are told as soon as you
                confirm.
              </p>
              <button
                type="button"
                onClick={confirm}
                disabled={confirming}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 bg-primary text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm order
              </button>
            </>
          )}
          <Link
            to="/vendor?tab=orders"
            className="mt-6 inline-block text-[11px] font-medium uppercase tracking-[0.18em] text-primary hover:underline"
          >
            Open Seller Dashboard
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
