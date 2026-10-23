import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { InlineSignInForm } from "@/components/auth/InlineSignInForm";
import { cn } from "@/lib/utils";

// Shared pieces for the shopper's own pages (My account, My orders).

export const accountFieldClass =
  "h-12 rounded-none border-foreground/20 bg-background focus:ring-0 focus:ring-offset-0 focus-visible:border-foreground focus-visible:ring-0 focus-visible:ring-offset-0";

export const accountLabelClass = "text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground";

// Ivory title band with a breadcrumb.
export function AccountHero({
  crumb,
  eyebrow,
  title,
  accent,
  subtitle,
  actions,
}: {
  crumb: string;
  eyebrow: string;
  title: string;
  accent?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="border-b border-border bg-ivory">
      <div className="store-container flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between md:py-14">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{crumb}</span>
          </nav>
          <p className="eyebrow text-gold">{eyebrow}</p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] md:text-6xl">
            {title}
            {accent && <em className="ml-3 font-normal text-primary">{accent}</em>}
          </h1>
          {subtitle && <div className="mt-4 break-all text-[15px] text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}

// Small square link/button used in the title band.
export function AccountAction({
  to,
  onClick,
  icon: Icon,
  children,
}: {
  to?: string;
  onClick?: () => void;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const className =
    "inline-flex h-10 items-center gap-2 border border-foreground/20 bg-background px-4 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors hover:border-foreground";
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 text-gold" />
      {children}
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

// "Sign in to …" card shown to guests on account pages.
export function SignInCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  const navigate = useNavigate();
  return (
    <div className="store-container py-14 md:py-20">
      <div className="mx-auto max-w-md border border-border bg-ivory p-8 md:p-10">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-background">
            <Icon className="h-6 w-6 text-gold" strokeWidth={1.5} />
          </span>
          <h1 className="mt-6 font-serif text-3xl leading-tight">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{text}</p>
        </div>
        <InlineSignInForm />
        <button
          type="button"
          className="mt-3 h-12 w-full border border-foreground/20 text-[11px] font-medium uppercase tracking-[0.22em] hover:border-foreground"
          onClick={() => navigate("/")}
        >
          Continue shopping
        </button>
      </div>
    </div>
  );
}

// Order / return status label.
export function StatusPill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em]", className ?? "bg-muted")}>
      {children}
    </span>
  );
}

// Section heading inside an account tab.
export function AccountSectionTitle({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="font-serif text-2xl md:text-3xl">{title}</h2>
        {text && <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>}
      </div>
      {action}
    </div>
  );
}
