import { Skeleton } from "@/components/ui/skeleton";

// Mirrors ProductCard's exact shape (aspect-[3/4] image, vendor label,
// title, price) so the grid doesn't jump/reflow once real cards swap in.
export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton className="rounded-lg aspect-[3/4]" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-5 w-1/4" />
      </div>
    </div>
  );
}
