import { Link } from "react-router-dom";
import { GrievanceContact, LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY, telHref } from "@/lib/company";
import { LEGAL_PATHS, STORE_POLICIES_UPDATED } from "@/lib/legal";
import { ADDRESS_LINE1_MIN } from "@/lib/addressLine1";
import { returnWindowSpan, useReturnWindowHours } from "@/hooks/useReturnWindowHours";

const link = "text-primary underline-offset-4 hover:underline";

// Footer page (client corrections, 15 Nov 2026), written from how the store
// already works - first version, for AllBoutiqs to correct.
export default function ShippingPolicy() {
  const windowHours = useReturnWindowHours();

  const sections: LegalSection[] = [
    {
      id: "where",
      title: "Where we deliver",
      body: (
        <>
          <p>We deliver to addresses in India, through our courier partners.</p>
          <p>
            Please give a full delivery address: address line 1 needs at least {ADDRESS_LINE1_MIN} characters - house /
            flat or shop / building number, street and area - and the correct PIN code. Keep your phone reachable for
            the courier.
          </p>
        </>
      ),
    },
    {
      id: "quality-check",
      title: "Quality check before dispatch",
      body: (
        <p>
          Each boutique sends your piece to our quality-check centre in Deesa. We check it there, then pack it and send
          it to you. An order with pieces from more than one boutique can arrive in more than one parcel.
        </p>
      ),
    },
    {
      id: "time",
      title: "Delivery time",
      body: (
        <ul>
          <li>Each product page shows how many days the boutique needs to get the piece ready.</li>
          <li>A customised piece takes the extra days shown on its page.</li>
          <li>
            Checkout shows an estimated delivery date for your PIN code. It is an estimate; we keep you updated in{" "}
            <Link to="/orders" className={link}>
              My Orders
            </Link>
            .
          </li>
        </ul>
      ),
    },
    {
      id: "charges",
      title: "Delivery charges",
      body: (
        <p>
          Each boutique sets its own delivery charge: free delivery, a flat rate, or free above an order amount. The
          product page shows it, and checkout shows the full delivery charge before you pay.
        </p>
      ),
    },
    {
      id: "cod",
      title: "Cash on Delivery",
      body: (
        <p>
          Cash on Delivery is available on pieces whose page says so. A COD fee of 3% + GST is added at checkout and
          shown before you place the order.
        </p>
      ),
    },
    {
      id: "tracking",
      title: "Tracking your order",
      body: (
        <p>
          Follow every step of your order in{" "}
          <Link to="/orders" className={link}>
            My Orders
          </Link>
          , including the courier name and tracking (AWB) number once it ships.
        </p>
      ),
    },
    {
      id: "damaged",
      title: "Damaged parcel or wrong item",
      body: (
        <p>
          If a piece arrives damaged or defective, or is the wrong item, report it from My Orders within{" "}
          {returnWindowSpan(windowHours)} of delivery. See our{" "}
          <Link to={LEGAL_PATHS.returns} className={link}>
            Return &amp; Refund Policy
          </Link>
          .
        </p>
      ),
    },
    {
      id: "contact",
      title: "Questions",
      body: (
        <>
          <p>
            Call{" "}
            <a href={telHref(COMPANY.supportPhone)} className={link}>
              {COMPANY.supportPhone}
            </a>
            , WhatsApp{" "}
            <a href={COMPANY.whatsappUrl} target="_blank" rel="noopener noreferrer" className={link}>
              {COMPANY.whatsapp}
            </a>{" "}
            (WhatsApp only) or email{" "}
            <a href={`mailto:${COMPANY.supportEmail}`} className={link}>
              {COMPANY.supportEmail}
            </a>
            .
          </p>
          <GrievanceContact />
        </>
      ),
    },
  ];

  return (
    <LegalPage
      eyebrow="Shopping on AllBoutiqs"
      title="Shipping Policy"
      intro={<p>How your order reaches you: where we deliver, how long it takes and what it costs.</p>}
      sections={sections}
      updated={STORE_POLICIES_UPDATED}
    />
  );
}
