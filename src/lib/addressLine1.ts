// Address line 1 of every address a courier uses (client, 16 Nov 2026): at
// least ADDRESS_LINE1_MIN characters, spaces at either end not counted. The
// same rule and words as the website's src/lib/addressLine1.ts; the database
// refuses a shorter one on orders and saved addresses with
// ADDRESS_LINE1_LOCKED's words (migration 20261116140000).

export const ADDRESS_LINE1_MIN = 10;

export const ADDRESS_LINE1_HINT = `Minimum ${ADDRESS_LINE1_MIN} characters – shop / building no., street, area (needed by our courier partner)`;

// Next to a Save / Place order button that is locked because of it.
export const ADDRESS_LINE1_LOCKED = `Address line 1 needs at least ${ADDRESS_LINE1_MIN} characters`;

export const addressLine1Count = (value: string | null | undefined) =>
  (value ?? '').trim().length;

export const addressLine1Ok = (value: string | null | undefined) =>
  addressLine1Count(value) >= ADDRESS_LINE1_MIN;
