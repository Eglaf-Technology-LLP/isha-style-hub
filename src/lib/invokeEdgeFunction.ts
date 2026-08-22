import { supabase } from "@/integrations/supabase/client";

// supabase-js turns a non-2xx edge function response into a generic
// FunctionsHttpError with no parsed body - this recovers the real
// {error: "..."} message our functions return so the UI can show it
// instead of a useless "Edge Function returned a non-2xx status code".
export async function invokeEdgeFunction<T = any>(
  name: string,
  body: unknown,
): Promise<{ data: T | null; errorMessage: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let message = error.message || "Request failed";
    const context = (error as any).context;
    if (context && typeof context.json === "function") {
      try {
        const parsed = await context.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // no parseable body - keep the generic message
      }
    }
    return { data: null, errorMessage: message };
  }

  if (data && typeof data === "object" && "error" in data && data.error) {
    return { data: null, errorMessage: String(data.error) };
  }

  return { data, errorMessage: null };
}
