import { Link, useLocation } from "react-router-dom";
import { useHomePath } from "@/hooks/useHomePath";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { POPULAR_SEARCHES } from "@/content/storefront";

const NotFound = () => {
  const location = useLocation();
  const homePath = useHomePath();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pattern-jaal border-b border-border">
        <div className="store-container py-24 text-center md:py-32">
          <p className="font-serif text-[7rem] leading-none text-primary/15 md:text-[10rem]">404</p>
          <p className="eyebrow -mt-4 text-gold md:-mt-6">Page not found</p>
          <h1 className="mt-4 font-serif text-4xl leading-tight md:text-5xl">
            This page has <em className="font-normal text-primary">wandered off</em>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            The link may be old or mistyped. Let's get you back to the good stuff.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to={homePath}
              className="inline-flex h-12 items-center bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground hover:bg-maroon-deep"
            >
              Return to home
            </Link>
            <Link
              to="/category/all"
              className="inline-flex h-12 items-center border border-foreground bg-background px-8 text-[11px] font-medium uppercase tracking-[0.22em] hover:bg-foreground hover:text-background"
            >
              Shop all
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {POPULAR_SEARCHES.map((q) => (
              <Link
                key={q}
                to={`/category/all?search=${encodeURIComponent(q)}`}
                className="border border-foreground/15 bg-background px-4 py-2 text-xs transition-colors hover:border-primary hover:text-primary"
              >
                {q}
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
