import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { BUDGETS, budgetHref } from "@/content/storefront";
import { SectionHeading } from "../SectionHeading";

export function BudgetTiles() {
  return (
    <section className="py-16 md:py-24">
      <div className="store-container">
        <SectionHeading eyebrow="Shop by budget" title="Something for" accent="every budget" align="center" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
          {BUDGETS.map((b) => (
            <Link
              key={b.label}
              to={budgetHref(b)}
              className="group relative flex aspect-[5/4] flex-col justify-between border border-gold/40 bg-ivory p-5 transition-colors duration-300 hover:border-primary hover:bg-primary md:aspect-[4/3] md:p-7"
            >
              <span className="eyebrow text-gold group-hover:text-ivory/80">{b.note}</span>
              <div className="flex items-end justify-between gap-2">
                <span className="font-serif text-2xl leading-tight group-hover:text-primary-foreground md:text-3xl">{b.label}</span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
