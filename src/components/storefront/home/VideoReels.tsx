import { Link } from "react-router-dom";
import { useStoreProducts } from "@/hooks/useStorefront";
import { SectionHeading } from "../SectionHeading";
import { Rail } from "../Rail";
import { formatINR } from "@/lib/format";

// "Watch & shop": product videos as vertical reels. Hidden until products
// have approved videos.
export function VideoReels() {
  const { data: products = [] } = useStoreProducts();
  const withVideo = products.filter((p) => p.video_url && p.video_status === "approved");
  if (withVideo.length === 0) return null;

  return (
    <section className="bg-ink py-16 text-ivory md:py-24">
      <div className="store-container grid gap-10 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-center lg:gap-14">
        <div>
          <SectionHeading eyebrow="Watch & shop" title="See it" accent="in motion" tone="dark" className="mb-0 md:mb-0" />
          <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-ivory/70">
            Watch the drape, the fall and the shine before you buy - every video is from the boutique itself.
          </p>
          <Link
            to="/category/all"
            className="mt-8 hidden h-12 items-center border border-ivory/50 px-8 text-[11px] font-medium uppercase tracking-[0.22em] transition-colors hover:bg-ivory hover:text-ink lg:inline-flex"
          >
            Shop all
          </Link>
        </div>
        <Rail itemClassName="basis-[62%] sm:basis-[38%] lg:basis-[31%] xl:basis-[24%]">
          {withVideo.map((p) => (
            <Link key={p.id} to={`/product/${p.id}`} className="group block">
              <div className="relative aspect-[9/16] overflow-hidden bg-maroon-deep">
                <video
                  src={p.video_url!}
                  poster={p.images[0]}
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="eyebrow text-ivory/70">{p.vendor?.name}</p>
                  <p className="mt-1 line-clamp-1 font-serif text-lg">{p.name}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm">{formatINR(p.price)}</span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-gold">Shop now</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </Rail>
      </div>
    </section>
  );
}
