import { geminiImageEdit, GeminiError } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { personImage, productImageUrl, productName, notes } = await req.json();

    if (!personImage || typeof personImage !== "string") {
      return new Response(JSON.stringify({ error: "personImage is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!productImageUrl || typeof productImageUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "productImageUrl is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const prompt = [
      `Photorealistic virtual try-on / product visualisation for an online fashion catalogue.`,
      `The FIRST image is the customer's own reference photo, provided by them with consent. The SECOND image is a fashion item: "${productName || "fashion item"}".`,
      `Edit the first image so the person is shown wearing the item from the second image, placed on the correct part of the body for that item type (clothing on the torso/legs, a saree or lehenga draped as a full outfit, footwear on the feet, an anklet/payal on the ankle, a bangle or watch on the wrist, earrings on the ears, a necklace at the neck, a ring on the finger, a bag held or on the shoulder).`,
      `If the item is a small accessory, keep the rest of the outfit unchanged and you may present a natural close-up crop of the relevant body area.`,
      `Preserve the person's identity, face, age, skin tone, body shape, hair and the original background exactly. Do not restyle or alter the person in any other way. Keep all clothing modest and appropriate.`,
      `Match the item's colour, print, material and shape faithfully. Natural lighting and realistic shadows.`,
      notes ? `Extra guidance: ${notes}` : "",
    ]
      .filter(Boolean)
      .join(" ");


    let result;
    try {
      result = await geminiImageEdit({
        apiKey: GEMINI_API_KEY,
        model: "gemini-2.5-flash-image",
        prompt,
        images: [{ url: personImage }, { url: productImageUrl }],
      });
    } catch (e) {
      if (e instanceof GeminiError && e.status === 429) {
        return new Response(
          JSON.stringify({ error: "Too many try-ons right now. Please retry in a minute." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw e;
    }

    if (!result.imageUrl) {
      console.error("No image returned", JSON.stringify(result).slice(0, 500));
      return new Response(
        JSON.stringify({
          error: result.text
            ? `Try-on unavailable for this photo: ${result.text}`
            : "Could not generate try-on image. Try a clear, well-lit solo photo of an adult.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ imageUrl: result.imageUrl, note: result.text || "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("virtual-try-on error", e);
    const status = e instanceof GeminiError ? e.status : 500;
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
