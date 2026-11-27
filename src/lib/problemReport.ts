// Report a problem (client, 27 Nov 2026). Damage or a wrong item found after
// delivery is not a cancellation: for 24 hours from delivery My Orders shows
// "Report a problem" (unboxing video + photos compulsory, a reason and a
// note). The customer gets a ticket number by email; the admins and the
// boutique get a bell + email at once. After 24 hours the button hides, and
// no late case is taken (the user's decision, 27 Nov 2026).
//
// supabase/functions/report-order-problem checks the same numbers and keeps
// the same reason keys.

export const PROBLEM_REPORT_WINDOW_HOURS = 24;
export const PROBLEM_NOTE_MIN = 10;
export const PROBLEM_NOTE_MAX = 2000;
export const PROBLEM_MIN_PHOTOS = 1;
export const PROBLEM_MAX_PHOTOS = 6;
// Under the customer's own folder in the uploads bucket (uploadUserFile).
export const PROBLEM_EVIDENCE_FOLDER = "problem-reports";

export type ProblemReason = "damaged" | "wrong_item" | "missing_item" | "measurement_off" | "other";

export const PROBLEM_REASONS: { value: ProblemReason; label: string }[] = [
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "missing_item", label: "Missing item" },
  { value: "measurement_off", label: "Measurement more than 1 inch off" },
  { value: "other", label: "Other" },
];

export const problemReasonLabel = (reason: string) => PROBLEM_REASONS.find((r) => r.value === reason)?.label ?? reason;

// Client wording (27 Nov 2026): shown at checkout, in the "Delivered" email
// and bell (customer_delivered_notice in the migration
// 20261127100000_problem_reports), on the warehouse packing slip and on My
// Orders.
export const UNBOXING_RULE =
  "Please open your parcel within 24 hours of delivery and record an unboxing video – report any problem in My orders › Report a problem.";

// The moment a delivered part's Report a problem closes.
export function problemReportDeadline(deliveredAt: string | null | undefined): number | null {
  if (!deliveredAt) return null;
  return new Date(deliveredAt).getTime() + PROBLEM_REPORT_WINDOW_HOURS * 3_600_000;
}

export interface ProblemReport {
  id: string;
  ticket: string;
  order_id: string;
  items: {
    order_item_id: string;
    vendor_order_id: string;
    vendor_id: string | null;
    product_title: string;
    size: string | null;
    color: string | null;
    quantity: number;
  }[];
  vendor_ids: string[];
  reason: ProblemReason;
  note: string;
  video_url: string;
  photo_urls: string[];
  status: "open" | "resolved";
  admin_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

export const PROBLEM_REPORT_COLUMNS =
  "id, ticket, order_id, items, vendor_ids, reason, note, video_url, photo_urls, status, admin_note, resolved_at, created_at";
