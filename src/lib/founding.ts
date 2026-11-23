import { addDays, addMonths, format, parseISO } from "date-fns";

// Founding period: 0% marketplace commission for every Founding Boutique
// (vendors.is_founding) on orders placed between these IST dates, both days
// included (platform_settings.founding_from / founding_until: 29 Nov 2026 to
// 28 Jan 2027), then the normal commission. The same dates for every Founding
// Boutique, set by the system - no boutique has its own (client corrections
// Part 2, A15.1, 24 Nov 2026). Other boutiques pay the normal commission
// (A18.1). The same rule as effective_commission_pct() in the database.
export interface FoundingPeriod {
  from: string; // yyyy-MM-dd
  until: string; // yyyy-MM-dd, included
}

export interface CommissionVendor {
  is_founding: boolean;
}

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
export const nextDay = (day: string) => ymd(addDays(parseISO(day), 1));

// "2 months" from a start date, last day included: 29 Nov 2026 -> 28 Jan 2027.
export const twoMonthsFrom = (from: string) => ymd(addDays(addMonths(parseISO(from), 2), -1));

// The 0% periods that apply to a boutique: the founding period for a
// Founding Boutique, none for the others.
export function zeroCommissionPeriods(period: FoundingPeriod | null, vendor: CommissionVendor): FoundingPeriod[] {
  return vendor.is_founding && period ? [period] : [];
}

// Last day of the 0% run that includes `day` (periods back to back count
// as one), or null when `day` isn't in one.
export function zeroCommissionUntil(periods: FoundingPeriod[], day: string): string | null {
  let until: string | null = null;
  let probe = day;
  for (;;) {
    const ends = periods.filter((p) => p.from <= probe && probe <= p.until).map((p) => p.until);
    const furthest = ends.sort()[ends.length - 1];
    if (!furthest || (until && furthest <= until)) return until;
    until = furthest;
    probe = nextDay(until);
  }
}
