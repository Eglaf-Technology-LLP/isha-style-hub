import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  // Italic second part of the title ("New" + "arrivals").
  accent?: string;
  subtitle?: string;
  action?: { label: string; href: string };
  align?: "left" | "center";
  tone?: "light" | "dark";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  accent,
  subtitle,
  action,
  align = "left",
  tone = "light",
  className,
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "mb-8 md:mb-12 flex gap-4",
        centered ? "flex-col items-center text-center" : "flex-col sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className={cn("max-w-2xl", centered && "mx-auto")}>
        {eyebrow && (
          <p className={cn("eyebrow mb-3", tone === "light" ? "text-gold" : "text-gold")}>{eyebrow}</p>
        )}
        <h2
          className={cn(
            "font-serif text-3xl md:text-[2.6rem] leading-[1.1] tracking-tight",
            tone === "light" ? "text-foreground" : "text-ivory",
          )}
        >
          {title}
          {accent && <em className={cn("ml-2 font-normal", tone === "light" ? "text-primary" : "text-gold")}>{accent}</em>}
        </h2>
        {subtitle && (
          <p className={cn("mt-3 text-[15px] leading-relaxed", tone === "light" ? "text-muted-foreground" : "text-ivory/70")}>
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <Link
          to={action.href}
          className={cn(
            "group inline-flex shrink-0 items-center gap-2 text-xs font-medium uppercase tracking-[0.2em]",
            tone === "light" ? "text-foreground hover:text-primary" : "text-ivory hover:text-gold",
          )}
        >
          <span className="link-draw pb-0.5">{action.label}</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}
