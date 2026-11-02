import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Landmark, RotateCcw, Wallet } from "lucide-react";
import { COMPANY } from "@/lib/company";
import {
  BANK_DETAILS_FIELDS,
  BANK_REFUND_DAYS,
  REFUND_METHOD_LABEL,
  RefundCharge,
  RefundMethod,
  refundChargeLabel,
} from "@/lib/wallet";

interface RefundMethodPickerProps {
  options: RefundMethod[];
  value: RefundMethod | null;
  onChange: (method: RefundMethod) => void;
  // "return": refunded once the items pass the quality check.
  // "cancel": refunded as soon as the order is cancelled.
  context: "return" | "cancel";
  orderId: string;
  // The refund charge on the bank / original-payment options; null when
  // there's none (e.g. a damaged or wrong item). The wallet is always free.
  charge: RefundCharge | null;
}

// The customer chooses where their refund goes. Nothing is picked for them -
// each option says plainly how long it takes.
export function RefundMethodPicker({ options, value, onChange, context, orderId, charge }: RefundMethodPickerProps) {
  const orderRef = `#${orderId.slice(0, 8).toUpperCase()}`;
  const when = context === "return" ? "as soon as your items pass our quality check" : "as soon as you cancel";

  if (options.length === 1 && options[0] === "wallet") {
    return (
      <p className="flex gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
        This order was paid from your AllBoutiqs wallet, so the refund goes back to your wallet {when}.
      </p>
    );
  }

  const chargeText = charge
    ? ` A refund charge of ${refundChargeLabel(charge)} is deducted.`
    : " No refund charge on this one.";
  const text: Record<RefundMethod, string> = {
    wallet: `Instant and free - added to your wallet ${when}. Use the full amount on your next order.`,
    original:
      (context === "return"
        ? "Back to the card, UPI or netbanking you paid with, after the quality check. Banks usually take 5-7 working days."
        : "Back to the card, UPI or netbanking you paid with. Banks usually take 5-7 working days.") + chargeText,
    bank:
      `Email us your bank details. We transfer the refund within ${BANK_REFUND_DAYS} working days after the quality check.` +
      chargeText,
  };
  const icon = { wallet: Wallet, original: RotateCcw, bank: Landmark };

  return (
    <div className="space-y-2">
      <Label className="block text-sm font-medium">How would you like your refund?</Label>
      <RadioGroup value={value ?? ""} onValueChange={(v) => onChange(v as RefundMethod)} className="space-y-2">
        {options.map((method) => {
          const Icon = icon[method];
          return (
            <label
              key={method}
              htmlFor={`refund-${context}-${method}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50"
            >
              <RadioGroupItem value={method} id={`refund-${context}-${method}`} className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="h-4 w-4" />
                  {REFUND_METHOD_LABEL[method]}
                </span>
                <span className="block text-xs text-muted-foreground">{text[method]}</span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {value === "bank" && <BankDetailsNote orderRef={orderRef} />}
      {options.includes("wallet") && (
        <p className="text-[11px] text-muted-foreground">
          Wallet balance can be spent on any AllBoutiqs order. It can't be withdrawn to a bank account or transferred
          to someone else.
        </p>
      )}
    </div>
  );
}

// What a Cash on Delivery customer sends us for a bank refund.
export function BankDetailsNote({ orderRef }: { orderRef: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p className="mb-1.5">
        Email these details to{" "}
        <a href={`mailto:${COMPANY.supportEmail}?subject=${encodeURIComponent(`Bank details for refund - order ${orderRef}`)}`} className="font-medium underline">
          {COMPANY.supportEmail}
        </a>{" "}
        with your order number <strong>{orderRef}</strong>:
      </p>
      <ul className="list-disc space-y-0.5 pl-4">
        {BANK_DETAILS_FIELDS.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
      <p className="mt-1.5">
        We transfer the refund within {BANK_REFUND_DAYS} working days after your items pass our quality check.
      </p>
    </div>
  );
}
