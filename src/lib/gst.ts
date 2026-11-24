import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// GST inside our GST-inclusive prices - the website's src/lib/gst.ts, for
// screens outside checkout (My orders' product value / GST split). Same sums
// as the database's gst_rate_for and invoice_line_amounts.

// A category's GST rule (its HSN code): the rate, and a higher rate above a
// price limit (e.g. clothing: 5% up to Rs 2,500 a piece, 18% above).
export interface GstRule {
  gst_rate: number;
  price_limit: number | null;
  gst_rate_above_limit: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// GST rate for one piece sold at a GST-inclusive price, as the database's
// gst_rate_for: the band is decided on the value before GST at the lower rate.
export function gstRateForInclusive(
  rule: GstRule | null | undefined,
  unitPrice: number,
): number {
  if (!rule) return 0;
  const rate = Number(rule.gst_rate);
  if (
    rule.price_limit == null ||
    unitPrice / (1 + rate / 100) <= Number(rule.price_limit)
  )
    return rate;
  return Number(rule.gst_rate_above_limit ?? rate);
}

// The GST inside a GST-inclusive line total, split the way the tax invoice
// splits it (invoice_line_amounts): taxable = round(total / (1 + rate)), GST
// = the rest.
export function gstInsideLine(
  rule: GstRule | null | undefined,
  lineTotal: number,
  quantity: number,
): number {
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) return 0;
  const rate = gstRateForInclusive(rule, lineTotal / Math.max(quantity, 1));
  const taxable =
    Math.round(Number(((lineTotal * 100) / (1 + rate / 100)).toFixed(4))) / 100;
  return round2(lineTotal - taxable);
}

// Each category's GST rule (null = no HSN code set for it yet).
export function useCategoryGstRules() {
  return useQuery({
    queryKey: ['category-gst-rules'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, hsn_codes(gst_rate, price_limit, gst_rate_above_limit)');
      if (error) throw error;
      const map = new Map<string, GstRule | null>();
      for (const c of (data ?? []) as any[])
        map.set(
          c.id as string,
          (Array.isArray(c.hsn_codes) ? c.hsn_codes[0] : c.hsn_codes) ?? null,
        );
      return map;
    },
  });
}
