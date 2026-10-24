import { formatDate } from "@/lib/dates";
// payout_eligible_on is an Indian calendar date ("YYYY-MM-DD").
export const formatPayoutDate = (d: string) => formatDate(d);

export const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
