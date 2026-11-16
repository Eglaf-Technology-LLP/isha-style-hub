import { cn } from "@/lib/utils";

interface BrandPlaceholderProps {
  // Large serif label (e.g. a category name).
  label?: string;
  caption?: string;
  className?: string;
  tone?: "light" | "dark";
}

// Shown wherever a photo hasn't been uploaded yet: the ivory lattice pattern,
// with a label or caption when given - never a logo image (client
// corrections, 15 Nov 2026, 2.7).
export function BrandPlaceholder({ label, caption, className, tone = "light" }: BrandPlaceholderProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-3 text-center",
        tone === "light" ? "pattern-jaal" : "bg-maroon-deep pattern-jaal-dark text-ivory",
        className,
      )}
    >
      {label && (
        <span className={cn("font-serif text-2xl md:text-3xl px-4 leading-tight", tone === "light" ? "text-primary" : "text-ivory")}>
          {label}
        </span>
      )}
      {caption && (
        <span className={cn("eyebrow", tone === "light" ? "text-muted-foreground" : "text-ivory/70")}>{caption}</span>
      )}
    </div>
  );
}
