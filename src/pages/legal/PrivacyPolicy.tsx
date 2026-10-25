import { Link } from "react-router-dom";
import { GrievanceContact, LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";
import { LEGAL_PATHS } from "@/lib/legal";

// Extra list from the client (E): first version, for AllBoutiqs to correct.
const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <p>
        AllBoutiqs (allboutiqs.com) is a marketplace where independent boutiques and designer labels sell to customers
        across India. It is run by <strong>{COMPANY.legalName}</strong> (CIN {COMPANY.cin}, GSTIN {COMPANY.gstin}),{" "}
        {COMPANY.officeAddress}. In this policy "we" and "us" mean {COMPANY.legalName}.
      </p>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <p>
          <strong>When you shop:</strong> your name, email address, mobile number, delivery addresses, your orders,
          cart and wishlist, return or exchange requests and the photos you add to them, and any measurements or notes
          you give for a customised piece.
        </p>
        <p>
          <strong>When you sell:</strong> your boutique and business details, PAN, GSTIN, business type, the details
          of the authorised and contact persons, your pickup address, your bank account for payouts, the documents you
          upload for verification, and your product listings and photos.
        </p>
        <p>
          <strong>Payments:</strong> online payments are handled by Razorpay. We receive the payment status, the
          method used (for example UPI or card) and a transaction reference. We never see or store your full card
          number, CVV, UPI PIN or net-banking password.
        </p>
        <p>
          <strong>On this website:</strong> your browser keeps your sign-in, cart and recently viewed pieces on your
          device so the site works between visits. We may also see basic technical details such as your browser and
          device type.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: (
      <ul>
        <li>To take, pack, ship and deliver your orders, and to handle cancellations, returns, exchanges and refunds.</li>
        <li>To send sign-in codes by email or SMS, and order and delivery updates.</li>
        <li>To check pieces at our quality-check centre before they reach you.</li>
        <li>To verify boutiques before they sell, and to pay them for their sales.</li>
        <li>To issue GST invoices and meet our tax duties, including GST TCS and income-tax TDS on sellers' sales.</li>
        <li>To answer your questions and complaints, and to prevent fraud and misuse.</li>
        <li>
          To send newsletters and offers - only if you subscribed or agreed to promotional emails. You can stop them at
          any time from the link in the email or by writing to us.
        </li>
      </ul>
    ),
  },
  {
    id: "who-we-share-with",
    title: "Who we share it with",
    body: (
      <>
        <p>We share only what each party needs to do its part. We do not sell your personal data.</p>
        <ul>
          <li>
            <strong>The boutique</strong> that makes or sells your piece gets your name, delivery address and order
            details. It does not get your phone number or email - AllBoutiqs stays your point of contact.
          </li>
          <li>
            <strong>Courier partners</strong> (through Shiprocket) get your name, address and phone number to deliver
            or pick up a parcel.
          </li>
          <li>
            <strong>Razorpay</strong> processes online payments, refunds and payouts to boutiques.
          </li>
          <li>
            <strong>Service providers</strong> that run the site for us: Supabase (database and hosting), Zoho Mail
            (emails) and Twilio (SMS codes). They may use the data only to provide their service to us.
          </li>
          <li>
            <strong>Government and tax authorities</strong>, courts and law enforcement, when the law requires it.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-long",
    title: "How long we keep it",
    body: (
      <p>
        We keep your account details while your account is open. Order, invoice and payment records are kept for as
        long as Indian tax and company law requires, even after an account is closed. Verification documents of a
        boutique are kept while it sells with us and for as long as the law requires afterwards.
      </p>
    ),
  },
  {
    id: "security",
    title: "Keeping it safe",
    body: (
      <p>
        The site is served only over encrypted connections (HTTPS). Access to personal data is limited by role: a
        boutique sees only its own orders, and a seller's verification documents and bank details are visible only to
        that seller and to authorised AllBoutiqs staff. No system is perfectly secure, but we work to protect your data
        and will tell you and the authorities if a breach affects you, as the law requires.
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "Your choices and rights",
    body: (
      <>
        <p>
          Under the Digital Personal Data Protection Act, 2023 you can ask us to see the personal data we hold about
          you, to correct or update it, or to erase it when it is no longer needed for the purpose you gave it for or
          for a legal duty. You can withdraw a consent you gave (for example to promotional emails) at any time; this
          does not affect what was done before.
        </p>
        <p>
          You can change most of your details in <Link to="/account" className="text-primary underline-offset-4 hover:underline">My account</Link>. For anything else, write to{" "}
          <a href={`mailto:${COMPANY.supportEmail}`} className="text-primary underline-offset-4 hover:underline">
            {COMPANY.supportEmail}
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>AllBoutiqs is for adults. Anyone under 18 may use it only with a parent or guardian.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the site or the law changes. The date at the top shows the latest version; if a
        change is important we will also tell you by email or on the site. Sellers should also read the{" "}
        <Link to={LEGAL_PATHS.sellerTerms} className="text-primary underline-offset-4 hover:underline">
          Seller Terms &amp; Conditions
        </Link>
        .
      </p>
    ),
  },
  {
    id: "grievance-officer",
    title: "Questions and complaints",
    body: (
      <>
        <p>
          For any question or complaint about your data, an order or the site, contact our Grievance Officer. We
          acknowledge every complaint within 48 hours and resolve it within one month.
        </p>
        <GrievanceContact />
      </>
    ),
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage
      eyebrow="Your data"
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data AllBoutiqs collects when you shop or sell with us, why, who it is
          shared with, and the choices you have. By using the site you agree to it.
        </p>
      }
      sections={sections}
    />
  );
}
