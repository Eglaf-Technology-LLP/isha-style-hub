import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Product Value (Developer Corrections Part 7, 5.1): boutiques enter their
// Product Value EXCLUDING GST; the customer's price (MRP) = Product Value +
// GST at the category's HSN rate. The database works the real price out
// (price_with_gst, migration 20261024130000) - this is the same sum, for
// showing it while someone types.

export interface GstRule {
  gst_rate: number;
  price_limit: number | null;
  gst_rate_above_limit: number | null;
}

export function gstRateForValue(rule: GstRule | null | undefined, value: number): number {
  if (!rule) return 0;
  if (rule.price_limit == null || value <= Number(rule.price_limit)) return Number(rule.gst_rate);
  return Number(rule.gst_rate_above_limit ?? rule.gst_rate);
}

// GST rate for one piece sold at a GST-inclusive price, as the database's
// gst_rate_for: the band is decided on the value before GST at the lower rate.
export function gstRateForInclusive(rule: GstRule | null | undefined, unitPrice: number): number {
  if (!rule) return 0;
  const rate = Number(rule.gst_rate);
  if (rule.price_limit == null || unitPrice / (1 + rate / 100) <= Number(rule.price_limit)) return rate;
  return Number(rule.gst_rate_above_limit ?? rate);
}

// The GST inside a GST-inclusive line total, split the way the tax invoice
// splits it (invoice_line_amounts): taxable = round(total / (1 + rate)), GST
// = the rest.
export function gstInsideLine(rule: GstRule | null | undefined, lineTotal: number, quantity: number): number {
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) return 0;
  const rate = gstRateForInclusive(rule, lineTotal / Math.max(quantity, 1));
  const taxable = Math.round(Number(((lineTotal * 100) / (1 + rate / 100)).toFixed(4))) / 100;
  return Math.round((lineTotal - taxable) * 100) / 100;
}

export interface GstBreakdown {
  rate: number;
  gst: number;
  price: number;
}

// null for a missing / non-positive value.
export function gstBreakdown(rule: GstRule | null | undefined, value: number): GstBreakdown | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const rate = gstRateForValue(rule, value);
  // value x (100 + rate) is the price in paise; rounded like Postgres round(_, 2).
  const price = Math.round(Number((value * (100 + rate)).toFixed(4))) / 100;
  return { rate, gst: Math.round((price - value) * 100) / 100, price };
}

let cached: Promise<Map<string, GstRule | null>> | null = null;

function loadRules() {
  cached ??= Promise.resolve(
    supabase
      .from("categories")
      .select("id, hsn_codes(gst_rate, price_limit, gst_rate_above_limit)")
      .then(({ data }) => {
        const map = new Map<string, GstRule | null>();
        for (const c of (data ?? []) as { id: string; hsn_codes: GstRule | null }[]) map.set(c.id, c.hsn_codes ?? null);
        return map;
      }),
  );
  return cached;
}

// Each category's GST rule (null = no HSN code set for it yet).
export function useCategoryGstRules() {
  const [rules, setRules] = useState<Map<string, GstRule | null> | null>(null);
  useEffect(() => {
    let alive = true;
    loadRules().then((m) => alive && setRules(m));
    return () => {
      alive = false;
    };
  }, []);
  return {
    loading: rules === null,
    ruleFor: (categoryId: string | null | undefined): GstRule | null =>
      (categoryId && rules?.get(categoryId)) || null,
    hasRule: (categoryId: string | null | undefined) => !!(categoryId && rules?.get(categoryId)),
  };
}
