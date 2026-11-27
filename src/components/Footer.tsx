import { useState } from "react";
import { Link } from "react-router-dom";
import { STAFF_ONLY_MODE } from "@/lib/staffMode";
import { useStaffRole } from "@/hooks/useStaffRole";
import { ArrowRight, Loader2, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { COMPANY, telHref } from "@/lib/company";
import { LEGAL_PATHS } from "@/lib/legal";
import { useNewsletter } from "@/hooks/useNewsletter";
import { useMenuCategories } from "@/hooks/useStorefront";
import { RaiseComplaintButton } from "@/components/ComplaintForm";
import logo from "@/assets/logo-white.png";

// EMI shown wherever payments are listed (client corrections Part 2, A4.1).
const PAYMENT_METHODS = ["UPI", "Visa", "Mastercard", "RuPay", "Net banking", "EMI", "Cash on Delivery"];

export function Footer() {
  const { role } = useStaffRole();
  const { data: categories } = useMenuCategories();
  const { subscribe, loading } = useNewsletter();
  const [email, setEmail] = useState("");

  // The seller side (client corrections, point 5): Privacy Policy, FAQ, the
  // Terms & Working Process and a link to the Return & Refund Policy - not
  // the customer Terms & Conditions, which are for the customer site only.
  if (STAFF_ONLY_MODE && (role === "admin" || role === "vendor")) {
    return (
      <footer className="bg-secondary text-secondary-foreground">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-secondary-foreground/80">
          <span>© {new Date().getFullYear()} {COMPANY.legalName}</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to={LEGAL_PATHS.privacy} className="underline">Privacy Policy</Link>
            <Link to={LEGAL_PATHS.sellerTerms} className="underline">Terms &amp; Working Process</Link>
            <Link to={LEGAL_PATHS.faq} className="underline">FAQ</Link>
            <Link to={LEGAL_PATHS.returns} className="underline">Return &amp; Refund Policy</Link>
          </span>
          <span>
            Help: <a href={`mailto:${COMPANY.supportEmail}`} className="underline">{COMPANY.supportEmail}</a> ·{" "}
            <a href={telHref(COMPANY.supportPhone)} className="underline">{COMPANY.supportPhone}</a>
          </span>
        </div>
      </footer>
    );
  }

  const onSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await subscribe(email.trim())) setEmail("");
  };

  return (
    <footer className="bg-ink text-ivory">
      {/* Newsletter */}
      <div className="border-b border-ivory/10 pattern-jaal-dark">
        <div className="store-container grid items-center gap-8 py-14 md:grid-cols-2 md:py-16">
          <div>
            <p className="eyebrow mb-3 text-gold">The AllBoutiqs letter</p>
            <h3 className="font-serif text-3xl leading-tight md:text-4xl">
              New boutiques, new edits, <em className="text-gold">first.</em>
            </h3>
          </div>
          <form onSubmit={onSubscribe} className="flex w-full border-b border-ivory/40 focus-within:border-gold">
            <label htmlFor="footer-email" className="sr-only">
              Email address
            </label>
            <input
              id="footer-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-ivory placeholder:text-ivory/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 py-3 pl-4 text-xs font-medium uppercase tracking-[0.2em] text-ivory hover:text-gold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Subscribe <ArrowRight className="h-3.5 w-3.5" /></>}
            </button>
          </form>
        </div>
      </div>

      {/* Links */}
      <div className="store-container grid grid-cols-2 gap-10 py-14 md:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1.3fr]">
        <div className="col-span-2 md:col-span-3 lg:col-span-1">
          <img src={logo} alt="AllBoutiqs" className="mb-5 h-14 w-auto object-contain" />
          <p className="max-w-xs text-sm leading-relaxed text-ivory/65">
            India's Premium Boutique Marketplace – women's designer fashion from boutiques and designer brands.
          </p>
          <div className="mt-5 max-w-xs space-y-1.5 text-xs leading-relaxed text-ivory/60">
            <p>
              Grievance Officer: {COMPANY.grievanceOfficer.name} ·{" "}
              <a href={`mailto:${COMPANY.grievanceOfficer.email}`} className="hover:text-gold">
                {COMPANY.grievanceOfficer.email}
              </a>{" "}
              ·{" "}
              <a href={telHref(COMPANY.grievanceOfficer.phone)} className="hover:text-gold">
                {COMPANY.grievanceOfficer.phone}
              </a>
            </p>
            <p>{COMPANY.isoCertificate}</p>
          </div>
        </div>

        <FooterColumn title="Shop">
          <FooterLink to="/category/all?sort=newest">New in</FooterLink>
          {categories.slice(0, 6).map((c) => (
            <FooterLink key={c.id} to={`/category/${c.slug}`}>
              {c.name}
            </FooterLink>
          ))}
          <FooterLink to="/category/all">Shop all</FooterLink>
        </FooterColumn>

        <FooterColumn title="Boutiques">
          <FooterLink to="/boutiques">Meet the boutiques</FooterLink>
          <FooterLink to="/sell-with-us">Sell on AllBoutiqs</FooterLink>
          <FooterLink to="/vendor">Boutique login</FooterLink>
          {/* No Terms & Working Process here: it's for the seller side only
              (seller registration and dashboard; client corrections, point 5). */}
        </FooterColumn>

        {/* About us, Contact us, FAQ and the two store policies: client
            corrections, 15 Nov 2026. */}
        <FooterColumn title="Company">
          <FooterLink to={LEGAL_PATHS.about}>About us</FooterLink>
          <FooterLink to={LEGAL_PATHS.contact}>Contact us</FooterLink>
          <FooterLink to={LEGAL_PATHS.faq}>FAQ</FooterLink>
        </FooterColumn>

        <FooterColumn title="Help">
          <FooterLink to="/orders">Track your order</FooterLink>
          <FooterLink to="/orders">Returns &amp; refunds</FooterLink>
          <FooterLink to="/account">My account</FooterLink>
          <FooterLink to="/wishlist">Wishlist</FooterLink>
          <FooterLink to={LEGAL_PATHS.shipping}>Shipping policy</FooterLink>
          <FooterLink to={LEGAL_PATHS.returns}>Return &amp; Refund policy</FooterLink>
          <FooterLink to={LEGAL_PATHS.privacy}>Privacy policy</FooterLink>
          <FooterLink to={LEGAL_PATHS.terms}>Terms &amp; conditions</FooterLink>
        </FooterColumn>

        <FooterColumn title="Customer care">
          <li className="flex items-center gap-2.5">
            <Phone className="h-4 w-4 text-gold" />
            <a href={telHref(COMPANY.supportPhone)} className="hover:text-gold">
              Call {COMPANY.supportPhone} ({COMPANY.callHours})
            </a>
          </li>
          <li className="flex items-center gap-2.5">
            <MessageCircle className="h-4 w-4 text-gold" />
            <a href={COMPANY.whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gold">
              WhatsApp {COMPANY.whatsapp} (WhatsApp only)
            </a>
          </li>
          <li className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 text-gold" />
            <a href={`mailto:${COMPANY.supportEmail}`} className="hover:text-gold">
              {COMPANY.supportEmail}
            </a>
          </li>
          <li className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>{COMPANY.officeAddress}</span>
          </li>
        </FooterColumn>
      </div>

      {/* Complaints (client list 2.11.2): the form saves the complaint (shown
          nowhere), emails it to the admins and confirms to the customer. */}
      <div className="border-t border-ivory/10">
        <div className="store-container flex flex-col gap-5 py-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow mb-2 text-gold">Complaints</p>
            <p className="max-w-xl text-sm leading-relaxed text-ivory/70">
              Something not right with an order, a boutique or the site? Tell us. You'll get a ticket number by email. We
              aim to acknowledge within 24 hours and resolve within 7 days.
            </p>
          </div>
          <RaiseComplaintButton className="shrink-0 self-start border border-gold px-6 py-3 text-xs font-medium uppercase tracking-[0.2em] text-ivory transition-colors hover:bg-gold hover:text-ink md:self-auto" />
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-ivory/10">
        <div className="store-container flex flex-col gap-5 py-7 text-xs text-ivory/55 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <span key={m} className="border border-ivory/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-ivory/70">
                {m}
              </span>
            ))}
          </div>
          <p className="leading-relaxed">
            © {new Date().getFullYear()} {COMPANY.legalName} · GSTIN {COMPANY.gstin} · CIN {COMPANY.cin}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-5 text-gold">{title}</p>
      <ul className="space-y-3 text-sm text-ivory/75">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="link-draw hover:text-ivory">
        {children}
      </Link>
    </li>
  );
}
