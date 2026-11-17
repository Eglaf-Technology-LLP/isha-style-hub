export type AiContentStatus = "none" | "ai_enhanced" | "ai_model" | "fully_ai";

// AI declaration (client corrections, 15 Nov 2026, point 3.3.5): exactly
// these 4 options, in the client's words. "AI-made product" isn't allowed -
// choosing it blocks saving, in the form and in the database
// (block_ai_made_products).
export const AI_CONTENT_OPTIONS: { value: AiContentStatus; label: string; allowed: boolean }[] = [
  { value: "none", label: "No AI – real photos only", allowed: true },
  { value: "ai_enhanced", label: "AI only for background / light / crop", allowed: true },
  { value: "ai_model", label: "AI model photo – extra (real photos also given)", allowed: true },
  { value: "fully_ai", label: "AI-made product – not allowed", allowed: false },
];

export const AI_MADE_NOT_ALLOWED = "AI-made products can't be listed on AllBoutiqs - choose another AI option to save";

export const aiContentAllowed = (status: string | null | undefined): boolean =>
  AI_CONTENT_OPTIONS.find((o) => o.value === status)?.allowed ?? false;

export const aiContentLabel = (status: string | null | undefined): string =>
  AI_CONTENT_OPTIONS.find((o) => o.value === status)?.label ?? "Not declared";
