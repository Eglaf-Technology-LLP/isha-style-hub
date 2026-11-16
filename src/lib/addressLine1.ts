import { ADDRESS_LINE1_MIN } from "@/lib/vendorKyc";

// Address line 1 of every address a courier uses - a boutique's pickup
// address and a customer's delivery address: at least ADDRESS_LINE1_MIN
// characters, spaces at either end not counted (client, 16 Nov 2026).
export { ADDRESS_LINE1_MIN };

export const ADDRESS_LINE1_HINT = `Minimum ${ADDRESS_LINE1_MIN} characters – shop / building no., street, area (needed by our courier partner)`;

// Next to a Submit button that is locked because of it.
export const ADDRESS_LINE1_LOCKED = `Address line 1 needs at least ${ADDRESS_LINE1_MIN} characters`;

export const addressLine1Count = (value: string | null | undefined) => (value ?? "").trim().length;

export const addressLine1Ok = (value: string | null | undefined) => addressLine1Count(value) >= ADDRESS_LINE1_MIN;
