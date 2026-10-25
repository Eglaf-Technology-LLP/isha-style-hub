import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Ornament } from "@/components/storefront/Ornament";
import { COMPANY, telHref } from "@/lib/company";
import { formatDate } from "@/lib/dates";
import { LEGAL_UPDATED } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

// One policy page: title, last-updated date, a contents list (sticky beside
// the text on wide screens) and numbered sections - the numbers are the
// section numbers the text refers to.
export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  // Links like /privacy-policy#grievance-officer open at that section.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="border-b border-border bg-ivory py-12 text-center md:py-16">
          <div className="store-container">
            <p className="eyebrow text-gold">{eyebrow}</p>
            <h1 className="mt-3 font-serif text-4xl text-balance md:text-5xl">{title}</h1>
            <Ornament className="mt-6" />
            <p className="mt-5 text-sm text-muted-foreground">Last updated {formatDate(LEGAL_UPDATED)}</p>
          </div>
        </section>

        <div className="store-container grid gap-10 py-12 md:py-16 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
            <p className="eyebrow mb-4 text-gold">Contents</p>
            <ol className="space-y-2 text-sm">
              {sections.map((s, i) => (
                <li key={s.id} className="flex gap-2">
                  <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{i + 1}.</span>
                  <a href={`#${s.id}`} className="text-foreground/80 hover:text-primary">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="max-w-[68ch] text-[15px] leading-relaxed text-foreground/85">
            <div className="space-y-4">{intro}</div>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-border pt-8 mt-10 first-of-type:mt-10">
                <h2 className="font-serif text-2xl text-foreground text-balance">
                  <span className="mr-2 text-gold tabular-nums">{i + 1}.</span>
                  {s.title}
                </h2>
                <div className="mt-4 space-y-4 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:font-medium [&_strong]:text-foreground">
                  {s.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// Who to write to with a complaint - the same block on every policy page.
export function GrievanceContact() {
  const g = COMPANY.grievanceOfficer;
  return (
    <address className="not-italic border border-gold/40 bg-ivory p-5 text-sm leading-relaxed">
      <strong className="block font-serif text-lg font-normal text-foreground">
        Grievance Officer{g.name ? ` - ${g.name}` : ""}
      </strong>
      {COMPANY.legalName}
      <br />
      {COMPANY.officeAddress}
      <br />
      Email:{" "}
      <a href={`mailto:${g.email}`} className="text-primary underline-offset-4 hover:underline">
        {g.email}
      </a>
      <br />
      Phone:{" "}
      <a href={telHref(g.phone)} className="text-primary underline-offset-4 hover:underline">
        {g.phone}
      </a>
    </address>
  );
}
