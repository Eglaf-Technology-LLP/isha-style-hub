export type SmsEvent = "placed" | "shipped" | "delivered" | "cancelled" | "return";
export type SmsAudience = "customer" | "boutique" | "admin";

const EVENT_ENV: Record<SmsEvent, string> = {
  placed: "SMS_DLT_PLACED",
  shipped: "SMS_DLT_SHIPPED",
  delivered: "SMS_DLT_DELIVERED",
  cancelled: "SMS_DLT_CANCELLED",
  return: "SMS_DLT_RETURN",
};

export function smsTemplateId(event: SmsEvent, audience: SmsAudience): string | null {
  return Deno.env.get(`${EVENT_ENV[event]}_${audience.toUpperCase()}_TEMPLATE_ID`) ?? null;
}

export function normalizeIndianPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

export async function sendDltSms(templateId: string, phone: string, variables: string[]) {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  if (!authKey) throw new Error("MSG91_AUTH_KEY is not configured");
  const payload = {
    template_id: templateId,
    realTimeResponse: "1",
    recipients: [{ mobiles: phone, ...Object.fromEntries(variables.map((value, i) => [`VAR${i + 1}`, value])) }],
  };
  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { accept: "application/json", authkey: authKey, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`MSG91 returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { parsed = body; }
  return { provider: "MSG91", response: parsed };
}
