import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// deno-lint-ignore no-explicit-any
type JsonSchema = Record<string, any>;

interface FunctionCallOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  functionName: string;
  functionDescription: string;
  parameters: JsonSchema;
}

// Calls Gemini with a single forced function call and returns its parsed args.
export async function geminiFunctionCall({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  functionName,
  functionDescription,
  parameters,
// deno-lint-ignore no-explicit-any
}: FunctionCallOptions): Promise<Record<string, any>> {
  const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      tools: [
        {
          functionDeclarations: [
            { name: functionName, description: functionDescription, parameters },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: { mode: "ANY", allowedFunctionNames: [functionName] },
      },
    }),
  });

  await throwOnBadStatus(res);

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  // deno-lint-ignore no-explicit-any
  const call = parts.find((p: any) => p.functionCall)?.functionCall;
  return call?.args ?? {};
}

interface ImageInput {
  url: string;
}

interface ImageEditOptions {
  apiKey: string;
  model: string;
  prompt: string;
  images: ImageInput[];
}

interface ImageEditResult {
  imageUrl?: string;
  text?: string;
}

// Calls Gemini's image-capable model with a text prompt plus one or more
// reference images, returning a generated image (as a data URL) and/or text.
export async function geminiImageEdit({
  apiKey,
  model,
  prompt,
  images,
}: ImageEditOptions): Promise<ImageEditResult> {
  const imageParts = await Promise.all(images.map((img) => toInlineDataPart(img.url)));

  const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: prompt }, ...imageParts] },
      ],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });

  await throwOnBadStatus(res);

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];

  let imageUrl: string | undefined;
  let text: string | undefined;
  // deno-lint-ignore no-explicit-any
  for (const part of parts) {
    if (part.inlineData?.data) {
      imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
    } else if (typeof part.text === "string") {
      text = part.text;
    }
  }

  return { imageUrl, text };
}

async function toInlineDataPart(urlOrDataUri: string) {
  if (urlOrDataUri.startsWith("data:")) {
    const [header, data] = urlOrDataUri.split(",", 2);
    const mimeType = header.slice(5, header.indexOf(";")) || "image/jpeg";
    return { inlineData: { mimeType, data } };
  }

  const res = await fetch(urlOrDataUri);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { inlineData: { mimeType, data: encodeBase64(bytes) } };
}

async function throwOnBadStatus(res: Response) {
  if (res.status === 429) {
    throw new GeminiError(429, "Rate limit exceeded, please try again later.");
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("Gemini API error", res.status, t);
    throw new GeminiError(500, "AI provider error");
  }
}
