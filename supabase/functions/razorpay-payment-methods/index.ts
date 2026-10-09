import { corsHeaders, jsonResponse, errorMessage } from "../_shared/auth.ts";

// Which EMI-style methods our Razorpay account can take right now, so
// checkout offers "Pay in EMI" only once EMI (card EMI, cardless EMI or Pay
// Later) is switched on in the Razorpay dashboard - no code change needed
// when it is. Reads Razorpay's public /v1/methods for our key id; cached
// briefly per instance.

interface EmiAvailability {
  card: boolean;
  cardless: boolean;
  paylater: boolean;
  // Lowest order value (₹) any card EMI plan accepts, when Razorpay says.
  min_amount: number | null;
}

const CACHE_MS = 10 * 60_000;
let cache: { at: number; emi: EmiAvailability } | null = null;

// Razorpay returns [] when a method family is off, and a {provider: true}
// map when it's on.
function enabledProviders(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).filter(([, on]) => on).map(([k]) => k);
  }
  return [];
}

function lowestEmiAmount(options: unknown): number | null {
  if (!options || typeof options !== "object") return null;
  const mins = Object.values(options as Record<string, unknown>)
    .flatMap((plans) => (Array.isArray(plans) ? plans : []))
    .map((plan) => Number((plan as { min_amount?: unknown })?.min_amount))
    .filter((n) => Number.isFinite(n) && n > 0);
  return mins.length ? Math.min(...mins) / 100 : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (cache && Date.now() - cache.at < CACHE_MS) return jsonResponse({ emi: cache.emi });

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    if (!keyId) throw new Error("RAZORPAY_KEY_ID not configured");
    const res = await fetch(`https://api.razorpay.com/v1/methods?key_id=${encodeURIComponent(keyId)}`);
    if (!res.ok) throw new Error(`Razorpay methods lookup failed (${res.status})`);
    const methods = await res.json();

    const emiTypes = methods.emi_types && typeof methods.emi_types === "object" ? Object.values(methods.emi_types) : [];
    const emi: EmiAvailability = {
      card: methods.emi === true || emiTypes.some(Boolean),
      cardless: enabledProviders(methods.cardless_emi).length > 0,
      paylater: enabledProviders(methods.paylater).length > 0,
      min_amount: lowestEmiAmount(methods.emi_options),
    };
    cache = { at: Date.now(), emi };
    return jsonResponse({ emi });
  } catch (e) {
    // Checkout simply doesn't offer EMI if this fails.
    console.error("razorpay-payment-methods failed", errorMessage(e));
    return jsonResponse({ emi: { card: false, cardless: false, paylater: false, min_amount: null } });
  }
});
