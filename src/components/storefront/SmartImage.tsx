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

// An <img> that is resized by Supabase Storage when it can be, fades in once
// loaded, and swaps to a designed fallback when the photo is missing/broken.
export function SmartImage({ src, alt, width = 800, className, fallback, priority = false }: SmartImageProps) {
  // 0 = resized url, 1 = original url, 2 = both failed -> fallback.
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // A new photo (e.g. a colour swatch picked) starts again from the resized url.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setAttempt(0);
    setLoaded(false);
  }
  if (!src || attempt >= 2) return <>{fallback}</>;
  const resized = getOptimizedImageUrl(src, { width }) ?? src;
  const current = attempt === 0 ? resized : src;
  return (
    <img
      src={current}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      // A resized url that fails (e.g. transformation not enabled on the
      // project) gets one retry with the original before the fallback shows.
      onError={() => setAttempt((a) => (a === 0 && resized !== src ? 1 : 2))}
      className={cn("transition-opacity duration-700", loaded ? "opacity-100" : "opacity-0", className)}
    />
  );
}
