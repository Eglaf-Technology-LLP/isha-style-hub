import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Meta Pixel base code (client's "Meta Pixel Setup Instructions and Code",
// 28 Nov 2026), as Meta gives it, at the end of <head>. One addition:
// fbq.disablePushState - this is a single-page app, and the next pages'
// PageViews come from src/components/MetaPixelPageViews.tsx, so the pixel's
// own history tracking is off to count each page once.
const metaPixelCode = (id: string) => `<!-- Meta Pixel Code -->
    <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq.disablePushState = true;
    fbq('init', '${id}');
    fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"
    /></noscript>
    <!-- End Meta Pixel Code -->`;

// Replaces the <!-- meta-pixel --> mark in index.html: with the base code
// when VITE_META_PIXEL_ID is set (the live site, netlify.toml), with nothing
// otherwise (localhost, stage), so test visits never reach Ads Manager.
function metaPixel(pixelId: string | undefined): Plugin {
  const id = pixelId?.trim() ?? "";
  if (id && !/^\d+$/.test(id)) throw new Error(`VITE_META_PIXEL_ID must be digits only, got "${id}"`);
  return {
    name: "meta-pixel",
    transformIndexHtml: (html) => html.replace("<!-- meta-pixel -->", id ? metaPixelCode(id) : ""),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), metaPixel(loadEnv(mode, process.cwd(), "VITE_").VITE_META_PIXEL_ID)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
