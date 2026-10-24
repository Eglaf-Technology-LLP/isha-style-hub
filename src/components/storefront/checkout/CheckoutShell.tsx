import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Lock } from "lucide-react";
import logo from "@/assets/logo.png";
import { COMPANY, telHref } from "@/lib/company";
import { cn } from "@/lib/utils";

const STEPS = ["Cart", "Details & payment", "Confirmed"] as const;

// Checkout's own distraction-free frame: logo, a way back, the steps, and a
// slim help footer instead of the full site header/footer.
export function CheckoutShell({
  step,
  children,
  bottomBar,
}: {
  step: 0 | 1 | 2;
  children: ReactNode;
  // Phones: a bar fixed to the bottom of the screen (the footer makes room).
  bottomBar?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-ivory">
        <div className="store-container grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-20">
          <Link
            to="/"
            className="inline-flex items-center gap-2 justify-self-start text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Continue shopping</span>
          </Link>
          <Link to="/" aria-label="AllBoutiqs home" className="justify-self-center">
            {/* The logo file has generous empty space around the mark. */}
            <img src={logo} alt="AllBoutiqs" className="-my-3 h-[72px] w-auto object-contain md:-my-4 md:h-[88px]" />
          </Link>
          <span className="inline-flex items-center gap-2 justify-self-end text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-gold" />
            <span className="hidden sm:inline">Secure checkout</span>
          </span>
        </div>
      </header>

      <div className="border-b border-border">
        <ol className="store-container flex items-center justify-center gap-3 py-4 text-[11px] uppercase tracking-[0.18em] sm:gap-5">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-3 sm:gap-5">
              {i > 0 && <span className="h-px w-6 bg-border sm:w-12" aria-hidden />}
              <span className={cn("flex items-center gap-2", i === step ? "text-foreground" : "text-muted-foreground")}>
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-[10px]",
                    i < step && "border-gold bg-gold text-ivory",
                    i === step && "border-foreground",
                    i > step && "border-border",
                  )}
                >
                  {i < step ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn(i !== step && "hidden sm:inline")}>{label}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <main className="flex-1">{children}</main>

      <footer className={cn("border-t border-border bg-ivory", bottomBar && "pb-20 lg:pb-0")}>
        <div className="store-container flex flex-col items-center justify-between gap-4 py-6 text-xs text-muted-foreground md:flex-row">
          <p>
            Need help? WhatsApp{" "}
            <a href={COMPANY.whatsappUrl} target="_blank" rel="noreferrer" className="text-foreground hover:text-primary">
              {COMPANY.whatsapp}
            </a>{" "}
            · Call{" "}
            <a href={telHref(COMPANY.supportPhone)} className="text-foreground hover:text-primary">
              {COMPANY.supportPhone}
            </a>{" "}
            ·{" "}
            <a href={`mailto:${COMPANY.supportEmail}`} className="text-foreground hover:text-primary">
              {COMPANY.supportEmail}
            </a>
          </p>
          <p>
            © {new Date().getFullYear()} {COMPANY.legalName}
          </p>
        </div>
      </footer>
      {bottomBar && <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-ivory/95 backdrop-blur-md lg:hidden">{bottomBar}</div>}
    </div>
  );
}
