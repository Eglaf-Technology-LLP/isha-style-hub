import { cn } from "@/lib/utils";

// Fine gold rule with a small lozenge in the middle - used under headings
// and on dark bands.
export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-3 text-gold", className)} aria-hidden>
      <span className="h-px w-12 bg-current opacity-60" />
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 0.8 L13.2 7 L7 13.2 L0.8 7 Z" stroke="currentColor" strokeWidth="1" />
        <path d="M7 4.2 L9.8 7 L7 9.8 L4.2 7 Z" fill="currentColor" />
      </svg>
      <span className="h-px w-12 bg-current opacity-60" />
    </div>
  );
}
