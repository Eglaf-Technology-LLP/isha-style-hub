import { useEffect, useRef } from "react";
import { normalizeState } from "@/lib/indianStates";

// City and state from an Indian PIN code (India Post's public directory), so
// a customer doesn't misspell their city (Developer Corrections Part 8, 21).
const cache = new Map<string, Promise<{ city: string; state: string } | null>>();

export function lookupPincode(pin: string): Promise<{ city: string; state: string } | null> {
  if (!/^[1-9]\d{5}$/.test(pin)) return Promise.resolve(null);
  if (!cache.has(pin)) {
    cache.set(
      pin,
      fetch(`https://api.postalpincode.in/pincode/${pin}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const office = data?.[0]?.Status === "Success" ? data[0].PostOffice?.[0] : null;
          if (!office?.District || !office?.State) return null;
          return { city: String(office.District), state: normalizeState(String(office.State)) || String(office.State) };
        })
        .catch(() => null),
    );
  }
  return cache.get(pin)!;
}

// Fills city and state when a full PIN code is typed. A city or state the
// customer typed themselves is never overwritten - only empty fields, or
// ones this filled in for an earlier PIN.
export function usePincodeAutofill(
  pincode: string,
  current: { city: string; state: string },
  apply: (patch: { city?: string; state?: string }) => void,
) {
  const filled = useRef({ city: "", state: "" });
  const latest = useRef(current);
  latest.current = current;
  useEffect(() => {
    let alive = true;
    lookupPincode(pincode.trim()).then((found) => {
      if (!alive || !found) return;
      const patch: { city?: string; state?: string } = {};
      const now = latest.current;
      if (!now.city.trim() || now.city === filled.current.city) patch.city = found.city;
      if (!now.state.trim() || now.state === filled.current.state) patch.state = found.state;
      filled.current = { city: patch.city ?? filled.current.city, state: patch.state ?? filled.current.state };
      if (patch.city !== undefined || patch.state !== undefined) apply(patch);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode]);
}
