// Database / network errors are for developers, not shoppers: the console
// gets the real one, the customer a plain sentence.
export function friendly(
  error: { message?: string } | null | undefined,
  fallback: string,
): string {
  if (error) console.warn('[AllBoutiqs]', error.message ?? error);
  return fallback;
}
