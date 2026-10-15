import { Link } from "react-router-dom";
import { STAFF_ONLY_MODE } from "@/lib/staffMode";
import { useStaffRole } from "@/hooks/useStaffRole";
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin, MessageCircle } from "lucide-react";
import { COMPANY, telHref } from "@/lib/company";
import { Separator } from "@/components/ui/separator";
import logo from "@/assets/logo-white.png";

export function Footer() {
  const { role } = useStaffRole();
  if (STAFF_ONLY_MODE && (role === "admin" || role === "vendor")) {
    return (
      <footer className="bg-secondary text-secondary-foreground">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-secondary-foreground/80">
          <span>© {new Date().getFullYear()} {COMPANY.legalName}</span>
          <span>
            Help: <a href={`mailto:${COMPANY.supportEmail}`} className="underline">{COMPANY.supportEmail}</a> ·{" "}
            <a href={telHref(COMPANY.supportPhone)} className="underline">{COMPANY.supportPhone}</a>
          </span>
        </div>
      </footer>
    );
  }
  return (
    <footer className="bg-secondary text-secondary-foreground">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <img src={logo} alt="AllBoutiqs" className="h-14 w-auto object-contain mb-4" />
            <p className="text-secondary-foreground/80 mb-4">
              Your destination for trendy and elegant fashion. Quality meets style at AllBoutiqs.
            </p>
            <div className="flex gap-3">
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-foreground/10 transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-foreground/10 transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-foreground/10 transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Twitter className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-xs uppercase tracking-widest text-secondary-foreground/70 mb-5">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/category/new" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  New Arrivals
                </Link>
              </li>
              <li>
                <Link to="/category/dresses" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  Dresses
                </Link>
              </li>
              <li>
                <Link to="/category/shirts" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  Shirts
                </Link>
              </li>
              <li>
                <Link to="/category/pants" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  Pants
                </Link>
              </li>
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h4 className="font-semibold text-xs uppercase tracking-widest text-secondary-foreground/70 mb-5">Customer Service</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/help" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <Link to="/returns" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  Returns & Exchanges
                </Link>
              </li>
              <li>
                <Link to="/shipping" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  Shipping Info
                </Link>
              </li>
              <li>
                <Link to="/size-guide" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  Size Guide
                </Link>
              </li>
              <li>
                <Link to="/sell-with-us" className="text-secondary-foreground/80 hover:text-primary transition-colors">
                  Sell with Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-xs uppercase tracking-widest text-secondary-foreground/70 mb-5">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-secondary-foreground/80">
                <Phone className="h-4 w-4" />
                <a href={telHref(COMPANY.supportPhone)} className="hover:text-secondary-foreground">
                  {COMPANY.supportPhone}
                </a>
              </li>
              <li className="flex items-center gap-2 text-secondary-foreground/80">
                <MessageCircle className="h-4 w-4" />
                <a href={COMPANY.whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-secondary-foreground">
                  WhatsApp {COMPANY.whatsapp}
                </a>
              </li>
              <li className="flex items-center gap-2 text-secondary-foreground/80">
                <Mail className="h-4 w-4" />
                <a href={`mailto:${COMPANY.supportEmail}`} className="hover:text-secondary-foreground">
                  {COMPANY.supportEmail}
                </a>
              </li>
              <li className="flex items-start gap-2 text-secondary-foreground/80">
                <MapPin className="h-4 w-4 mt-1" />
                <span>{COMPANY.location}</span>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8 bg-secondary-foreground/20" />

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-secondary-foreground/60">
          <p>© 2026 AllBoutiqs. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
