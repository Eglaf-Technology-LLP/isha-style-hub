import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HERO_SLIDES, HeroSlide } from "@/content/storefront";
import { useHeroSlides } from "@/hooks/useHeroSlides";
import { Ornament } from "../Ornament";
import { cn } from "@/lib/utils";

const SLIDE_MS = 6500;
const SLIDE_HEIGHT = "h-[78svh] min-h-[540px] max-h-[880px]";

// Full-width hero: photo / video / pattern slides that advance on their own
// (paused while hovered), with a story-style progress bar. Slides come from
// Admin > Home Banner; the built-in ones only show if those can't be loaded.
export function HeroCarousel({ slides: given }: { slides?: HeroSlide[] }) {
  const { data, isLoading, isError } = useHeroSlides();
  if (given) return <Carousel slides={given} />;
  if (isLoading) return <div className={cn(SLIDE_HEIGHT, "bg-maroon-deep")} aria-hidden />;
  const slides = isError ? HERO_SLIDES : data ?? [];
  // Every slide switched off by the admin: no hero at all.
  if (slides.length === 0) return null;
  return <Carousel slides={slides} />;
}

function Carousel({ slides }: { slides: HeroSlide[] }) {
  const [ref, api] = useEmblaCarousel({ loop: slides.length > 1, duration: 32 });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const onSelect = useCallback(() => api && setIndex(api.selectedScrollSnap()), [api]);
  useEffect(() => {
    if (!api) return;
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onSelect]);

  useEffect(() => {
    if (!api || paused || slides.length < 2) return;
    const t = window.setTimeout(() => api.scrollNext(), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [api, index, paused, slides.length]);

  return (
    <section
      className="relative"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div ref={ref} className="overflow-hidden">
        <div className="flex">
          {slides.map((slide, i) => (
            <div key={slide.id} className="relative min-w-0 shrink-0 grow-0 basis-full" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
              <HeroSlideView slide={slide} active={i === index} priority={i === 0} />
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-6 z-10">
          <div className="store-container flex items-center gap-4">
            <div className="flex flex-1 gap-2 md:max-w-sm">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => api?.scrollTo(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className="relative h-[3px] flex-1 overflow-hidden bg-ivory/30"
                >
                  {i < index && <span className="absolute inset-0 bg-ivory" />}
                  {i === index && (
                    <span
                      key={`${index}-${paused}`}
                      className="absolute inset-0 origin-left bg-ivory animate-slide-progress"
                      style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="hidden gap-2 md:flex">
              <button type="button" aria-label="Previous slide" onClick={() => api?.scrollPrev()} className="flex h-11 w-11 items-center justify-center rounded-full border border-ivory/50 text-ivory transition hover:bg-ivory hover:text-ink">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Next slide" onClick={() => api?.scrollNext()} className="flex h-11 w-11 items-center justify-center rounded-full border border-ivory/50 text-ivory transition hover:bg-ivory hover:text-ink">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const isExternal = (href: string) => /^https?:\/\//i.test(href);

// Shop pages open in place; links to other sites open in a new tab.
function SlideLink({ href, className, children, label }: { href: string; className?: string; children?: ReactNode; label?: string }) {
  return isExternal(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label}>
      {children}
    </a>
  ) : (
    <Link to={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

// One slide. `device` is for the admin preview only: it picks the desktop or
// mobile photo directly instead of by screen width, and `className` replaces
// the storefront height.
export function HeroSlideView({
  slide,
  active,
  priority,
  device,
  className,
}: {
  slide: HeroSlide;
  active: boolean;
  priority?: boolean;
  device?: "desktop" | "mobile";
  className?: string;
}) {
  const desktopImage = slide.image || slide.mobileImage;
  const mobileImage = slide.mobileImage || slide.image;
  const hasMedia = !!(desktopImage || slide.video);
  const centered = slide.align === "center" || !hasMedia;
  const overlay = slide.overlay !== false;
  const buttonLabel = slide.cta?.label?.trim();
  const wholeSlideHref = slide.cta && !buttonLabel ? slide.cta.href : undefined;
  const hasText = !!(slide.eyebrow || slide.title || slide.titleAccent || slide.subtitle || buttonLabel || slide.secondaryCta);
  const imgClass = cn("absolute inset-0 h-full w-full object-cover object-[70%_center]", active && "animate-ken-burns");

  return (
    <div className={cn("relative overflow-hidden bg-maroon-deep", className ?? SLIDE_HEIGHT)}>
      {hasMedia ? (
        <>
          {slide.video ? (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={slide.video}
              poster={(device === "mobile" ? mobileImage : desktopImage) || undefined}
              autoPlay
              muted
              loop
              playsInline
            />
          ) : device ? (
            <img src={device === "mobile" ? mobileImage : desktopImage} alt="" className={imgClass} />
          ) : (
            <picture>
              {slide.mobileImage && <source media="(max-width: 767px)" srcSet={slide.mobileImage} />}
              <img src={desktopImage} alt={slide.title ?? ""} loading={priority ? "eager" : "lazy"} className={imgClass} />
            </picture>
          )}
          {overlay && (
            <div
              className={cn(
                "absolute inset-0",
                centered
                  ? "bg-ink/45"
                  : "bg-gradient-to-r from-ink/75 via-ink/35 to-transparent md:from-ink/70 md:via-ink/25",
              )}
            />
          )}
        </>
      ) : (
        <div className="absolute inset-0 pattern-jaal-dark">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--maroon-deep))_75%)]" />
        </div>
      )}

      {wholeSlideHref && (
        <SlideLink href={wholeSlideHref} className="absolute inset-0 z-[2]" label={slide.title || "Open offer"} />
      )}

      {hasText && (
        <div className={cn("pointer-events-none relative z-[3] flex h-full items-center", centered && "justify-center text-center")}>
          <div className="store-container">
            <div key={active ? "on" : "off"} className={cn("max-w-2xl text-ivory", centered && "mx-auto", active && "animate-fade-up")}>
              {slide.eyebrow && <p className="eyebrow mb-5 text-gold">{slide.eyebrow}</p>}
              {(slide.title || slide.titleAccent) && (
                <h1 className="font-serif text-[2.6rem] leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                  {slide.title}
                  {slide.titleAccent && (
                    <>
                      {slide.title && <br />}
                      <em className="font-normal text-ivory/95">{slide.titleAccent}</em>
                    </>
                  )}
                </h1>
              )}
              {!hasMedia && <Ornament className="my-7" />}
              {slide.subtitle && (
                <p className={cn("max-w-lg text-[15px] leading-relaxed text-ivory/80 md:text-base", hasMedia ? "mt-6" : "", centered && "mx-auto")}>
                  {slide.subtitle}
                </p>
              )}
              {(buttonLabel || slide.secondaryCta) && (
                <div className={cn("pointer-events-auto mt-9 flex flex-wrap gap-3", centered && "justify-center")}>
                  {buttonLabel && slide.cta && (
                    <SlideLink
                      href={slide.cta.href}
                      className="inline-flex h-12 items-center bg-ivory px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-ink transition-colors hover:bg-gold hover:text-ink"
                    >
                      {buttonLabel}
                    </SlideLink>
                  )}
                  {slide.secondaryCta && (
                    <SlideLink
                      href={slide.secondaryCta.href}
                      className="inline-flex h-12 items-center border border-ivory/60 px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-ivory transition-colors hover:bg-ivory hover:text-ink"
                    >
                      {slide.secondaryCta.label}
                    </SlideLink>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
