export type SmsEvent = "placed" | "shipped" | "delivered" | "cancelled" | "return";
export type SmsAudience = "customer" | "boutique" | "admin";

export interface TwilioDltTemplate {
  id: string;
  body: string;
}

export function getDltTemplate(event: SmsEvent, audience: SmsAudience): TwilioDltTemplate | null {
  const raw = Deno.env.get("TWILIO_DLT_TEMPLATES");
  if (!raw) return null;
  try {
    const templates = JSON.parse(raw) as Partial<Record<SmsEvent, Partial<Record<SmsAudience, TwilioDltTemplate>>>>;
    const template = templates[event]?.[audience];
    return template?.id?.trim() && template.body?.trim() ? template : null;
  } catch {
    throw new Error("TWILIO_DLT_TEMPLATES must be valid JSON");
  }
}

const DLT_VARIABLE_MAX = 30;

export function renderDltBody(templateBody: string, variables: string[]): string {
  const placeholders = [...templateBody.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  const indexes = new Set(placeholders);
  if (indexes.size !== variables.length || variables.some((_, index) => !indexes.has(index + 1))) {
    throw new Error(`DLT template must contain placeholders {{1}} through {{${variables.length}}}`);
  }
  // DLT refuses a message whose {#var#} value is longer than 30 characters,
  // and a product name easily is ("Hand Embroidered Silk Lehenga Set").
  return templateBody.replace(/\{\{(\d+)\}\}/g, (_match, index: string) => variables[Number(index) - 1].trim().slice(0, DLT_VARIABLE_MAX).trimEnd());
}

export function normalizeIndianPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

export async function sendTwilioDltSms(templateId: string, phone: string, body: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  const peId = Deno.env.get("TWILIO_DLT_PE_ID");
  if (!accountSid || !authToken || !from || !peId) {
    throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, and TWILIO_DLT_PE_ID must be configured");
  }

  const form = new URLSearchParams({
    To: phone,
    From: from,
    Body: body,
    DltPEId: peId,
    DltTemplateId: templateId,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const text = await response.text();
  let parsed: { sid?: string; status?: string; code?: number; message?: string } | string;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!response.ok) {
    const error = parsed as { code?: number; message?: string };
    throw new Error(`Twilio ${error.code ?? response.status}: ${error.message ?? text.slice(0, 500)}`);
  }
  return { provider: "Twilio", response: parsed };
}
