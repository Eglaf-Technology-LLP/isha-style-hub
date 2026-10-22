import { ReactNode, useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface RailProps {
  children: ReactNode[];
  // Width of each slide, as Tailwind basis classes.
  itemClassName?: string;
  className?: string;
  // Header content shown to the left of the arrows.
  header?: ReactNode;
}

// A swipeable row (drag on desktop, swipe on phones) with arrow buttons that
// only appear when there's more to see.
export function Rail({
  children,
  itemClassName = "basis-[46%] sm:basis-[31%] lg:basis-[23.5%] xl:basis-[19%]",
  className,
  header,
}: RailProps) {
  const [ref, api] = useEmblaCarousel({ align: "start", dragFree: true, containScroll: "trimSnaps" });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    if (!api) return;
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    update();
    api.on("select", update).on("reInit", update).on("scroll", update);
    return () => {
      api.off("select", update).off("reInit", update).off("scroll", update);
    };
  }, [api, update]);

  const arrow = (dir: "prev" | "next") => {
    const enabled = dir === "prev" ? canPrev : canNext;
    return (
      <button
        type="button"
        aria-label={dir === "prev" ? "Previous" : "Next"}
        disabled={!enabled}
        onClick={() => (dir === "prev" ? api?.scrollPrev() : api?.scrollNext())}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full border border-foreground/15 bg-ivory text-foreground transition",
          enabled ? "hover:border-primary hover:bg-primary hover:text-primary-foreground" : "opacity-30",
        )}
      >
        {dir === "prev" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    );
  };

  return (
    <div className={className}>
      {(header || canPrev || canNext) && (
        <div className="mb-8 flex items-end justify-between gap-4 md:mb-12">
          <div className="min-w-0 flex-1">{header}</div>
          {(canPrev || canNext) && (
            <div className="hidden shrink-0 gap-2 md:flex">
              {arrow("prev")}
              {arrow("next")}
            </div>
          )}
        </div>
      )}
      <div ref={ref} className="overflow-hidden">
        <div className="-ml-4 flex touch-pan-y md:-ml-6">
          {children.map((child, i) => (
            <div key={i} className={cn("min-w-0 shrink-0 grow-0 pl-4 md:pl-6", itemClassName)}>
              {child}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
