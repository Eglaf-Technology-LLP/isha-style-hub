import { parseBoolean, parseNumberOrNull } from "@/lib/excelImportExport";

export const GIFT_CARD_COLUMNS = {
  giftCardId: "Gift Card ID",
  code: "Code",
  initialBalance: "Initial Balance",
  currentBalance: "Current Balance",
  recipientName: "Recipient Name",
  recipientEmail: "Recipient Email",
  message: "Message",
  isActive: "Active (TRUE/FALSE)",
  expiresAt: "Expires On (YYYY-MM-DD)",
} as const;

export interface GiftCardImportRow {
  giftCardId: string | null;
  code: string;
  initial_balance: number;
  current_balance: number;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  is_active: boolean;
  expires_at: string | null;
}

export interface GiftCardRowError {
  rowNumber: number;
  message: string;
}

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function parseGiftCardRows(
  rows: Record<string, string>[],
): { rows: GiftCardImportRow[]; errors: GiftCardRowError[] } {
  const errors: GiftCardRowError[] = [];
  const parsed: GiftCardImportRow[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const initialBalance = parseNumberOrNull(row[GIFT_CARD_COLUMNS.initialBalance]);
    if (initialBalance === null || initialBalance <= 0) {
      errors.push({ rowNumber, message: "Initial Balance must be a positive number" });
      return;
    }
    const currentBalance = parseNumberOrNull(row[GIFT_CARD_COLUMNS.currentBalance]);
    const expiresRaw = row[GIFT_CARD_COLUMNS.expiresAt]?.trim();

    parsed.push({
      giftCardId: row[GIFT_CARD_COLUMNS.giftCardId]?.trim() || null,
      code: row[GIFT_CARD_COLUMNS.code]?.trim() || generateCode(),
      initial_balance: initialBalance,
      current_balance: currentBalance ?? initialBalance,
      recipient_name: row[GIFT_CARD_COLUMNS.recipientName]?.trim() || null,
      recipient_email: row[GIFT_CARD_COLUMNS.recipientEmail]?.trim() || null,
      message: row[GIFT_CARD_COLUMNS.message]?.trim() || null,
      is_active: parseBoolean(row[GIFT_CARD_COLUMNS.isActive], true),
      expires_at: expiresRaw || null,
    });
  });

  return { rows: parsed, errors };
}

export function giftCardsToRows(
  cards: {
    id: string;
    code: string;
    initial_balance: number;
    current_balance: number;
    recipient_name: string | null;
    recipient_email: string | null;
    message: string | null;
    is_active: boolean;
    expires_at: string | null;
  }[],
): Record<string, string>[] {
  return cards.map((c) => ({
    [GIFT_CARD_COLUMNS.giftCardId]: c.id,
    [GIFT_CARD_COLUMNS.code]: c.code,
    [GIFT_CARD_COLUMNS.initialBalance]: String(c.initial_balance),
    [GIFT_CARD_COLUMNS.currentBalance]: String(c.current_balance),
    [GIFT_CARD_COLUMNS.recipientName]: c.recipient_name ?? "",
    [GIFT_CARD_COLUMNS.recipientEmail]: c.recipient_email ?? "",
    [GIFT_CARD_COLUMNS.message]: c.message ?? "",
    [GIFT_CARD_COLUMNS.isActive]: c.is_active ? "TRUE" : "FALSE",
    [GIFT_CARD_COLUMNS.expiresAt]: c.expires_at ? c.expires_at.slice(0, 10) : "",
  }));
}

export function sampleGiftCardTemplateRows(): Record<string, string>[] {
  return [
    {
      [GIFT_CARD_COLUMNS.giftCardId]: "",
      [GIFT_CARD_COLUMNS.code]: "",
      [GIFT_CARD_COLUMNS.initialBalance]: "1000",
      [GIFT_CARD_COLUMNS.currentBalance]: "1000",
      [GIFT_CARD_COLUMNS.recipientName]: "Priya Sharma",
      [GIFT_CARD_COLUMNS.recipientEmail]: "priya@example.com",
      [GIFT_CARD_COLUMNS.message]: "Happy Birthday!",
      [GIFT_CARD_COLUMNS.isActive]: "TRUE",
      [GIFT_CARD_COLUMNS.expiresAt]: "",
    },
  ];
}
