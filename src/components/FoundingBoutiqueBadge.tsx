import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface FoundingBoutiqueBadgeProps {
  size?: "sm" | "md";
  className?: string;
}

// One of AllBoutiqs' founding partner boutiques (set by admins).
export function FoundingBoutiqueBadge({ size = "md", className }: FoundingBoutiqueBadgeProps) {
  return (
    <span
      title="One of AllBoutiqs' founding boutiques"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-500 text-white font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        className,
      )}
    >
      <Sparkles className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Founding Boutique
    </span>
  );
}
