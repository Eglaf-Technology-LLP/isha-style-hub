import nodemailer from "npm:nodemailer@^9";

// Every email in this app now goes out through this one function, over
// real SMTP (Zoho) - the previous per-function Resend-based sendEmail()
// (copy-pasted across send-order-email, send-return-status-email, etc.)
// never actually sent anything, since RESEND_API_KEY was never set on
// this project. Same silent-skip-if-unconfigured behavior is preserved
// here so a missing secret degrades gracefully instead of throwing.
//
// Deliberately port 465 (implicit TLS), not 587 - Supabase Edge Functions
// run on Deno Deploy, which blocks outbound connections to ports 25 and
// 587 entirely (confirmed against Supabase's own official send-email-smtp
// example and a since-closed platform issue); 465 is the one that
// actually works, and it's Zoho's standard alternate secure port anyway.
// nodemailer (via Deno's npm: specifier), not a Deno-native SMTP client -
// this matches Supabase's own official example verbatim, the most
// proven-reliable option on this specific runtime.
export async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; skipped?: boolean }> {
  const host = Deno.env.get("SMTP_HOST");
  const port = Deno.env.get("SMTP_PORT");
  const username = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || username;

  if (!host || !port || !username || !password) {
    console.log("SMTP not configured, skipping email send");
    return { success: true, skipped: true };
  }

  const transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user: username, pass: password },
  });

  await transport.sendMail({
    from: `AllBoutiqs <${fromEmail}>`,
    to,
    subject,
    html,
  });
  return { success: true };
}

// Shared visual wrapper so every email in the app looks like it came from
// the same place - the site's own maroon accent (hsl(11 54% 32%), the
// --primary token in src/index.css), a serif heading echoing the
// Playfair Display wordmark, safe email-client font fallbacks throughout
// (no web fonts - most mail clients strip them). `preheader` is the
// hidden inbox-preview snippet; `ctaLabel`/`ctaUrl` render an optional
// button.
export function emailTemplate({
  preheader,
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
}: {
  preheader?: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const siteUrl = "https://allboutiqs.com";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4efe9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4efe9; padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr>
<td style="background-color:#7a2e22; padding:28px 32px; text-align:center;">
<span style="font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:700; color:#ffffff; letter-spacing:0.02em;">AllBoutiqs</span>
</td>
</tr>
<tr>
<td style="padding:36px 32px 8px;">
<h1 style="margin:0 0 16px; font-family:Georgia,'Times New Roman',serif; font-size:22px; line-height:1.3; color:#1a1a1a; font-weight:700;">${heading}</h1>
<div style="font-size:15px; line-height:1.6; color:#3a3a3a;">
${bodyHtml}
</div>
${
  ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="border-radius:8px; background-color:#7a2e22;"><a href="${ctaUrl}" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">${ctaLabel}</a></td></tr></table>`
    : ""
}
</td>
</tr>
<tr>
<td style="padding:24px 32px 32px;">
<hr style="border:none; border-top:1px solid #ececec; margin:0 0 20px;" />
<p style="margin:0 0 6px; font-size:12px; color:#8a8a8a;">AllBoutiqs — India's Trusted Boutiques on One Marketplace</p>
<p style="margin:0; font-size:12px; color:#8a8a8a;">
<a href="${siteUrl}" style="color:#7a2e22; text-decoration:none;">Visit AllBoutiqs</a>
&nbsp;·&nbsp;
<a href="${siteUrl}/orders" style="color:#7a2e22; text-decoration:none;">My Orders</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
