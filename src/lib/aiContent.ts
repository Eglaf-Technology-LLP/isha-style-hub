export type AiContentStatus = "none" | "ai_enhanced" | "ai_model" | "fully_ai";

export const AI_CONTENT_OPTIONS: { value: AiContentStatus; label: string; description: string }[] = [
  { value: "none", label: "No AI", description: "Real, unedited product photography." },
  {
    value: "ai_enhanced",
    label: "AI-enhanced / AI background",
    description: "Real product photo, with AI retouching or an AI-generated background.",
  },
  {
    value: "ai_model",
    label: "AI model / face / person",
    description: "Real product shown on an AI-generated model, face or person.",
  },
  {
    value: "fully_ai",
    label: "Fully AI-generated imagery",
    description: "The product image or representation itself is AI-generated.",
  },
];

export const aiContentLabel = (status: string | null | undefined): string =>
  AI_CONTENT_OPTIONS.find((o) => o.value === status)?.label ?? "Not declared";
