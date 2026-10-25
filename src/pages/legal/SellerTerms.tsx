import { Link } from "react-router-dom";
import { GrievanceContact, LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";
import { LEGAL_PATHS } from "@/lib/legal";

const link = "text-primary underline-offset-4 hover:underline";

// Extra list from the client (E): first version, for AllBoutiqs to correct.
const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "About these terms",
    body: (
      <p>
        These terms are an agreement between your business ("you", the seller) and {COMPANY.legalName} ("AllBoutiqs",
        "we") for selling on allboutiqs.com. You accept them when you apply to sell, together with our{" "}
        <Link to={LEGAL_PATHS.privacy} className={link}>
          Privacy Policy
        </Link>
        . AllBoutiqs runs the marketplace; you are the seller of the products you list.
      </p>
    ),
  },
  {
    id: "registration",
    title: "Joining and verification",
    body: (
      <ul>
        <li>You must be a business in India with a valid PAN and GST registration.</li>
        <li>
          Everything you give us - business details, documents, bank account, pickup address - must be true and your
          own. Tell us straight away if any of it changes.
        </li>
        <li>
          We verify every application and may approve it, ask for more documents, or decline it. New stores start
          with each product checked by us before it goes live.
        </li>
        <li>Keep your sign-in details private. You are responsible for what is done from your account.</li>
      </ul>
    ),
  },
  {
    id: "listings",
    title: "Your products and listings",
    body: (
      <ul>
        <li>
          List only new, genuine products that you have the right to sell. No copies of other brands' designs, fake or
          counterfeit goods, or anything banned by Indian law.
        </li>
        <li>
          Photos, names, descriptions, sizes, fabric, colour and net quantity must match the product the customer
          receives. Choose the right category - it decides the HSN code and GST rate.
        </li>
        <li>
          You set your Product Value (before GST); the customer sees the price including GST. Keep your stock up to
          date so customers can only buy what you have.
        </li>
        <li>
          We may improve how a listing is presented (for example its title or photo crop), hide it while we check it,
          or remove it if it breaks these terms.
        </li>
      </ul>
    ),
  },
  {
    id: "orders",
    title: "Orders and dispatch",
    body: (
      <ul>
        <li>Confirm each new order promptly in your dashboard and have it ready within the preparation time shown.</li>
        <li>
          Pack each piece well and send it as your dashboard shows - to the AllBoutiqs quality-check centre in Deesa,
          or straight to the customer. A piece that fails the quality check is sent back to you and is not paid for.
        </li>
        <li>
          Customer details are given to you only to make and send the order. Do not contact the customer directly, add
          them to your own lists, or use their details for anything else - AllBoutiqs is the customer's point of
          contact.
        </li>
        <li>If you cannot fulfil an order, tell us at once. Repeated cancellations or late dispatch may limit your store.</li>
      </ul>
    ),
  },
  {
    id: "returns",
    title: "Returns, exchanges and refunds",
    body: (
      <ul>
        <li>
          Customers can return or exchange pieces under the return policy shown on the product page. A customised
          piece can be returned only if it arrives damaged or is the wrong item, within 24 hours of delivery.
        </li>
        <li>
          Returned pieces are checked when they come back. Where a return is because of you - a damaged, wrong or
          not-as-described piece - the refund and return shipping may be recovered from your payouts.
        </li>
      </ul>
    ),
  },
  {
    id: "fees-payouts",
    title: "Fees, taxes and payouts",
    body: (
      <>
        <p>For each order, your payout is the price the customer paid for your items, less:</p>
        <ul>
          <li>AllBoutiqs' commission (0% during a Founding Boutique period) and technology fee, with GST on both;</li>
          <li>the payment gateway fee on online payments;</li>
          <li>courier and Cash on Delivery charges, where they are charged to you;</li>
          <li>GST TCS (section 52, CGST Act) and income-tax TDS (section 194-O), at the rates set by law;</li>
          <li>your share of any coupon used on your items.</li>
        </ul>
        <p>
          The rates in force are shown in your dashboard, and every order's breakdown is in your statement. If a rate
          changes we will tell you in advance; the new rate applies to orders placed after it starts.
        </p>
        <p>
          Payouts go to your verified bank account once the customer's return window for the order has ended. We may
          hold a payout to cover a refund, chargeback or amount you owe us. GST invoices for your sales are issued in
          your name and GSTIN through AllBoutiqs; filing your own GST and income-tax returns is your responsibility.
        </p>
      </>
    ),
  },
  {
    id: "brand-content",
    title: "Your brand and content",
    body: (
      <p>
        You keep ownership of your brand, logo, photos and descriptions. You allow AllBoutiqs, free of charge, to use
        them to show, promote and advertise your products - on the site, in emails, on social media and in ads - while
        you sell with us. You confirm you have the rights to everything you upload.
      </p>
    ),
  },
  {
    id: "suspension",
    title: "Suspension and closing your store",
    body: (
      <>
        <p>
          We may pause listings or suspend a store for fake or counterfeit goods, false information, poor quality,
          repeated cancellations or late dispatch, misuse of customer data, fraud, or any other breach of these terms.
        </p>
        <p>
          You may close your store with 30 days' written notice to{" "}
          <a href={`mailto:${COMPANY.supportEmail}`} className={link}>
            {COMPANY.supportEmail}
          </a>
          . Orders already placed must still be fulfilled; your final payout is made once their return windows end and
          any amounts due are settled.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Responsibility",
    body: (
      <ul>
        <li>
          You are responsible for the products you sell - their quality, safety, labelling (including under the Legal
          Metrology rules) and legality - and for your own taxes.
        </li>
        <li>
          You will make good any loss, claim or penalty AllBoutiqs suffers because of your products or a breach of
          these terms.
        </li>
        <li>
          AllBoutiqs is not liable for indirect losses such as lost profit. Our total liability to you is limited to
          the fees you paid us in the three months before the claim.
        </li>
      </ul>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. We will tell you by email or in your dashboard before an important change takes
        effect; selling after that date means you accept the new terms.
      </p>
    ),
  },
  {
    id: "law",
    title: "Law and disputes",
    body: (
      <p>
        These terms are governed by the laws of India. Any dispute will be decided by the courts at{" "}
        {COMPANY.jurisdiction}.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <p>For questions about these terms or a complaint, contact us:</p>
        <GrievanceContact />
      </>
    ),
  },
];

export default function SellerTerms() {
  return (
    <LegalPage
      eyebrow="Selling on AllBoutiqs"
      title="Seller Terms & Conditions"
      intro={
        <p>
          Please read these terms before you apply. They explain what AllBoutiqs expects from sellers, what we do for
          you, and how fees and payouts work.
        </p>
      }
      sections={sections}
    />
  );
}
