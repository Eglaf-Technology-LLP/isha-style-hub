import { useState, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ZoomIn, X, ShoppingBag, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

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

export function ProductMediaGallery({ images, productName, video }: ProductMediaGalleryProps) {
  const items: MediaItem[] = useMemo(() => {
    const imageItems = images.map((src) => ({ kind: "image" as const, src }));
    return video?.isPrimary ? [{ kind: "video" as const, src: video.url }, ...imageItems] : imageItems;
  }, [images, video?.url, video?.isPrimary]);

  const [selected, setSelected] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const autoPlay = !prefersReducedMotion();

  const current = items[Math.min(selected, items.length - 1)];
  const showHighlightFrame = !!video && !video.isPrimary && current?.kind === "image";
  const poster = images[0];

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }, []);

  const handlePrevious = useCallback(() => {
    setSelected((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  }, [items.length]);

  const handleNext = useCallback(() => {
    setSelected((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  }, [items.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrevious();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") setIsZoomOpen(false);
    },
    [handlePrevious, handleNext],
  );

  if (items.length === 0) {
    return (
      <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
        <ShoppingBag className="h-16 w-16 text-muted-foreground" />
      </div>
    );
  }

  const isImage = current.kind === "image";

  return (
    <div className="space-y-4">
      {/* Main media */}
      <div
        ref={imageContainerRef}
        className={cn(
          "relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted group",
          isImage && "cursor-zoom-in",
        )}
        onMouseEnter={() => isImage && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={isImage ? handleMouseMove : undefined}
        onClick={() => isImage && setIsZoomOpen(true)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role={isImage ? "button" : undefined}
        aria-label={isImage ? `View ${productName} in fullscreen` : undefined}
      >
        {isImage ? (
          <img src={current.src} alt={productName} className="w-full h-full object-cover transition-transform duration-200" />
        ) : (
          <video
            key={current.src}
            src={current.src}
            poster={poster}
            autoPlay={autoPlay}
            muted
            loop
            playsInline
            controls
            className="w-full h-full object-cover bg-black"
            aria-label={`${productName} video`}
          />
        )}

        {isImage && isHovering && (
          <div
            className="absolute w-40 h-40 border-2 border-primary/50 rounded-lg pointer-events-none bg-background/10 backdrop-blur-sm"
            style={{ left: `calc(${zoomPosition.x}% - 5rem)`, top: `calc(${zoomPosition.y}% - 5rem)` }}
          />
        )}

        {isImage && isHovering && (
          <div className="absolute top-4 right-4 w-48 h-48 rounded-xl overflow-hidden border-2 border-border shadow-lg bg-background hidden lg:block">
            <img
              src={current.src}
              alt={`${productName} zoomed`}
              className="w-full h-full object-cover"
              style={{ transform: "scale(2.5)", transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%` }}
            />
          </div>
        )}

        {isImage && (
          <div className="absolute bottom-4 right-4 p-2 rounded-full bg-card/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
            <ZoomIn className="h-5 w-5" />
          </div>
        )}

        {/* Compact highlight video over the lead image */}
        {showHighlightFrame && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHighlightOpen(true);
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              setIsHovering(false);
            }}
            className="absolute bottom-4 left-4 w-24 h-32 sm:w-28 sm:h-36 rounded-xl overflow-hidden ring-2 ring-white/90 shadow-xl bg-black cursor-pointer focus-visible:outline-none focus-visible:ring-primary"
            aria-label={`Play ${productName} video`}
          >
            <video src={video!.url} poster={poster} autoPlay={autoPlay} muted loop playsInline className="w-full h-full object-cover" />
            <span className="absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-black/50 to-transparent">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                <Play className="h-3 w-3 fill-current" /> Watch
              </span>
            </span>
          </button>
        )}

        {items.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-card/80 backdrop-blur-sm text-sm font-medium">
              {selected + 1} / {items.length}
            </div>
          </>
        )}
      </div>

      {/* Album thumbnails */}
      {items.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {items.map((item, index) => (
            <button
              key={`${item.kind}-${item.src}-${index}`}
              onClick={() => setSelected(index)}
              className={cn(
                "relative flex-shrink-0 w-20 h-24 rounded-lg overflow-hidden border-2 transition-all hover:opacity-80",
                selected === index ? "border-primary ring-2 ring-primary/20" : "border-transparent",
              )}
              aria-label={item.kind === "video" ? "View video" : `View image ${index + 1}`}
            >
              {item.kind === "image" ? (
                <img src={item.src} alt={`${productName} - Image ${index + 1}`} className="w-full h-full object-cover" />
              ) : (
                <>
                  {poster ? (
                    <img src={poster} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-black" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <Play className="h-6 w-6 text-white fill-white" />
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen image viewer */}
      <Dialog open={isZoomOpen} onOpenChange={setIsZoomOpen}>
        <DialogContent
          className="max-w-[95vw] max-h-[95vh] p-0 bg-background/95 backdrop-blur-md border-none"
          onKeyDown={handleKeyDown}
        >
          <VisuallyHidden>
            <DialogTitle>Image Gallery - {productName}</DialogTitle>
          </VisuallyHidden>
          <div className="relative w-full h-[90vh] flex items-center justify-center">
            <button
              onClick={() => setIsZoomOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-card hover:bg-muted transition-colors"
              aria-label="Close fullscreen view"
            >
              <X className="h-6 w-6" />
            </button>
            {items.length > 1 && (
              <>
                <button
                  onClick={handlePrevious}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-card hover:bg-muted transition-colors"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-card hover:bg-muted transition-colors"
                  aria-label="Next"
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </>
            )}
            <div className="relative max-w-full max-h-full overflow-auto">
              {current.kind === "image" ? (
                <img
                  src={current.src}
                  alt={`${productName} - Fullscreen view`}
                  className="max-w-none cursor-zoom-in transition-transform duration-300 hover:scale-150"
                  style={{ maxHeight: "85vh" }}
                />
              ) : (
                <video src={current.src} poster={poster} controls autoPlay playsInline style={{ maxHeight: "85vh" }} />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Highlight video, full size with sound */}
      {video && !video.isPrimary && (
        <Dialog open={highlightOpen} onOpenChange={setHighlightOpen}>
          <DialogContent className="max-w-3xl p-0 bg-black border-none overflow-hidden">
            <VisuallyHidden>
              <DialogTitle>{productName} video</DialogTitle>
            </VisuallyHidden>
            <video src={video.url} poster={poster} controls autoPlay playsInline className="w-full max-h-[85vh] bg-black" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
