import { Link } from "react-router-dom";
import { GrievanceContact, LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";
import { LEGAL_PATHS } from "@/lib/legal";
import { BANK_REFUND_DAYS, DEFAULT_REFUND_CHARGE, refundChargeLabel } from "@/lib/wallet";

const link = "text-primary underline-offset-4 hover:underline";

// Terms for shoppers, agreed to when an account is created - first version,
// for AllBoutiqs to correct.
const sections: LegalSection[] = [
  {
    id: "about",
    title: "About these terms",
    body: (
      <p>
        AllBoutiqs (allboutiqs.com) is a marketplace run by {COMPANY.legalName}, where independent boutiques and
        designer labels sell to you. Each piece is sold by the boutique named on its page; AllBoutiqs takes the order
        and payment, checks the piece and delivers it. These terms, with our{" "}
        <Link to={LEGAL_PATHS.privacy} className={link}>
          Privacy Policy
        </Link>
        , apply when you create an account and whenever you shop.
      </p>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>You must be 18 or older, or shop with a parent or guardian.</li>
        <li>Give your real name, email or mobile number and a full delivery address.</li>
        <li>Keep your sign-in codes and password private - what is done from your account is your responsibility.</li>
      </ul>
    ),
  },
  {
    id: "products-prices",
    title: "Products and prices",
    body: (
      <ul>
        <li>Prices are in Indian rupees and include GST. Delivery and any Cash on Delivery charge are shown before you pay.</li>
        <li>
          Boutiques describe and photograph their own pieces. Colours can look slightly different on screens, and
          handmade work can vary a little from piece to piece.
        </li>
        <li>Check the boutique's size chart before you order.</li>
      </ul>
    ),
  },
  {
    id: "orders",
    title: "Orders and payment",
    body: (
      <ul>
        <li>
          An order is placed when you choose Cash on Delivery, or when your online payment goes through. Online
          payments are handled securely by Razorpay.
        </li>
        <li>Cash on Delivery has a COD charge, shown at checkout and added to your total.</li>
        <li>A coupon applies only to the items and minimum order it is meant for, as shown at checkout.</li>
        <li>
          We may cancel an order - for example if a piece is out of stock, a price was clearly wrong, or the order
          looks fraudulent. Anything you paid is refunded in full.
        </li>
      </ul>
    ),
  },
  {
    id: "delivery",
    title: "Delivery",
    body: (
      <p>
        Pieces are checked at our quality-check centre in Deesa before they are sent to you. The delivery date at
        checkout is an estimate; you can track your order in{" "}
        <Link to="/orders" className={link}>
          My Orders
        </Link>
        . Please keep your phone reachable for the courier.
      </p>
    ),
  },
  {
    id: "returns",
    title: "Cancellations, returns and refunds",
    body: (
      <ul>
        <li>You can cancel an order from My Orders within 24 hours of placing it. After that it can't be cancelled.</li>
        <li>
          You can ask for a return or exchange from My Orders within 24 hours of delivery, with photos of the piece; it
          must be unused, with its tags.
        </li>
        <li>A customised piece can be returned only if it arrives damaged or is the wrong item, within 24 hours of delivery.</li>
        <li>
          A refund is due once a returned piece passes our check, or when a paid order is cancelled. You choose how to
          get it: as AllBoutiqs Wallet balance, straight away; back to the card or UPI you paid with (online
          payments); or by bank transfer (Cash on Delivery) - email your account holder name, account number, bank
          name and IFSC code to{" "}
          <a href={`mailto:${COMPANY.supportEmail}`} className={link}>
            {COMPANY.supportEmail}
          </a>{" "}
          and we transfer it within {BANK_REFUND_DAYS} working days. An order paid from the wallet is refunded to the
          wallet.
        </li>
        <li>
          Refunds to your bank or original payment have a refund charge of {refundChargeLabel(DEFAULT_REFUND_CHARGE)}{" "}
          of the amount; refunds to the wallet have none. There is no charge when the piece arrives damaged, is the
          wrong item, is not as described or is a different colour from the one shown, or when the boutique or
          AllBoutiqs cancels the order.
        </li>
      </ul>
    ),
  },
  {
    id: "wallet",
    title: "AllBoutiqs Wallet",
    body: (
      <ul>
        <li>Your wallet balance comes only from refunds you choose to take as wallet balance.</li>
        <li>
          It can be spent on AllBoutiqs orders: it pays first, and anything left is paid online (not with Cash on
          Delivery).
        </li>
        <li>It can't be topped up, withdrawn to a bank account or transferred to anyone else.</li>
        <li>
          You can see your balance and every entry in{" "}
          <Link to="/account?tab=wallet" className={link}>
            My Account
          </Link>
          .
        </li>
      </ul>
    ),
  },
  {
    id: "reviews",
    title: "Reviews",
    body: (
      <p>
        Reviews must be honest and about the piece you bought. We may remove reviews that are abusive, misleading or
        not about the product.
      </p>
    ),
  },
  {
    id: "responsibility",
    title: "Responsibility",
    body: (
      <p>
        Each boutique is responsible for the pieces it sells. AllBoutiqs is not liable for indirect losses, and its
        total liability for an order is limited to what you paid for that order. Nothing here takes away your rights
        under the Consumer Protection Act, 2019.
      </p>
    ),
  },
  {
    id: "changes-law",
    title: "Changes, law and disputes",
    body: (
      <p>
        We may update these terms; the date at the top shows the latest version. They are governed by the laws of
        India, and the courts at {COMPANY.jurisdiction} decide any dispute.
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

export default function CustomerTerms() {
  return (
    <LegalPage
      eyebrow="Shopping on AllBoutiqs"
      title="Terms & Conditions"
      intro={
        <p>
          Please read these terms before you create an account or order. Sellers have their own{" "}
          <Link to={LEGAL_PATHS.sellerTerms} className={link}>
            Seller Terms &amp; Conditions
          </Link>
          .
        </p>
      }
      sections={sections}
    />
  );
}
