import { Link } from "react-router-dom";
import { COMPANY, telHref } from "@/lib/company";
import { LEGAL_PATHS } from "@/lib/legal";

// The Grievance Officer on every product page (Extra list J; Consumer
// Protection (E-Commerce) Rules, 2020) - small, but always visible.
export function GrievanceOfficerNote({ className = "" }: { className?: string }) {
  const g = COMPANY.grievanceOfficer;
  return (
    <section aria-label="Grievance Officer" className={`border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground ${className}`}>
      <p className="eyebrow mb-1.5 text-foreground/70">Grievance Officer</p>
      <p>
        {g.name ? `${g.name}, ` : ""}
        {COMPANY.legalName}, {COMPANY.officeAddress}
      </p>
      <p className="mt-1">
        <a href={`mailto:${g.email}`} className="underline-offset-4 hover:text-primary hover:underline">
          {g.email}
        </a>
        {" · "}
        <a href={telHref(g.phone)} className="underline-offset-4 hover:text-primary hover:underline">
          {g.phone}
        </a>
        {" · "}
        <Link to={`${LEGAL_PATHS.privacy}#grievance-officer`} className="underline-offset-4 hover:text-primary hover:underline">
          How complaints are handled
        </Link>
      </p>
    </section>
  );
}
