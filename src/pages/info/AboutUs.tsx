import { Link } from "react-router-dom";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";
import { LEGAL_PATHS } from "@/lib/legal";

const link = "text-primary underline-offset-4 hover:underline";

// Footer page (client corrections, 15 Nov 2026) - only what the site already
// says about AllBoutiqs; for AllBoutiqs to add its own story.
const sections: LegalSection[] = [
  {
    id: "what-we-do",
    title: "What we do",
    body: (
      <p>
        AllBoutiqs (allboutiqs.com) is a marketplace run by {COMPANY.legalName}, where independent boutiques and
        designer labels sell to you. Each piece is sold by the boutique named on its page; AllBoutiqs takes the order
        and payment, checks the piece and delivers it.
      </p>
    ),
  },
  {
    id: "quality",
    title: "Every piece checked",
    body: (
      <p>
        Every piece is checked at our quality-check centre in Deesa before it ships. Read how delivery works in our{" "}
        <Link to={LEGAL_PATHS.shipping} className={link}>
          Shipping Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "boutiques",
    title: "For boutiques",
    body: (
      <p>
        Boutiques and designer brands can apply to{" "}
        <Link to="/sell-with-us" className={link}>
          sell on AllBoutiqs
        </Link>
        , or{" "}
        <Link to="/boutiques" className={link}>
          meet the boutiques
        </Link>{" "}
        already here.
      </p>
    ),
  },
  {
    id: "company",
    title: "Company details",
    body: (
      <ul>
        <li>{COMPANY.legalName}</li>
        <li>CIN {COMPANY.cin}</li>
        <li>GSTIN {COMPANY.gstin}</li>
        <li>{COMPANY.isoCertificate}</li>
        <li>Registered office: {COMPANY.officeAddress}</li>
      </ul>
    ),
  },
];

export default function AboutUs() {
  return (
    <LegalPage
      eyebrow="AllBoutiqs"
      title="About us"
      intro={<p>India's Premium Boutique Marketplace – women's designer fashion from boutiques and designer brands.</p>}
      sections={sections}
      updated={null}
    />
  );
}
