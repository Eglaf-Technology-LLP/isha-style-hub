// AI Size Recommender — suggests a best-fit size for a product based on a short fit quiz.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuizInput {
  productId: string;
  availableSizes: string[];
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  gender?: string;
  bodyType?: "slim" | "athletic" | "average" | "curvy" | "plus";
  fitPreference?: "tight" | "regular" | "loose";
  usualSize?: string;
  usualSizeBrand?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body: QuizInput = await req.json();
    const { productId, availableSizes } = body;
    if (!productId || !Array.isArray(availableSizes) || availableSizes.length === 0) {
      return new Response(JSON.stringify({ error: "productId and availableSizes required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load product context from Supabase
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: product } = await supabase
      .from("products")
      .select("name, description, category_id, tags")
      .eq("id", productId)
      .single();

    let categoryName = "";
    if (product?.category_id) {
      const { data: cat } = await supabase
        .from("categories")
        .select("name")
        .eq("id", product.category_id)
        .single();
      categoryName = cat?.name ?? "";
    }

    const systemPrompt = `You are an expert fashion fit consultant for an Indian fashion e-commerce store.
Given a customer's body measurements, preferences, and a product, recommend the BEST size from the provided list.
Consider Indian sizing standards. Be honest about confidence; if two sizes are borderline, suggest sizing up for loose fit or down for tight fit.
Return a recommended size that EXISTS in the provided list, a confidence (low/medium/high), and a 1-2 sentence reasoning.`;

    const userPrompt = `Product: ${product?.name ?? "Unknown"}
Category: ${categoryName}
Description: ${(product?.description ?? "").slice(0, 400)}
Available sizes: ${availableSizes.join(", ")}

Customer profile:
- Height: ${body.height_cm ?? "?"} cm
- Weight: ${body.weight_kg ?? "?"} kg
- Age: ${body.age ?? "?"}
- Gender: ${body.gender ?? "?"}
- Body type: ${body.bodyType ?? "?"}
- Fit preference: ${body.fitPreference ?? "regular"}
- Usually wears size: ${body.usualSize ?? "?"} (brand: ${body.usualSizeBrand ?? "?"})

Recommend the best size now.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "recommend_size",
              description: "Return the recommended size for this customer.",
              parameters: {
                type: "object",
                properties: {
                  recommendedSize: { type: "string", description: "Must be one of the provided availableSizes." },
                  confidence: { type: "string", enum: ["low", "medium", "high"] },
                  reasoning: { type: "string" },
                  alternativeSize: { type: "string", description: "Optional second-best size, or empty." },
                },
                required: ["recommendedSize", "confidence", "reasoning"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "recommend_size" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const text = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${text}`);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : null;
    if (!args?.recommendedSize) throw new Error("AI did not return a size");

    // Ensure the recommended size is in the list
    let rec = args.recommendedSize;
    if (!availableSizes.includes(rec)) {
      const lower = rec.toString().toLowerCase();
      rec = availableSizes.find((s) => s.toLowerCase() === lower) ?? availableSizes[0];
    }

    return new Response(
      JSON.stringify({
        recommendedSize: rec,
        confidence: args.confidence ?? "medium",
        reasoning: args.reasoning ?? "",
        alternativeSize: args.alternativeSize ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-size-recommender error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
