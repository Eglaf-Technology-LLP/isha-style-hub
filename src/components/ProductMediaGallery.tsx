import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ChevronLeft, ChevronRight, Expand, Play, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BrandPlaceholder } from "@/components/storefront/BrandPlaceholder";
import { getOptimizedImageUrl } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";

type MediaItem = { kind: "image"; src: string } | { kind: "video"; src: string };

interface ProductMediaGalleryProps {
  images: string[];
  productName: string;
  // Only pass an approved video. isPrimary: the video is the front display;
  // otherwise it plays in a compact highlight frame over the lead image.
  video?: { url: string; isPrimary: boolean } | null;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const sized = (src: string, width: number) => getOptimizedImageUrl(src, { width }) ?? src;

// Product photos: swipe on phones, thumbnails + hover zoom on desktop, and a
// fullscreen viewer on click/tap.
export function ProductMediaGallery({ images, productName, video }: ProductMediaGalleryProps) {
  const items: MediaItem[] = useMemo(() => {
    const imageItems = images.map((src) => ({ kind: "image" as const, src }));
    return video?.isPrimary ? [{ kind: "video" as const, src: video.url }, ...imageItems] : imageItems;
  }, [images, video?.url, video?.isPrimary]);

  // Mouse users browse with thumbnails/arrows (so hover zoom works); touch
  // users swipe.
  const [emblaRef, api] = useEmblaCarousel({
    loop: false,
    watchDrag: (_api, evt) => evt.type === "touchstart",
  });
  const [selected, setSelected] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const autoPlay = !prefersReducedMotion();
  const poster = images[0];
  const itemsKey = items.map((i) => i.src).join("|");

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on("select", onSelect).on("reInit", onSelect);
    return () => {
      api.off("select", onSelect).off("reInit", onSelect);
    };
  }, [api]);

  // A different set of photos (e.g. a colour with its own picture) starts
  // from the first one again.
  useEffect(() => {
    setSelected(0);
    api?.reInit();
    api?.scrollTo(0, true);
  }, [itemsKey, api]);

  const go = useCallback(
    (index: number) => {
      const next = (index + items.length) % items.length;
      setSelected(next);
      api?.scrollTo(next);
    },
    [api, items.length],
  );

  if (items.length === 0) {
    return (
      <div className="relative -mx-4 aspect-[3/4] overflow-hidden bg-ivory sm:mx-0">
        <BrandPlaceholder caption="Photos coming soon" />
      </div>
    );
  }

  const current = items[Math.min(selected, items.length - 1)];
  const showHighlightFrame = !!video && !video.isPrimary && current?.kind === "image";

  return (
    <div className="flex gap-4">
      {/* Thumbnails (desktop) */}
      {items.length > 1 && (
        <div className="no-scrollbar hidden max-h-[min(calc(100vh-9rem),860px)] w-[76px] shrink-0 flex-col gap-3 overflow-y-auto lg:flex">
          {items.map((item, index) => (
            <button
              key={`${item.kind}-${item.src}-${index}`}
              type="button"
              onClick={() => go(index)}
              className={cn(
                "relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-ivory transition-opacity",
                selected === index ? "opacity-100 ring-1 ring-foreground ring-offset-2 ring-offset-background" : "opacity-60 hover:opacity-100",
              )}
              aria-label={item.kind === "video" ? "View video" : `View image ${index + 1}`}
            >
              {item.kind === "image" ? (
                <img src={sized(item.src, 160)} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <>
                  {poster ? <img src={sized(poster, 160)} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-ink" />}
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/35">
                    <Play className="h-5 w-5 fill-ivory text-ivory" />
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="group relative -mx-4 bg-ivory sm:mx-0">
          <div ref={emblaRef} className="overflow-hidden">
            <div className="flex touch-pan-y">
              {items.map((item, index) => (
                <div key={`${item.kind}-${item.src}-${index}`} className="relative aspect-[3/4] min-w-0 shrink-0 grow-0 basis-full overflow-hidden">
                  {item.kind === "image" ? (
                    <button
                      type="button"
                      className="block h-full w-full cursor-zoom-in"
                      onClick={() => setViewerOpen(true)}
                      onMouseMove={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                      }}
                      onMouseLeave={() => setZoom(null)}
                      aria-label={`View ${productName} in fullscreen`}
                    >
                      <img
                        src={sized(item.src, 1200)}
                        alt={index === 0 ? productName : `${productName} - view ${index + 1}`}
                        loading={index === 0 ? "eager" : "lazy"}
                        className="h-full w-full object-cover transition-transform duration-300 ease-out"
                        style={
                          zoom && index === selected
                            ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` }
                            : undefined
                        }
                      />
                    </button>
                  ) : (
                    <video
                      src={item.src}
                      poster={poster}
                      autoPlay={autoPlay}
                      muted
                      loop
                      playsInline
                      controls
                      className="h-full w-full bg-ink object-cover"
                      aria-label={`${productName} video`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Compact highlight video over the lead image */}
          {showHighlightFrame && (
            <button
              type="button"
              onClick={() => setHighlightOpen(true)}
              onMouseEnter={() => setZoom(null)}
              className="absolute bottom-4 left-4 h-32 w-24 overflow-hidden bg-ink shadow-xl ring-2 ring-ivory/90 focus-visible:outline-none focus-visible:ring-primary sm:h-36 sm:w-28"
              aria-label={`Play ${productName} video`}
            >
              <video src={video!.url} poster={poster} autoPlay={autoPlay} muted loop playsInline className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-ink/60 to-transparent pb-2">
                <span className="inline-flex items-center gap-1 bg-ivory/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground">
                  <Play className="h-3 w-3 fill-current" /> Watch
                </span>
              </span>
            </button>
          )}

          {items.length > 1 && (
            <>
              <span className="pointer-events-none absolute right-4 top-4 bg-ivory/90 px-2.5 py-1 text-[11px] tabular-nums tracking-[0.14em]">
                {String(selected + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
              <GalleryArrow dir="prev" onClick={() => go(selected - 1)} />
              <GalleryArrow dir="next" onClick={() => go(selected + 1)} />
            </>
          )}
          {current.kind === "image" && (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center bg-ivory/90 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100"
              aria-label="Open fullscreen"
            >
              <Expand className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Progress (phones) */}
        {items.length > 1 && (
          <div className="mt-4 flex justify-center gap-1.5 lg:hidden">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to image ${i + 1}`}
                className={cn("h-[3px] transition-all", i === selected ? "w-8 bg-foreground" : "w-4 bg-foreground/20")}
              />
            ))}
          </div>
        )}
      </div>

      <FullscreenViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        items={items}
        index={selected}
        onIndex={go}
        poster={poster}
        productName={productName}
      />

      {/* Highlight video, full size with sound */}
      {video && !video.isPrimary && (
        <Dialog open={highlightOpen} onOpenChange={setHighlightOpen}>
          <DialogContent className="max-w-3xl overflow-hidden border-none bg-ink p-0">
            <VisuallyHidden>
              <DialogTitle>{productName} video</DialogTitle>
            </VisuallyHidden>
            <video src={video.url} poster={poster} controls autoPlay playsInline className="max-h-[85vh] w-full bg-ink" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function GalleryArrow({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Previous image" : "Next image"}
      className={cn(
        "absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/90 opacity-0 shadow-sm transition-opacity hover:bg-ivory group-hover:opacity-100 lg:flex",
        dir === "prev" ? "left-4" : "right-4",
      )}
    >
      {dir === "prev" ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );
}

function FullscreenViewer({
  open,
  onOpenChange,
  items,
  index,
  onIndex,
  poster,
  productName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MediaItem[];
  index: number;
  onIndex: (index: number) => void;
  poster?: string;
  productName: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const current = items[Math.min(index, items.length - 1)];

  useEffect(() => setZoomed(false), [index, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 border-none bg-ivory p-0 sm:rounded-none [&>button:last-child]:hidden"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onIndex(index - 1);
          if (e.key === "ArrowRight") onIndex(index + 1);
        }}
      >
        <VisuallyHidden>
          <DialogTitle>{productName} - photos</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-[11px] tabular-nums uppercase tracking-[0.2em] text-muted-foreground">
            {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
          </span>
          <button type="button" onClick={() => onOpenChange(false)} className="flex h-10 w-10 items-center justify-center hover:text-primary" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {current?.kind === "image" ? (
            <button
              type="button"
              className={cn("h-full w-full", zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setOrigin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                setZoomed((z) => !z);
              }}
              onMouseMove={(e) => {
                if (!zoomed) return;
                const r = e.currentTarget.getBoundingClientRect();
                setOrigin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
              }}
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
            >
              <img
                src={current.src}
                alt={`${productName} - fullscreen view`}
                className="h-full w-full object-contain transition-transform duration-300"
                style={zoomed ? { transform: "scale(2.2)", transformOrigin: `${origin.x}% ${origin.y}%` } : undefined}
              />
            </button>
          ) : current ? (
            <video src={current.src} poster={poster} controls autoPlay playsInline className="max-h-full max-w-full" />
          ) : null}

          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => onIndex(index - 1)}
                className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-sm hover:bg-background sm:left-6"
                aria-label="Previous"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => onIndex(index + 1)}
                className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-sm hover:bg-background sm:right-6"
                aria-label="Next"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        {items.length > 1 && (
          <div className="no-scrollbar flex justify-center gap-2 overflow-x-auto px-4 py-4">
            {items.map((item, i) => (
              <button
                key={`${item.src}-${i}`}
                type="button"
                onClick={() => onIndex(i)}
                className={cn("relative h-16 w-12 shrink-0 overflow-hidden bg-background", i === index ? "ring-1 ring-foreground ring-offset-2 ring-offset-ivory" : "opacity-50 hover:opacity-100")}
                aria-label={`View ${i + 1}`}
              >
                {item.kind === "image" ? (
                  <img src={sized(item.src, 160)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-ink">
                    <Play className="h-4 w-4 fill-ivory text-ivory" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
