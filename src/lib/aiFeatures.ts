// AI shopping helpers on the product page, hidden for now (2026-10-16) -
// the components (SizeRecommender, VirtualTryOn) and their edge functions
// are kept. Set to true to show them again.
export const AI_SIZE_FINDER_ENABLED = false; // "Find my size with AI"
export const VIRTUAL_TRY_ON_ENABLED = false; // "Virtual Try-On"
// "Complete the look" picks: an AI call on every product page view - off
// until GEMINI_API_KEY is set on live and the picks are cached, so a busy
// day doesn't mean one Gemini call (and, without the key, one error) per view.
export const COMPLETE_THE_LOOK_ENABLED = false;
