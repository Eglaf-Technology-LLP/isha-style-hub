import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CandidateProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_id: string | null;
  category_name?: string | null;
  tags: string[] | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productId } = await req.json();
    if (!productId || typeof productId !== "string") {
      return new Response(JSON.stringify({ error: "productId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch source product
    const { data: source, error: srcErr } = await supabase
      .from("products")
      .select("id,name,description,price,category_id,tags")
      .eq("id", productId)
      .single();
    if (srcErr || !source) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch candidate products (active, in stock, exclude self)
    const { data: candidatesRaw } = await supabase
      .from("products")
      .select("id,name,description,price,category_id,tags,stock_quantity")
      .eq("is_active", true)
      .neq("id", productId)
      .gt("stock_quantity", 0)
      .limit(60);

    const candidates: CandidateProduct[] = (candidatesRaw || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: (p.description || "").slice(0, 140),
      price: Number(p.price),
      category_id: p.category_id,
      tags: (p.tags as string[] | null) || [],
    }));

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ productIds: [], reason: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get category names map for richer context
    const catIds = Array.from(
      new Set(
        [source.category_id, ...candidates.map((c) => c.category_id)].filter(
          Boolean,
        ),
      ),
    ) as string[];
    const { data: cats } = await supabase
      .from("categories")
      .select("id,name")
      .in("id", catIds.length ? catIds : ["00000000-0000-0000-0000-000000000000"]);
    const catMap = new Map((cats || []).map((c) => [c.id, c.name]));

    const sourceText = `MAIN ITEM: ${source.name} | Category: ${
      catMap.get(source.category_id as string) || "Unknown"
    } | Price: ₹${source.price} | Tags: ${(source.tags || []).join(", ")} | ${
      source.description || ""
    }`.slice(0, 500);

    const candidateText = candidates
      .map(
        (c) =>
          `${c.id} :: ${c.name} | Cat:${
            catMap.get(c.category_id || "") || "?"
          } | ₹${c.price} | tags:${(c.tags || []).join(",")}`,
      )
      .join("\n");

    const systemPrompt =
      "You are a professional fashion stylist for an Indian fashion store. Given a main clothing item, select 3-4 complementary products from the candidate list that would COMPLETE THE LOOK (e.g., pair a top with bottoms/accessories, a dress with a jacket/bag, etc.). Prefer items from DIFFERENT categories than the main item. Return only product IDs from the candidates.";

    const userPrompt = `${sourceText}\n\nCANDIDATES:\n${candidateText}\n\nPick 3-4 IDs that best complete this outfit and give a short stylist note.`;

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
                name: "complete_the_look",
                description: "Return complementary product IDs",
                parameters: {
                  type: "object",
                  properties: {
                    productIds: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-4 product IDs from candidates",
                    },
                    stylistNote: {
                      type: "string",
                      description: "Short styling tip (1-2 sentences)",
                    },
                  },
                  required: ["productIds", "stylistNote"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "complete_the_look" },
          },
        }),
      },
    );

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits in Settings." }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ productIds: [], stylistNote: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments);
    const validIds = new Set(candidates.map((c) => c.id));
    const productIds: string[] = (args.productIds || [])
      .filter((id: string) => validIds.has(id))
      .slice(0, 4);

    return new Response(
      JSON.stringify({
        productIds,
        stylistNote: args.stylistNote || "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("complete-the-look error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
