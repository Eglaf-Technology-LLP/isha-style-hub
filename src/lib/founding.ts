import { addDays, addMonths, format, parseISO } from "date-fns";

// Founding period (client corrections, 15 Nov 2026, 1.6.2): 0% marketplace
// commission for every boutique on orders placed between these IST dates,
// both days included (platform_settings.founding_from / founding_until).
// The same rule as effective_commission_pct() in the database.
export interface FoundingPeriod {
  from: string; // yyyy-MM-dd
  until: string; // yyyy-MM-dd, included
}

export interface CommissionVendor {
  commission_rate: number | null;
  is_founding: boolean;
  founding_from: string | null;
  founding_until: string | null;
}

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
export const nextDay = (day: string) => ymd(addDays(parseISO(day), 1));

// "2 months" from a start date, last day included: 29 Nov 2026 -> 28 Jan 2027.
export const twoMonthsFrom = (from: string) => ymd(addDays(addMonths(parseISO(from), 2), -1));

// The 0% periods that apply to a boutique: everyone's, and its own extra
// one (only when both its dates are set; is_founding alone is the badge).
export function zeroCommissionPeriods(period: FoundingPeriod | null, vendor: CommissionVendor): FoundingPeriod[] {
  const own =
    vendor.is_founding && vendor.founding_from && vendor.founding_until
      ? { from: vendor.founding_from, until: vendor.founding_until }
      : null;
  return [period, own].filter((p): p is FoundingPeriod => !!p);
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
