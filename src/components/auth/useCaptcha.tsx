import { useCallback, useRef, useState } from "react";

// Bot check (Cloudflare Turnstile) before a sign-in code is sent or a
// password is tried - stops scripts sending thousands of texts and emails
// (SMS pumping). Off until VITE_TURNSTILE_SITE_KEY is set; switch it on
// together with Supabase Auth's captcha protection (Authentication > Attack
// Protection, Turnstile secret) and TURNSTILE_SECRET_KEY on the
// auth-email-otp function, or one side refuses what the other sends.
export const CAPTCHA_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined;

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};
const turnstile = () => (window as unknown as { turnstile?: Turnstile }).turnstile;

let script: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      script = null;
      reject(new Error("Turnstile didn't load"));
    };
    document.head.appendChild(s);
  });
  return script;
}

// widget goes in the form; token is passed with the request; reset() after
// each try, since a token works once.
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const widgetId = useRef<string | null>(null);

  const mount = useCallback((el: HTMLDivElement | null) => {
    const t = turnstile();
    if (widgetId.current && t) t.remove(widgetId.current);
    widgetId.current = null;
    setToken(null);
    if (!el || !CAPTCHA_SITE_KEY) return;
    loadTurnstile()
      .then(() => {
        const ts = turnstile();
        if (!el.isConnected || !ts) return;
        widgetId.current = ts.render(el, {
          sitekey: CAPTCHA_SITE_KEY,
          appearance: "interaction-only",
          callback: (value: string) => setToken(value),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => setToken(null));
  }, []);

  const reset = useCallback(() => {
    setToken(null);
    const t = turnstile();
    if (widgetId.current && t) t.reset(widgetId.current);
  }, []);

  return {
    token: token ?? undefined,
    // Nothing to wait for when the check is off.
    ready: !CAPTCHA_SITE_KEY || !!token,
    widget: CAPTCHA_SITE_KEY ? <div ref={mount} className="flex justify-center" /> : null,
    reset,
  };
}

export const CAPTCHA_WAIT_MESSAGE = "Please complete the quick check below, then try again.";
