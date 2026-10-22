import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

interface BrandPlaceholderProps {
  // Large serif label (e.g. a category name) instead of the logo mark.
  label?: string;
  caption?: string;
  className?: string;
  tone?: "light" | "dark";
}

// Shown wherever a photo hasn't been uploaded yet: the ivory lattice pattern
// with the AllBoutiqs mark, so a missing picture still looks designed.
export function BrandPlaceholder({ label, caption, className, tone = "light" }: BrandPlaceholderProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-3 text-center",
        tone === "light" ? "pattern-jaal" : "bg-maroon-deep pattern-jaal-dark text-ivory",
        className,
      )}
    >
      {label ? (
        <span className={cn("font-serif text-2xl md:text-3xl px-4 leading-tight", tone === "light" ? "text-primary" : "text-ivory")}>
          {label}
        </span>
      ) : (
        <img src={logo} alt="" aria-hidden className="h-10 w-auto opacity-60" />
      )}
      {caption && (
        <span className={cn("eyebrow", tone === "light" ? "text-muted-foreground" : "text-ivory/70")}>{caption}</span>
      )}
    </div>
  );
}
