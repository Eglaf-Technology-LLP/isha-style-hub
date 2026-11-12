import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ChevronLeft, ChevronRight, Expand, Play, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BrandPlaceholder } from "@/components/storefront/BrandPlaceholder";
import { getOptimizedImageUrl } from "@/lib/imageUrl";
import type { VideoSlot } from "@/lib/productMedia";
import { cn } from "@/lib/utils";

type MediaItem = { kind: "image"; src: string } | { kind: "video"; src: string };

interface ProductMediaGalleryProps {
  images: string[];
  productName: string;
  // Only pass an approved video (lib/productMedia shopperVideo). It sits
  // among the photos where the boutique placed it - first, or after N photos.
  video?: VideoSlot | null;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Hover zoom only with a mouse - a tap on a phone opens the full-screen view.
const canHoverZoom = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

const sized = (src: string, width: number) => getOptimizedImageUrl(src, { width }) ?? src;

const ZOOM = 2.5;
// The outer 10% of the photo already shows its edge, so the corners are easy
// to reach with the mouse.
const EDGE = 0.1;
const zoomPoint = (e: React.MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  const fit = (v: number) => Math.min(1, Math.max(0, (v - EDGE) / (1 - 2 * EDGE))) * 100;
  return { x: fit((e.clientX - r.left) / r.width), y: fit((e.clientY - r.top) / r.height) };
};

// Product photos and video: swipe on phones, thumbnails + hover zoom on
// desktop, and a full-screen viewer on click / tap.
export function ProductMediaGallery({ images, productName, video }: ProductMediaGalleryProps) {
  const items: MediaItem[] = useMemo(() => {
    const list: MediaItem[] = images.map((src) => ({ kind: "image" as const, src }));
    if (video) {
      const at = video.position == null ? list.length : Math.min(Math.max(0, video.position), list.length);
      list.splice(at, 0, { kind: "video", src: video.url });
    }
    return list;
  }, [images, video?.url, video?.position]);

  // Mouse users browse with thumbnails/arrows (so hover zoom works); touch
  // users swipe.
  const [emblaRef, api] = useEmblaCarousel({
    loop: false,
    watchDrag: (_api, evt) => evt.type === "touchstart",
  });
  const [selected, setSelected] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const hoverZoom = useMemo(canHoverZoom, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const autoPlay = !prefersReducedMotion();
  const poster = images[0];
  const itemsKey = items.map((i) => i.src).join("|");
  const videoIndex = items.findIndex((i) => i.kind === "video");

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on("select", onSelect).on("reInit", onSelect);
    return () => {
      api.off("select", onSelect).off("reInit", onSelect);
    };
  }, [api]);

  // A different set of photos (e.g. a colour with its own pictures) starts
  // from the first one again.
  useEffect(() => {
    setSelected(0);
    setZoom(null);
    api?.reInit();
    api?.scrollTo(0, true);
  }, [itemsKey, api]);

  // The full-screen view plays the video with sound - the small one pauses
  // meanwhile, and carries on after.
  useEffect(() => {
    const videos = stageRef.current?.querySelectorAll("video") ?? [];
    videos.forEach((v) => {
      if (viewerOpen) v.pause();
      else if (autoPlay) v.play().catch(() => {});
    });
  }, [viewerOpen, autoPlay]);

  const go = useCallback(
    (index: number) => {
      const next = (index + items.length) % items.length;
      setSelected(next);
      setZoom(null);
      api?.scrollTo(next);
    },
    [api, items.length],
  );

  const openViewer = (index: number) => {
    go(index);
    setZoom(null);
    setViewerOpen(true);
  };

  if (items.length === 0) {
    return (
      <div className="relative -mx-4 aspect-[3/4] overflow-hidden bg-ivory sm:mx-0">
        <BrandPlaceholder caption="Photos coming soon" />
      </div>
    );
  }

  const current = items[Math.min(selected, items.length - 1)];
  const zooming = !!zoom && current?.kind === "image";
  // Phones: the video also plays in a small frame over the lead photo.
  const showHighlightFrame = videoIndex > 0 && current?.kind === "image" && selected !== videoIndex;

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
                  <video src={item.src} poster={poster} muted playsInline preload="metadata" className="h-full w-full object-cover" />
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
        <div
          ref={stageRef}
          className="group relative -mx-4 bg-ivory sm:mx-0"
          // Zoom follows the mouse anywhere over the photo - also over the
          // counter, arrows or buttons on top of it, so no corner is blocked.
          onMouseMove={(e) => {
            if (!hoverZoom || current?.kind !== "image") return;
            setZoom(zoomPoint(e));
          }}
          onMouseLeave={() => setZoom(null)}
        >
          <div ref={emblaRef} className="overflow-hidden">
            <div className="flex touch-pan-y">
              {items.map((item, index) => (
                <div key={`${item.kind}-${item.src}-${index}`} className="relative aspect-[3/4] min-w-0 shrink-0 grow-0 basis-full overflow-hidden">
                  {item.kind === "image" ? (
                    <button
                      type="button"
                      className={cn("block h-full w-full", hoverZoom ? "cursor-crosshair" : "cursor-zoom-in")}
                      onClick={() => openViewer(index)}
                      aria-label={`View ${productName} in fullscreen`}
                    >
                      {/* The whole photo, never cropped - its corners and edges included. */}
                      <img
                        src={sized(item.src, 1200)}
                        alt={index === 0 ? productName : `${productName} - view ${index + 1}`}
                        loading={index === 0 ? "eager" : "lazy"}
                        className="h-full w-full object-contain"
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
                      className="h-full w-full bg-ink object-contain"
                      aria-label={`${productName} video`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Hover zoom: the full-size photo, 2.5x, where the mouse points */}
          {zooming && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden bg-ivory" aria-hidden>
              <img
                src={current.src}
                alt=""
                className="h-full w-full object-contain"
                style={{ transform: `scale(${ZOOM})`, transformOrigin: `${zoom!.x}% ${zoom!.y}%` }}
              />
            </div>
          )}

          {/* Phones: the video in a small frame over the lead photo */}
          {showHighlightFrame && (
            <button
              type="button"
              onClick={() => openViewer(videoIndex)}
              className="absolute bottom-4 left-4 h-32 w-24 overflow-hidden bg-ink shadow-xl ring-2 ring-ivory/90 focus-visible:outline-none focus-visible:ring-primary sm:h-36 sm:w-28 lg:hidden"
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
              <span
                className={cn(
                  "pointer-events-none absolute right-4 top-4 bg-ivory/90 px-2.5 py-1 text-[11px] tabular-nums tracking-[0.14em] transition-opacity",
                  zooming && "opacity-0",
                )}
              >
                {String(selected + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
              <GalleryArrow dir="prev" onClick={() => go(selected - 1)} />
              <GalleryArrow dir="next" onClick={() => go(selected + 1)} />
            </>
          )}
          {!zooming && (
            <button
              type="button"
              onClick={() => openViewer(selected)}
              className={cn(
                "absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center bg-ivory/90 transition-opacity",
                current?.kind === "image" && "lg:opacity-0 lg:group-hover:opacity-100",
              )}
              aria-label={current?.kind === "video" ? "Play the video full screen" : "Open fullscreen"}
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
        className={cn(
          "flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 border-none p-0 sm:rounded-none [&>button:last-child]:hidden",
          current?.kind === "video" ? "bg-ink text-ivory" : "bg-ivory",
        )}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onIndex(index - 1);
          if (e.key === "ArrowRight") onIndex(index + 1);
        }}
      >
        <VisuallyHidden>
          <DialogTitle>{productName} - photos</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-[11px] tabular-nums uppercase tracking-[0.2em] opacity-70">
            {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            {current?.kind === "image" && <span className="ml-3 hidden sm:inline">{zoomed ? "Move to look around · click to zoom out" : "Click to zoom"}</span>}
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
                setOrigin(zoomPoint(e));
                setZoomed((z) => !z);
              }}
              onMouseMove={(e) => {
                if (zoomed) setOrigin(zoomPoint(e));
              }}
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
            >
              <img
                src={current.src}
                alt={`${productName} - fullscreen view`}
                className="h-full w-full object-contain"
                style={zoomed ? { transform: `scale(${ZOOM})`, transformOrigin: `${origin.x}% ${origin.y}%` } : undefined}
              />
            </button>
          ) : current ? (
            // The whole video, start to end, with sound and its own controls.
            <video key={current.src} src={current.src} poster={poster} controls autoPlay playsInline className="h-full w-full object-contain" />
          ) : null}

          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => onIndex(index - 1)}
                className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background sm:left-6"
                aria-label="Previous"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => onIndex(index + 1)}
                className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background sm:right-6"
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
                className={cn(
                  "relative h-16 w-12 shrink-0 overflow-hidden bg-background",
                  i === index ? "ring-1 ring-foreground ring-offset-2 ring-offset-ivory" : "opacity-50 hover:opacity-100",
                )}
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
