import { Link } from "react-router-dom";
import { RaiseComplaintButton } from "@/components/ComplaintForm";
import { GrievanceContact, LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY, telHref } from "@/lib/company";
import { LEGAL_PATHS } from "@/lib/legal";

const link = "text-primary underline-offset-4 hover:underline";

// Footer page (client corrections, 15 Nov 2026): the same customer-care
// details as the footer, from src/lib/company.ts.
const sections: LegalSection[] = [
  {
    id: "customer-care",
    title: "Customer care",
    body: (
      <ul>
        <li>
          Call{" "}
          <a href={telHref(COMPANY.supportPhone)} className={link}>
            {COMPANY.supportPhone}
          </a>{" "}
          ({COMPANY.callHours})
        </li>
        <li>
          WhatsApp{" "}
          <a href={COMPANY.whatsappUrl} target="_blank" rel="noopener noreferrer" className={link}>
            {COMPANY.whatsapp}
          </a>{" "}
          (WhatsApp only)
        </li>
        <li>
          Email{" "}
          <a href={`mailto:${COMPANY.supportEmail}`} className={link}>
            {COMPANY.supportEmail}
          </a>
        </li>
      </ul>
    ),
  },
  {
    id: "orders",
    title: "Orders, returns and refunds",
    body: (
      <p>
        Track, cancel or return an order in{" "}
        <Link to="/orders" className={link}>
          My Orders
        </Link>
        . When you contact us about an order, please give the order number. See also our{" "}
        <Link to={LEGAL_PATHS.shipping} className={link}>
          Shipping Policy
        </Link>
        ,{" "}
        <Link to={LEGAL_PATHS.returns} className={link}>
          Return &amp; Refund Policy
        </Link>{" "}
        and{" "}
        <Link to={LEGAL_PATHS.faq} className={link}>
          FAQ
        </Link>
        .
      </p>
    ),
  },
  {
    id: "office",
    title: "Registered office",
    body: (
      <p>
        {COMPANY.legalName}
        <br />
        {COMPANY.officeAddress}
      </p>
    ),
  },
  {
    id: "grievance",
    title: "Grievance Officer",
    body: (
      <>
        <p>We aim to acknowledge every complaint within 24 hours and resolve it within 7 days.</p>
        <p>
          <RaiseComplaintButton className="border border-primary px-5 py-2.5 text-xs font-medium uppercase tracking-[0.2em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground" />
        </p>
        <GrievanceContact />
      </>
    ),
  },
  {
    id: "boutiques",
    title: "For boutiques",
    body: (
      <p>
        Want to sell with us?{" "}
        <Link to="/sell-with-us" className={link}>
          Apply to sell on AllBoutiqs
        </Link>
        . Boutiques already selling can{" "}
        <Link to="/vendor" className={link}>
          log in here
        </Link>
        .
      </p>
    ),
  },
];

export default function ContactUs() {
  return (
    <LegalPage
      eyebrow="AllBoutiqs"
      title="Contact us"
      intro={<p>We're here to help with your orders, returns and anything else.</p>}
      sections={sections}
      updated={null}
    />
  );
}
