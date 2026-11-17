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

// Phones and tablets: pinch / double-tap wording in the full-screen view.
const isTouchScreen = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

const sized = (src: string, width: number) => getOptimizedImageUrl(src, { width }) ?? src;

// Product photos and video: swipe on phones, thumbnails on desktop, and a
// full-screen viewer on click / tap. No zoom on hover (client list 2.4.2) -
// the zoom-in cursor shows that a click opens the photo full screen, where
// it zooms, drags around and pinches.
export function ProductMediaGallery({ images, productName, video }: ProductMediaGalleryProps) {
  const items: MediaItem[] = useMemo(() => {
    const list: MediaItem[] = images.map((src) => ({ kind: "image" as const, src }));
    if (video) {
      const at = video.position == null ? list.length : Math.min(Math.max(0, video.position), list.length);
      list.splice(at, 0, { kind: "video", src: video.url });
    }
    return list;
  }, [images, video?.url, video?.position]);

  // Mouse users browse with thumbnails/arrows (a click opens the photo full
  // screen); touch users swipe.
  const [emblaRef, api] = useEmblaCarousel({
    loop: false,
    watchDrag: (_api, evt) => evt.type === "touchstart",
  });
  const [selected, setSelected] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
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
      api?.scrollTo(next);
    },
    [api, items.length],
  );

  const openViewer = (index: number) => {
    go(index);
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
        <div ref={stageRef} className="group relative -mx-4 bg-ivory sm:mx-0">
          <div ref={emblaRef} className="overflow-hidden">
            <div className="flex touch-pan-y">
              {items.map((item, index) => (
                <div key={`${item.kind}-${item.src}-${index}`} className="relative aspect-[3/4] min-w-0 shrink-0 grow-0 basis-full overflow-hidden">
                  {item.kind === "image" ? (
                    <button
                      type="button"
                      className="block h-full w-full cursor-zoom-in"
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
                      className="h-full w-full bg-ivory object-contain"
                      aria-label={`${productName} video`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

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
              <span className="pointer-events-none absolute right-4 top-4 bg-ivory/90 px-2.5 py-1 text-[11px] tabular-nums tracking-[0.14em]">
                {String(selected + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
              <GalleryArrow dir="prev" onClick={() => go(selected - 1)} />
              <GalleryArrow dir="next" onClick={() => go(selected + 1)} />
            </>
          )}
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

// ---------- full-screen view ----------

// Click / double-tap zooms to CLICK_ZOOM; pinch and the mouse wheel go
// anywhere from 1x to MAX_ZOOM.
const CLICK_ZOOM = 2.5;
const MAX_ZOOM = 4;
// A press that moves less than this is a click / tap, not a drag.
const TAP_SLOP = 6;
const DOUBLE_TAP_MS = 300;
const SWIPE_MIN = 60;

type Point = { x: number; y: number };
// Scale, and how far the photo's centre is moved from the frame's centre (px).
type View = { s: number; x: number; y: number };
const UNZOOMED: View = { s: 1, x: 0, y: 0 };

// Keeps the zoomed photo covering the frame: it can be dragged up to its own
// edge, never past it, and stays centred along a side that still fits.
function fitView(v: View, box: HTMLElement | null, img: HTMLImageElement | null): View {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s));
  if (!box || s === 1) return UNZOOMED;
  const W = box.clientWidth;
  const H = box.clientHeight;
  // The photo is object-contain: work out the size it's actually drawn at.
  let w = W;
  let h = H;
  if (img?.naturalWidth && img.naturalHeight) {
    const ratio = img.naturalWidth / img.naturalHeight;
    if (W / H > ratio) w = H * ratio;
    else h = W / ratio;
  }
  const maxX = Math.max(0, (w * s - W) / 2);
  const maxY = Math.max(0, (h * s - H) / 2);
  return { s, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
}

// Zoom to scale `s`, keeping the bit of the photo that was under `at` (in
// view `from`) under `to` - the finger / mouse stays on the same spot.
function zoomAround(from: View, at: Point, to: Point, s: number): View {
  const px = (at.x - from.x) / from.s;
  const py = (at.y - from.y) / from.s;
  return { s, x: to.x - px * s, y: to.y - py * s };
}

// One photo in the full-screen view. Mouse: click to zoom in where you
// click, drag to move around, click again to zoom out; the wheel zooms too.
// Touch: pinch or double-tap to zoom, drag with one finger to move, swipe to
// the next photo when not zoomed in (client list 2.4.2).
function ZoomableImage({
  src,
  alt,
  onSwipe,
  onZoomedChange,
}: {
  src: string;
  alt: string;
  onSwipe: (step: 1 | -1) => void;
  onZoomedChange: (zoomed: boolean) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>(UNZOOMED);
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<
    { kind: "pan"; start: Point; view: View } | { kind: "pinch"; dist: number; mid: Point; view: View } | null
  >(null);
  // The press as a whole: where it started, and whether it moved or used two fingers.
  const press = useRef({ start: { x: 0, y: 0 }, moved: false, multi: false });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const zoomed = view.s > 1;
  useEffect(() => onZoomedChange(zoomed), [zoomed, onZoomedChange]);

  // Screen point -> offset from the frame's centre.
  const local = (p: Point): Point => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 };
  };
  const fit = (v: View) => fitView(v, boxRef.current, imgRef.current);

  const toggleAt = (screen: Point) => {
    const at = local(screen);
    setAnimate(true);
    setView((v) => (v.s > 1 ? UNZOOMED : fit(zoomAround(v, at, at, CLICK_ZOOM))));
  };

  // (Re)starts the gesture from the fingers down now, so lifting one finger
  // of a pinch carries on as a drag without a jump.
  const beginGesture = () => {
    const pts = [...pointers.current.values()];
    const v = viewRef.current;
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = {
        kind: "pinch",
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        view: v,
      };
    } else if (pts.length === 1) {
      gesture.current = { kind: "pan", start: pts[0], view: v };
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 0) press.current = { start: { x: e.clientX, y: e.clientY }, moved: false, multi: false };
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size > 1) press.current.multi = true;
    setAnimate(false);
    beginGesture();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!b) return;
      const s = Math.min(MAX_ZOOM, Math.max(1, (g.view.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist));
      setView(fit(zoomAround(g.view, g.mid, local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), s)));
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (!press.current.moved && Math.hypot(dx, dy) > TAP_SLOP) press.current.moved = true;
    if (press.current.moved && g.view.s > 1) {
      setDragging(true);
      setView(fit({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }));
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size > 0) {
      beginGesture();
      return;
    }
    gesture.current = null;
    setDragging(false);
    if (e.type === "pointercancel") return;

    const p = press.current;
    if (p.multi) {
      // A pinch that ended (almost) at 1x snaps back to the whole photo.
      if (viewRef.current.s < 1.05) {
        setAnimate(true);
        setView(UNZOOMED);
      }
      return;
    }
    const at = { x: e.clientX, y: e.clientY };
    if (!p.moved) {
      if (e.pointerType === "mouse") return toggleAt(at);
      // Touch: a double-tap zooms (a single tap does nothing).
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(at.x - prev.x, at.y - prev.y) < 30) {
        lastTap.current = null;
        toggleAt(at);
      } else {
        lastTap.current = { t: now, ...at };
      }
      return;
    }
    // A sideways swipe over a photo that isn't zoomed in: next / previous.
    const dx = at.x - p.start.x;
    const dy = at.y - p.start.y;
    if (viewRef.current.s === 1 && Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
  };

  // The mouse wheel and a laptop trackpad pinch (ctrl+wheel to the browser)
  // zoom the photo, not the page - needs a non-passive listener.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
      setAnimate(false);
      setView((v) => fitView(zoomAround(v, at, at, Math.min(MAX_ZOOM, Math.max(1, v.s * factor))), el, imgRef.current));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={boxRef}
      role="button"
      tabIndex={0}
      aria-label={zoomed ? "Zoom out" : "Zoom in"}
      className={cn(
        "h-full w-full touch-none select-none overflow-hidden focus-visible:outline-none",
        zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        toggleAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className={cn(
          "pointer-events-none h-full w-full object-contain will-change-transform",
          animate && "transition-transform duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` }}
      />
    </div>
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
  const touch = useMemo(isTouchScreen, []);
  const current = items[Math.min(index, items.length - 1)];
  const hint = touch
    ? zoomed
      ? "Drag to move · double-tap to zoom out"
      : "Pinch or double-tap to zoom"
    : zoomed
      ? "Drag to move · click to zoom out"
      : "Click or scroll to zoom";

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
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-[11px] tabular-nums uppercase tracking-[0.2em] opacity-70">
            {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            {current?.kind === "image" && <span className="ml-3">{hint}</span>}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-10 w-10 shrink-0 items-center justify-center hover:text-primary"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {current?.kind === "image" ? (
            <ZoomableImage
              key={current.src}
              src={current.src}
              alt={`${productName} - fullscreen view`}
              onSwipe={(step) => onIndex(index + step)}
              onZoomedChange={setZoomed}
            />
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
