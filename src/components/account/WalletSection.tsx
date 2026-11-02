import { Link } from "react-router-dom";
import { Loader2, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { AccountSectionTitle } from "@/components/storefront/account/AccountKit";
import { formatMoney } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { WALLET_KIND_LABEL } from "@/lib/wallet";
import { cn } from "@/lib/utils";

export function WalletSection() {
  const { user } = useAuth();
  const { balance, transactions, loading } = useWallet(user?.id, { withHistory: true });

  return (
    <div className="max-w-3xl">
      <AccountSectionTitle
        title="Wallet"
        text="Refunds you choose to take as wallet balance, ready to spend on your next order."
      />

      <div className="mb-10 flex flex-col gap-6 border border-border bg-ivory p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Available balance</p>
            <p className="font-serif text-3xl">
              {loading && balance === null ? <Loader2 className="h-6 w-6 animate-spin" /> : formatMoney(balance ?? 0)}
            </p>
          </div>
        </div>
        {!!balance && balance > 0 && (
          <Link
            to="/category/all"
            className="inline-flex h-11 items-center justify-center bg-primary px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground hover:bg-maroon-deep"
          >
            Shop now
          </Link>
        )}
      </div>

      <div className="mb-10 space-y-2 text-sm text-muted-foreground">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground">How your wallet works</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            When you return an item or cancel a paid order, you can take the refund in your wallet. It's added instantly -
            for a return, as soon as the items pass our quality check.
          </li>
          <li>At checkout, your balance can pay for part of an order or the whole of it.</li>
          <li>
            Wallet balance can't be topped up, withdrawn to a bank account or transferred to someone else. If you'd rather
            have a refund back in your bank, choose that option when you return or cancel.
          </li>
        </ul>
      </div>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em]">History</p>
      {loading && transactions.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : transactions.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No wallet activity yet.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {transactions.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-4 py-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{WALLET_KIND_LABEL[t.kind] ?? "Wallet update"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(t.created_at)}
                  {t.order_id && ` · Order #${t.order_id.slice(0, 8).toUpperCase()}`}
                </p>
                {t.kind === "adjustment" && t.note && <p className="mt-0.5 text-xs text-muted-foreground">{t.note}</p>}
              </div>
              <span className={cn("shrink-0 font-medium", t.amount > 0 ? "text-emerald-700" : "text-foreground")}>
                {t.amount > 0 ? "+" : "-"}
                {formatMoney(Math.abs(t.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
