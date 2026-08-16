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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = [
      `Create a photorealistic virtual try-on image.`,
      `The FIRST image is the customer's photo. The SECOND image is a fashion product: "${productName || "garment"}".`,
      `Dress the person from the first image in the garment from the second image.`,
      `Preserve the person's face, skin tone, body shape, hair and the original background exactly.`,
      `Match the garment's colour, print, fabric texture and silhouette faithfully.`,
      `Realistic draping, natural lighting and shadows. Full-body framing if possible.`,
      notes ? `Extra guidance: ${notes}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: personImage } },
              { type: "image_url", image_url: { url: productImageUrl } },
            ],
          },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Too many try-ons right now. Please retry in a minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Please top up workspace credits." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
    const message = aiData?.choices?.[0]?.message;
    const imageUrl: string | undefined =
      message?.images?.[0]?.image_url?.url ?? undefined;

    if (!imageUrl) {
      console.error("No image returned", JSON.stringify(aiData).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Could not generate try-on image. Try another photo." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ imageUrl, note: message?.content || "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("virtual-try-on error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
