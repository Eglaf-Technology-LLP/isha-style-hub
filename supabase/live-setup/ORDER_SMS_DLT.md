# Order SMS (Twilio + DLT) setup

`send-order-sms` sends an SMS to the customer, the boutique and the AllBoutiqs admins when an order is placed, shipped, delivered, cancelled or returned. The database triggers have been live since 22 Nov 2026. Until the six secrets below are set, every attempt is logged as **failed** in Admin → Orders → Order Details → SMS Log. Orders themselves are never affected.

Indian law (TRAI DLT) requires three things before an SMS reaches a phone:
- The sender (AllBoutiqs' company) is registered on a DLT portal.
- The 6-letter sender name (header) is approved.
- Every message text (template) is approved word for word.

## The six secrets

Set them in Supabase Dashboard → project **allboutiqs-marketplace-live** → **Edge Functions** → **Secrets**. No redeploy is needed.

| Secret | Value | Where it comes from |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | `AC...` (34 characters) | Twilio Console → Account Dashboard → Account Info |
| `TWILIO_AUTH_TOKEN` | 32 characters | Same place, click to show or copy |
| `TWILIO_FROM` | The approved 6-letter header, e.g. `ALBTQS` | DLT portal → Header registration |
| `TWILIO_DLT_PE_ID` | 19-digit Principal Entity ID | DLT portal, after the company registration is approved |
| `TWILIO_DLT_TEMPLATES` | The JSON below, with the 15 template IDs filled in | DLT portal → Content templates, one ID per approved template |
| `SMS_ADMIN_PHONES` | Admin mobile numbers, comma-separated, e.g. `9876543210,9123456789` | AllBoutiqs |

## The 15 templates to register on DLT

Register each one as Content Template, type **Service Implicit**, linked to the approved header. Copy the text exactly; `{#var#}` is DLT's variable mark. Each variable may be up to 30 characters, and the function cuts longer values to 30. The texts use only plain characters ("Rs", not the rupee sign), so each SMS stays one plain-text message.

| # | Event | To | Text to register | Variables, in order |
|---|---|---|---|---|
| T01 | placed | customer | `Thank you for shopping at AllBoutiqs. Your order {#var#} for Rs {#var#} is confirmed. We will update you when it ships. - AllBoutiqs` | 1: order number, 2: order total in rupees |
| T02 | placed | boutique | `New AllBoutiqs order {#var#}: {#var#}, size {#var#}. Please accept it and ship by {#var#}. - AllBoutiqs` | 1: order number, 2: product name (first 30 letters), 3: size, 4: ship-by date |
| T03 | placed | admin | `Admin update: new order {#var#} received on AllBoutiqs for Rs {#var#}. - AllBoutiqs` | 1: order number, 2: order total in rupees |
| T04 | shipped | customer | `Your AllBoutiqs order {#var#} has been shipped and is on its way. - AllBoutiqs` | 1: order number |
| T05 | shipped | boutique | `AllBoutiqs order {#var#} has been shipped. Please check your boutique dashboard for details. - AllBoutiqs` | 1: order number |
| T06 | shipped | admin | `Admin update: order {#var#} has been shipped. - AllBoutiqs` | 1: order number |
| T07 | delivered | customer | `Your AllBoutiqs order {#var#} has been delivered. We hope you love it. - AllBoutiqs` | 1: order number |
| T08 | delivered | boutique | `AllBoutiqs order {#var#} has been delivered to the customer. - AllBoutiqs` | 1: order number |
| T09 | delivered | admin | `Admin update: order {#var#} has been delivered. - AllBoutiqs` | 1: order number |
| T10 | cancelled | customer | `Your AllBoutiqs order {#var#} has been cancelled. Any refund due will be processed as per our policy. - AllBoutiqs` | 1: order number |
| T11 | cancelled | boutique | `AllBoutiqs order {#var#} has been cancelled. Please check your boutique dashboard for details. - AllBoutiqs` | 1: order number |
| T12 | cancelled | admin | `Admin update: order {#var#} has been cancelled. - AllBoutiqs` | 1: order number |
| T13 | return | customer | `Update on the return for your AllBoutiqs order {#var#}. Please check your account for details. - AllBoutiqs` | 1: order number |
| T14 | return | boutique | `Return update for AllBoutiqs order {#var#}. Please check your boutique dashboard for details. - AllBoutiqs` | 1: order number |
| T15 | return | admin | `Admin update: return for order {#var#}. - AllBoutiqs` | 1: order number |

## TWILIO_DLT_TEMPLATES

Replace each `Txx_TEMPLATE_ID` with the 19-digit ID DLT gave that template. Do not change anything else: the `body` must stay the approved text, with `{{1}}`, `{{2}}`... in place of each `{#var#}`. Paste the whole line as the secret's value.

```
{"placed":{"customer":{"id":"T01_TEMPLATE_ID","body":"Thank you for shopping at AllBoutiqs. Your order {{1}} for Rs {{2}} is confirmed. We will update you when it ships. - AllBoutiqs"},"boutique":{"id":"T02_TEMPLATE_ID","body":"New AllBoutiqs order {{1}}: {{2}}, size {{3}}. Please accept it and ship by {{4}}. - AllBoutiqs"},"admin":{"id":"T03_TEMPLATE_ID","body":"Admin update: new order {{1}} received on AllBoutiqs for Rs {{2}}. - AllBoutiqs"}},"shipped":{"customer":{"id":"T04_TEMPLATE_ID","body":"Your AllBoutiqs order {{1}} has been shipped and is on its way. - AllBoutiqs"},"boutique":{"id":"T05_TEMPLATE_ID","body":"AllBoutiqs order {{1}} has been shipped. Please check your boutique dashboard for details. - AllBoutiqs"},"admin":{"id":"T06_TEMPLATE_ID","body":"Admin update: order {{1}} has been shipped. - AllBoutiqs"}},"delivered":{"customer":{"id":"T07_TEMPLATE_ID","body":"Your AllBoutiqs order {{1}} has been delivered. We hope you love it. - AllBoutiqs"},"boutique":{"id":"T08_TEMPLATE_ID","body":"AllBoutiqs order {{1}} has been delivered to the customer. - AllBoutiqs"},"admin":{"id":"T09_TEMPLATE_ID","body":"Admin update: order {{1}} has been delivered. - AllBoutiqs"}},"cancelled":{"customer":{"id":"T10_TEMPLATE_ID","body":"Your AllBoutiqs order {{1}} has been cancelled. Any refund due will be processed as per our policy. - AllBoutiqs"},"boutique":{"id":"T11_TEMPLATE_ID","body":"AllBoutiqs order {{1}} has been cancelled. Please check your boutique dashboard for details. - AllBoutiqs"},"admin":{"id":"T12_TEMPLATE_ID","body":"Admin update: order {{1}} has been cancelled. - AllBoutiqs"}},"return":{"customer":{"id":"T13_TEMPLATE_ID","body":"Update on the return for your AllBoutiqs order {{1}}. Please check your account for details. - AllBoutiqs"},"boutique":{"id":"T14_TEMPLATE_ID","body":"Return update for AllBoutiqs order {{1}}. Please check your boutique dashboard for details. - AllBoutiqs"},"admin":{"id":"T15_TEMPLATE_ID","body":"Admin update: return for order {{1}}. - AllBoutiqs"}}}
```

Or send the 15 IDs (they are not secret) to the developer, who will build this value.

## Test

1. Place a COD order on the site with your own mobile number.
2. Open Admin → Orders → that order → **SMS Log**. Each row shows **accepted**, or **failed** with Twilio's or DLT's reason.
