import { Link } from "react-router-dom";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { LEGAL_PATHS } from "@/lib/legal";
import { CUSTOMER_CANCEL_WINDOW_HOURS } from "@/lib/orderCancel";
import { BANK_REFUND_DAYS } from "@/lib/wallet";
import { returnWindowSpan, useReturnWindowHours } from "@/hooks/useReturnWindowHours";

const link = "text-primary underline-offset-4 hover:underline";

// Footer page (client corrections, 15 Nov 2026): short answers from the
// Shipping and Return & Refund policies, each linking to the full text.
export default function Faq() {
  const span = returnWindowSpan(useReturnWindowHours());
  const myOrders = (
    <Link to="/orders" className={link}>
      My Orders
    </Link>
  );
  const shipping = (
    <Link to={LEGAL_PATHS.shipping} className={link}>
      Shipping Policy
    </Link>
  );
  const returns = (
    <Link to={LEGAL_PATHS.returns} className={link}>
      Return &amp; Refund Policy
    </Link>
  );

  const sections: LegalSection[] = [
    {
      id: "track",
      title: "How do I track my order?",
      body: <p>Open {myOrders}. Once your order ships, it shows the courier name and tracking (AWB) number.</p>,
    },
    {
      id: "delivery-time",
      title: "How long does delivery take?",
      body: (
        <p>
          Each product page shows how many days the boutique needs to get the piece ready, and checkout shows an
          estimated delivery date for your PIN code. Every piece is checked at our quality-check centre in Deesa before
          it ships. More in our {shipping}.
        </p>
      ),
    },
    {
      id: "delivery-charge",
      title: "Is delivery free?",
      body: (
        <p>
          Each boutique sets its own delivery charge: free, a flat rate, or free above an order amount. You see it on
          the product page and at checkout before you pay.
        </p>
      ),
    },
    {
      id: "cod",
      title: "Can I pay Cash on Delivery?",
      body: <p>Yes, on pieces whose page says "Cash on Delivery available". A COD fee of 3% + GST is added at checkout.</p>,
    },
    {
      id: "cancel",
      title: "Can I cancel my order?",
      body: (
        <p>
          Yes, from {myOrders} within {CUSTOMER_CANCEL_WINDOW_HOURS} hours of placing it, as long as it hasn't been
          packed for shipping yet.
        </p>
      ),
    },
    {
      id: "return",
      title: "Can I return a piece?",
      body: (
        <p>
          A returnable piece can be returned within {span} of delivery. A piece marked "Not returnable", or a
          customised piece, can be returned only if it arrives damaged or defective, or is the wrong item - report it
          within {span} of delivery. Start a return in {myOrders}. More in our {returns}.
        </p>
      ),
    },
    {
      id: "refund",
      title: "How and when do I get my refund?",
      body: (
        <p>
          Once the returned items pass our quality check: instantly to your AllBoutiqs Wallet, or back to your card,
          UPI or netbanking (banks usually take 5-7 working days). Cash on Delivery orders can be refunded by bank
          transfer within {BANK_REFUND_DAYS} working days. More in our {returns}.
        </p>
      ),
    },
    {
      id: "wallet",
      title: "Can I withdraw my wallet balance?",
      body: (
        <p>
          No. Wallet balance can be spent on any AllBoutiqs order, but it can't be withdrawn to a bank account or
          transferred to someone else.
        </p>
      ),
    },
    {
      id: "sell",
      title: "How can my boutique sell on AllBoutiqs?",
      body: (
        <p>
          Apply on{" "}
          <Link to="/sell-with-us" className={link}>
            Sell on AllBoutiqs
          </Link>
          .
        </p>
      ),
    },
    {
      id: "contact",
      title: "How do I contact you?",
      body: (
        <p>
          See{" "}
          <Link to={LEGAL_PATHS.contact} className={link}>
            Contact us
          </Link>{" "}
          for phone, WhatsApp, email and our Grievance Officer.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      eyebrow="Help"
      title="Frequently asked questions"
      intro={<p>Quick answers about orders, delivery, returns and refunds.</p>}
      sections={sections}
      updated={null}
    />
  );
}
