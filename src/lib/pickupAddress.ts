import { normalizeState } from "@/lib/indianStates";
import { ADDRESS_LINE1_MIN, PIN_RE } from "@/lib/vendorKyc";

// A courier pickup address (a boutique's or the warehouse's) that Shiprocket
// will accept - it refuses a pickup location with a 2-3 letter address line
// or state (Extra list F). Same rules as the server's
// pickup_address_problem(), which refuses to save anything else.
export const CITY_MIN = 3;
export const ADDRESS_LINES_MAX = 190;

export type PickupAddressField = "address_line1" | "address_line2" | "city" | "state" | "pincode";

export interface PickupAddressInput {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

const CITY_RE = /^[A-Za-z][A-Za-z .'-]*$/;

// allowBlank: an address not filled in at all is fine (settings screens -
// it just can't be used to ship yet); sign-up always needs one.
export function pickupAddressErrors(
  a: PickupAddressInput,
  { allowBlank = false }: { allowBlank?: boolean } = {},
): Partial<Record<PickupAddressField, string>> {
  const e: Partial<Record<PickupAddressField, string>> = {};
  const line1 = (a.address_line1 ?? "").trim();
  const line2 = (a.address_line2 ?? "").trim();
  const city = (a.city ?? "").trim();
  if (allowBlank && !line1 && !line2 && !city && !(a.state ?? "").trim() && !(a.pincode ?? "").trim()) return e;
  if (line1.length < ADDRESS_LINE1_MIN) {
    e.address_line1 = `Address line 1 needs at least ${ADDRESS_LINE1_MIN} characters - shop / building number, street and area`;
  } else if (line1.length + line2.length > ADDRESS_LINES_MAX) {
    e[line2 ? "address_line2" : "address_line1"] = `Address lines 1 and 2 together can have at most ${ADDRESS_LINES_MAX} characters`;
  }
  if (city.length < CITY_MIN || !CITY_RE.test(city)) e.city = "Enter the full city name (letters only)";
  if (!normalizeState(a.state)) e.state = "Select your state";
  if (!PIN_RE.test((a.pincode ?? "").trim())) e.pincode = "Enter a valid 6-digit PIN code";
  return e;
}

// Shows the problems and moves to the first one; true when there were any.
// `ids` maps each field to its input's id.
export function reportPickupAddressErrors(
  errors: Partial<Record<PickupAddressField, string>>,
  ids: Record<PickupAddressField, string>,
  toastError: (message: string) => void,
): boolean {
  const first = (Object.keys(errors) as PickupAddressField[])[0];
  if (!first) return false;
  toastError(`Pickup address: ${errors[first]}`);
  document.getElementById(ids[first])?.focus();
  return true;
}
