import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HERO_SLIDES, HeroSlide } from "@/content/storefront";
import { Ornament } from "../Ornament";
import { cn } from "@/lib/utils";

const SLIDE_MS = 6500;

// Full-width hero: photo / video / pattern slides that advance on their own
// (paused while hovered), with a story-style progress bar.
export function HeroCarousel({ slides = HERO_SLIDES }: { slides?: HeroSlide[] }) {
  const [ref, api] = useEmblaCarousel({ loop: true, duration: 32 });
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
              <Slide slide={slide} active={i === index} priority={i === 0} />
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <>
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
        </>
      )}
    </section>
  );
}

function Slide({ slide, active, priority }: { slide: HeroSlide; active: boolean; priority: boolean }) {
  const hasMedia = !!(slide.image || slide.video);
  const centered = slide.align === "center" || !hasMedia;
  return (
    <div className="relative h-[78svh] min-h-[540px] max-h-[880px] overflow-hidden bg-maroon-deep">
      {hasMedia ? (
        <>
          {slide.video ? (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={slide.video}
              poster={slide.image}
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <img
              src={slide.image}
              alt=""
              loading={priority ? "eager" : "lazy"}
              className={cn("absolute inset-0 h-full w-full object-cover object-[70%_center]", active && "animate-ken-burns")}
            />
          )}
          <div
            className={cn(
              "absolute inset-0",
              centered
                ? "bg-ink/45"
                : "bg-gradient-to-r from-ink/75 via-ink/35 to-transparent md:from-ink/70 md:via-ink/25",
            )}
          />
        </>
      ) : (
        <div className="absolute inset-0 pattern-jaal-dark">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--maroon-deep))_75%)]" />
        </div>
      )}

      <div className={cn("relative z-[1] flex h-full items-center", centered && "justify-center text-center")}>
        <div className="store-container">
          <div key={active ? "on" : "off"} className={cn("max-w-2xl text-ivory", centered && "mx-auto", active && "animate-fade-up")}>
            <p className="eyebrow mb-5 text-gold">{slide.eyebrow}</p>
            <h1 className="font-serif text-[2.6rem] leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              {slide.title}
              {slide.titleAccent && (
                <>
                  <br />
                  <em className="font-normal text-ivory/95">{slide.titleAccent}</em>
                </>
              )}
            </h1>
            {!hasMedia && <Ornament className="my-7" />}
            <p className={cn("max-w-lg text-[15px] leading-relaxed text-ivory/80 md:text-base", hasMedia ? "mt-6" : "", centered && "mx-auto")}>
              {slide.subtitle}
            </p>
            <div className={cn("mt-9 flex flex-wrap gap-3", centered && "justify-center")}>
              <Link
                to={slide.cta.href}
                className="inline-flex h-12 items-center bg-ivory px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-ink transition-colors hover:bg-gold hover:text-ink"
              >
                {slide.cta.label}
              </Link>
              {slide.secondaryCta && (
                <Link
                  to={slide.secondaryCta.href}
                  className="inline-flex h-12 items-center border border-ivory/60 px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-ivory transition-colors hover:bg-ivory hover:text-ink"
                >
                  {slide.secondaryCta.label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
