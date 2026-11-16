import { Link } from "react-router-dom";
import { GrievanceContact, LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";
import { STORE_POLICIES_UPDATED } from "@/lib/legal";
import { CUSTOMER_CANCEL_WINDOW_HOURS } from "@/lib/orderCancel";
import { BANK_REFUND_DAYS, CHARGE_FREE_RETURN_REASONS, refundChargeLabel } from "@/lib/wallet";
import { useRefundCharge } from "@/hooks/useWallet";
import { returnWindowSpan, useReturnWindowHours } from "@/hooks/useReturnWindowHours";

const link = "text-primary underline-offset-4 hover:underline";

// Footer page (client corrections, 15 Nov 2026), written from how returns
// and refunds already work (ReturnRequestForm, RefundMethodPicker, wallet) -
// first version, for AllBoutiqs to correct. The return window and refund
// charge are read from Admin settings, so the page follows them.
export default function ReturnRefundPolicy() {
  const span = returnWindowSpan(useReturnWindowHours());
  const refundCharge = useRefundCharge();
  const myOrders = (
    <Link to="/orders" className={link}>
      My Orders
    </Link>
  );

  const sections: LegalSection[] = [
    {
      id: "window",
      title: "Return window",
      body: (
        <>
          <p>Every product page says whether the piece is returnable.</p>
          <ul>
            <li>
              <strong>Returnable piece</strong> - return it within {span} of delivery.
            </li>
            <li>
              <strong>Not returnable</strong> - if it arrives damaged or defective, or is the wrong item, report it
              within {span} of delivery.
            </li>
            <li>
              <strong>Customised piece</strong> - can be returned only if it arrives damaged or defective, or is the
              wrong item, within {span} of delivery.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "how",
      title: "How to return",
      body: (
        <ul>
          <li>Open {myOrders}, choose the items and the reason.</li>
          <li>Add 3 clear photos of every item: the front, the back and the tag.</li>
          <li>The item must be unused, unwashed and unaltered, with its original packaging if you still have it.</li>
          <li>We arrange a courier pickup. Pack the item the same way - it is checked against your photos.</li>
        </ul>
      ),
    },
    {
      id: "refunds",
      title: "Refunds",
      body: (
        <>
          <p>
            Your refund is made once the returned items pass our quality check. You choose where it goes:
          </p>
          <ul>
            <li>
              <strong>AllBoutiqs Wallet</strong> - instant and free, the full amount. Wallet balance can be spent on any
              AllBoutiqs order; it can't be withdrawn to a bank account or transferred to someone else.
            </li>
            <li>
              <strong>Paid online</strong> - back to the card, UPI or netbanking you paid with, the full amount. Banks
              usually take 5-7 working days.
            </li>
            <li>
              <strong>Cash on Delivery</strong> - to your wallet, or by bank transfer: email your bank details and order
              number to{" "}
              <a href={`mailto:${COMPANY.supportEmail}`} className={link}>
                {COMPANY.supportEmail}
              </a>{" "}
              and we transfer the refund within {BANK_REFUND_DAYS} working days after the quality check. A refund
              charge of {refundChargeLabel(refundCharge)} is deducted from a bank transfer, except when the reason is:{" "}
              {CHARGE_FREE_RETURN_REASONS.map((r) => r.toLowerCase()).join("; ")}.
            </li>
            <li>
              <strong>Paid from your wallet</strong> - back to your wallet.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "cancel",
      title: "Cancelling an order",
      body: (
        <p>
          You can cancel from {myOrders} within {CUSTOMER_CANCEL_WINDOW_HOURS} hours of placing the order, as long as it
          hasn't been packed for shipping yet. If you paid online, choose whether the refund goes to your wallet or back to your
          payment method.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Questions and complaints",
      body: (
        <>
          <p>We acknowledge every complaint within 48 hours and resolve it within one month.</p>
          <GrievanceContact />
        </>
      ),
    },
  ];

  return (
    <LegalPage
      eyebrow="Shopping on AllBoutiqs"
      title="Return & Refund Policy"
      intro={<p>When a piece can be returned, how to return it, and how and when you get your money back.</p>}
      sections={sections}
      updated={STORE_POLICIES_UPDATED}
    />
  );
}
