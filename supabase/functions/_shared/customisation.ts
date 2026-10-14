// A customised order line's snapshot (order_items.customisation) for
// invoices and emails - mirrors src/lib/customisation.ts.

const LABELS: Record<string, string> = {
  bust: "Bust",
  waist: "Waist",
  hip: "Hip",
  shoulder: "Shoulder",
  sleeve_length: "Sleeve length",
  armhole: "Armhole",
  length: "Top / dress length",
  bottom_length: "Bottom length",
};

export function customisationSummary(c: any): string {
  if (!c) return "";
  const parts = [c.custom_size ? "Custom size" : null, ...((c.options ?? []) as any[]).map((o) => String(o.label))].filter(Boolean);
  return parts.join(", ") || "Customised";
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

// Everything the boutique needs to make the piece.
export function customisationHtml(c: any): string {
  if (!c) return "";
  const rows: string[] = [];
  if (c.custom_size) {
    const m = Object.entries(c.custom_size.measurements ?? {})
      .map(([k, v]) => `${esc(LABELS[k] ?? k)} ${esc(v)}"`)
      .join(" · ");
    rows.push(`Custom size: ${m}`);
  }
  for (const o of c.options ?? []) rows.push(esc(o.label));
  if (c.note) rows.push(`Note: ${esc(c.note)}`);
  if (c.photo_path) rows.push("Reference photo: open the order in your dashboard");
  return `<div style="margin:4px 0 0 0; padding:8px 10px; background:#fbf3f4; border-radius:6px; color:#5a5a5a; font-size:13px;"><strong style="color:#1a1a1a;">Customised</strong><br>${rows.join("<br>")}</div>`;
}
