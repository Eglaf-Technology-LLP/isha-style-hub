import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { pixelPageView } from "@/lib/metaPixel";

// A Meta Pixel PageView for each page the shopper opens after the first.
// The first page's PageView is sent by the base code in index.html, and the
// pixel's own history tracking is switched off there (fbq.disablePushState),
// so every page counts exactly once. Only a new path counts: filters and
// tabs live in the query string and are the same page.
export function MetaPixelPageViews() {
  const { pathname } = useLocation();
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    pixelPageView();
  }, [pathname]);

  return null;
}
