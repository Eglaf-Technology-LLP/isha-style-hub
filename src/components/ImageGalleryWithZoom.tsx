import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ZoomIn, X, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface ImageGalleryWithZoomProps {
  images: string[];
  productName: string;
}

export function ImageGalleryWithZoom({ images, productName }: ImageGalleryWithZoomProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setZoomPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }, []);

  const handlePrevious = useCallback(() => {
    setSelectedImage((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setSelectedImage((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") handlePrevious();
    if (e.key === "ArrowRight") handleNext();
    if (e.key === "Escape") setIsZoomOpen(false);
  }, [handlePrevious, handleNext]);

  if (images.length === 0) {
    return (
      <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
        <ShoppingBag className="h-16 w-16 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Image with Hover Zoom */}
      <div
        ref={imageContainerRef}
        className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted cursor-zoom-in group"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={handleMouseMove}
        onClick={() => setIsZoomOpen(true)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`View ${productName} in fullscreen`}
      >
        <img
          src={images[selectedImage]}
          alt={productName}
          className="w-full h-full object-cover transition-transform duration-200"
        />

        {/* Hover Zoom Lens */}
        {isHovering && (
          <div
            className="absolute w-40 h-40 border-2 border-primary/50 rounded-lg pointer-events-none bg-background/10 backdrop-blur-sm"
            style={{
              left: `calc(${zoomPosition.x}% - 5rem)`,
              top: `calc(${zoomPosition.y}% - 5rem)`,
            }}
          />
        )}

        {/* Zoom Preview Window (appears on hover) */}
        {isHovering && (
          <div className="absolute top-4 right-4 w-48 h-48 rounded-xl overflow-hidden border-2 border-border shadow-lg bg-background hidden lg:block">
            <img
              src={images[selectedImage]}
              alt={`${productName} zoomed`}
              className="w-full h-full object-cover"
              style={{
                transform: "scale(2.5)",
                transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
              }}
            />
          </div>
        )}

        {/* Zoom Icon */}
        <div className="absolute bottom-4 right-4 p-2 rounded-full bg-card/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="h-5 w-5" />
        </div>

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Image Counter */}
        {images.length > 1 && (
          <div className="absolute bottom-4 left-4 px-3 py-1 rounded-full bg-card/80 backdrop-blur-sm text-sm font-medium">
            {selectedImage + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedImage(index)}
              className={cn(
                "flex-shrink-0 w-20 h-24 rounded-lg overflow-hidden border-2 transition-all hover:opacity-80",
                selectedImage === index
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-transparent"
              )}
              aria-label={`View image ${index + 1}`}
            >
              <img
                src={image}
                alt={`${productName} - Image ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen Zoom Dialog */}
      <Dialog open={isZoomOpen} onOpenChange={setIsZoomOpen}>
        <DialogContent 
          className="max-w-[95vw] max-h-[95vh] p-0 bg-background/95 backdrop-blur-md border-none"
          onKeyDown={handleKeyDown}
        >
          <VisuallyHidden>
            <DialogTitle>Image Gallery - {productName}</DialogTitle>
          </VisuallyHidden>
          <div className="relative w-full h-[90vh] flex items-center justify-center">
            {/* Close Button */}
            <button
              onClick={() => setIsZoomOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-card hover:bg-muted transition-colors"
              aria-label="Close fullscreen view"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Navigation Arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={handlePrevious}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-card hover:bg-muted transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-card hover:bg-muted transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </>
            )}

            {/* Zoomable Image */}
            <div className="relative max-w-full max-h-full overflow-auto">
              <img
                src={images[selectedImage]}
                alt={`${productName} - Fullscreen view`}
                className="max-w-none cursor-zoom-in transition-transform duration-300 hover:scale-150"
                style={{ maxHeight: "85vh" }}
              />
            </div>

            {/* Thumbnail Strip */}
            {images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 p-2 rounded-lg bg-card/80 backdrop-blur-sm">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={cn(
                      "w-12 h-14 rounded overflow-hidden border-2 transition-all",
                      selectedImage === index
                        ? "border-primary"
                        : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  >
                    <img
                      src={image}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
