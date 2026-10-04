import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBoutiqueBadgeProps {
  size?: "sm" | "md";
  className?: string;
}

export function VerifiedBoutiqueBadge({ size = "md", className }: VerifiedBoutiqueBadgeProps) {
  return (
    <span
      title="This boutique has been verified by AllBoutiqs"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        className,
      )}
    >
      <BadgeCheck className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Verified Boutique
    </span>
  );
}
