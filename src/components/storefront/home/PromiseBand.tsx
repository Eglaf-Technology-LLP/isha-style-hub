import { BadgeCheck, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { PROMISES } from "@/content/storefront";
import { Ornament } from "../Ornament";

const ICONS = { verified: BadgeCheck, quality: ShieldCheck, returns: RotateCcw, secure: Lock } as const;

// "The AllBoutiqs promise" - what every order gets, on a deep maroon band.
export function PromiseBand() {
  return (
    <section className="bg-maroon-deep pattern-jaal-dark py-16 text-ivory md:py-20">
      <div className="store-container">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <p className="eyebrow text-gold">Shop with confidence</p>
          <h2 className="mt-3 font-serif text-3xl md:text-4xl">
            The AllBoutiqs <em className="text-gold">promise</em>
          </h2>
          <Ornament className="mt-6" />
        </div>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map((p) => {
            const Icon = ICONS[p.icon];
            return (
              <div key={p.title} className="text-center">
                <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-gold/50">
                  <Icon className="h-6 w-6 text-gold" strokeWidth={1.4} />
                </span>
                <p className="font-serif text-xl">{p.title}</p>
                <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-ivory/70">{p.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
