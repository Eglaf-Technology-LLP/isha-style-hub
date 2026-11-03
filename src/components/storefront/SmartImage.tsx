import { ReactNode, useState } from "react";
import { getOptimizedImageUrl } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";

interface SmartImageProps {
  src: string | null | undefined;
  alt: string;
  width?: number;
  className?: string;
  // Rendered when there's no image or it fails to load.
  fallback: ReactNode;
  priority?: boolean;
}

// An <img> that is resized by Supabase Storage when it can be (the photo
// itself when resizing isn't available), fades in once loaded, and swaps to
// a designed fallback when the photo is missing/broken.
export function SmartImage({ src, alt, width = 800, className, fallback, priority = false }: SmartImageProps) {
  const [failed, setFailed] = useState(false);
  const [original, setOriginal] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  const resized = getOptimizedImageUrl(src, { width }) ?? src;
  return (
    <img
      src={original ? src : resized}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => (!original && resized !== src ? setOriginal(true) : setFailed(true))}
      className={cn("transition-opacity duration-700", loaded ? "opacity-100" : "opacity-0", className)}
    />
  );
}
