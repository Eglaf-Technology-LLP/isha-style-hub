import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// A new page opens at the top. BrowserRouter keeps the window's scroll
// position from page to page, so a product opened from far down a listing
// opened half-way down (or at the bottom of) its own page.
// - Only a new path counts: tabs, filters and ?focus= live in the query
//   string and must not jump the page.
// - Back / forward is left to the browser, which returns the shopper to
//   where they were on the listing.
// - A link to a #section (the legal pages) scrolls there itself.
// "instant": html has scroll-behavior: smooth (index.css), which would
// otherwise show the page sliding up from where it was.
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const lastPath = useRef(pathname);

  useLayoutEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (navigationType === "POP" || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);

  return null;
}
