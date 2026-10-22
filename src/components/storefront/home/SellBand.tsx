import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// Recruits boutiques: AllBoutiqs runs payments, quality checks and delivery.
export function SellBand() {
  return (
    <section className="py-16 md:py-24">
      <div className="store-container">
        <div className="grid overflow-hidden border border-gold/40 md:grid-cols-2">
          <div className="relative min-h-[220px] bg-maroon-deep pattern-jaal-dark">
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-ivory">
              <p className="font-serif text-4xl leading-tight md:text-5xl">
                Your craft.
                <br />
                <em className="text-gold">All of India.</em>
              </p>
            </div>
          </div>
          <div className="bg-ivory p-8 md:p-14">
            <p className="eyebrow text-gold">For boutique owners</p>
            <h2 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">Sell on AllBoutiqs</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              We look after payments, quality checks and delivery to your customer's door - you focus on what you make.
            </p>
            <Link
              to="/sell-with-us"
              className="mt-8 inline-flex h-12 items-center gap-3 bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Register your boutique <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
