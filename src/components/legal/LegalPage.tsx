import { Fragment, useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Ornament } from "@/components/storefront/Ornament";
import { COMPANY, telHref } from "@/lib/company";
import { formatDateInWords } from "@/lib/dates";
import { LEGAL_UPDATED } from "@/lib/legal";

// "← Back" to the page the reader came from (client corrections Box 3: a
// seller reading the terms from the registration form had no way back).
// The form opens these pages in a new tab, so there is no page behind it in
// that tab: closing the tab brings the form's tab back. Opened any other way
// with nothing to go back to, it goes to the home page.
function BackButton() {
  const navigate = useNavigate();
  const goBack = () => {
    // react-router keeps the tab's position in history.state.idx.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) return navigate(-1);
    // Came from another site in this tab.
    if (window.history.length > 1) return window.history.back();
    window.close();
    // Still here: the browser didn't let this tab be closed.
    window.setTimeout(() => {
      if (!window.closed) navigate("/");
    }, 300);
  };
  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 py-3 text-sm text-foreground/80 hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
    </button>
  );
}

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
  // Starts a new part of the document ("PART A - ..."): shown as a heading
  // above this section, in the text and in the contents list.
  part?: string;
}

// One policy page: title, last-updated date, a contents list (sticky beside
// the text on wide screens) and sections - numbered unless `numbered` is
// false; the numbers are the section numbers the text refers to.
export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
  updated = LEGAL_UPDATED,
  version,
  numbered = true,
  outro,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  // "Last updated" date; null hides it (About us, Contact us, FAQ).
  updated?: string | null;
  // Document version shown beside the date ("Version 2.2").
  version?: string;
  numbered?: boolean;
  // Shown after the last section (a closing note, contact details).
  outro?: ReactNode;
}) {
  // Links like /privacy-policy#grievance-officer open at that section.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  const dateLine = [version && `Version ${version}`, updated && `Last updated ${formatDateInWords(updated)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <div className="store-container">
          <BackButton />
        </div>
        <section className="border-b border-border bg-ivory py-12 text-center md:py-16">
          <div className="store-container">
            <p className="eyebrow text-gold">{eyebrow}</p>
            <h1 className="mt-3 font-serif text-4xl text-balance md:text-5xl">{title}</h1>
            <Ornament className="mt-6" />
            {dateLine && <p className="mt-5 text-sm text-muted-foreground">{dateLine}</p>}
          </div>
        </section>

        <div className="store-container grid gap-10 py-12 md:py-16 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
            <p className="eyebrow mb-4 text-gold">Contents</p>
            <ol className="space-y-2 text-sm">
              {sections.map((s, i) => (
                <Fragment key={s.id}>
                  {s.part && (
                    <li className="pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground first:pt-0">
                      {s.part}
                    </li>
                  )}
                  <li className="flex gap-2">
                    {numbered && <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{i + 1}.</span>}
                    <a href={`#${s.id}`} className="text-foreground/80 hover:text-primary">
                      {s.title}
                    </a>
                  </li>
                </Fragment>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 max-w-[68ch] text-[15px] leading-relaxed text-foreground/85">
            <div className="space-y-4">{intro}</div>
            {sections.map((s, i) => (
              <Fragment key={s.id}>
                {s.part && (
                  <p className="mt-14 bg-foreground px-5 py-3 font-serif text-lg text-background">{s.part}</p>
                )}
                <section
                  id={s.id}
                  className={`scroll-mt-24 ${s.part ? "mt-8" : "mt-10 border-t border-border pt-8 first-of-type:mt-10"}`}
                >
                  <h2 className="font-serif text-2xl text-foreground text-balance">
                    {numbered && <span className="mr-2 text-gold tabular-nums">{i + 1}.</span>}
                    {s.title}
                  </h2>
                  <div className="mt-4 space-y-4 [&_h3]:pt-2 [&_h3]:font-medium [&_h3]:text-foreground [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:font-medium [&_strong]:text-foreground">
                    {s.body}
                  </div>
                </section>
              </Fragment>
            ))}
            {outro && <div className="mt-14 space-y-4">{outro}</div>}
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// A boxed note inside a section (a rule to remember, a worked example).
export function LegalNote({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-3 border-l-2 border-gold bg-ivory p-5">
      {title && <p className="font-serif text-lg text-foreground">{title}</p>}
      {children}
    </div>
  );
}

// A table inside a section; scrolls sideways on a narrow screen.
export function LegalTable({ head, rows, numeric = [] }: { head: ReactNode[]; rows: ReactNode[][]; numeric?: number[] }) {
  const align = (c: number) => (numeric.includes(c) ? "text-right tabular-nums" : "text-left");
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${head.length > 2 ? "min-w-[32rem]" : ""}`}>
        <thead>
          <tr className="bg-foreground text-background">
            {head.map((h, c) => (
              <th key={c} scope="col" className={`px-3 py-2 font-medium ${align(c)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border align-top odd:bg-ivory/60">
              {r.map((cell, c) => (
                <td key={c} className={`px-3 py-2 ${align(c)}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
