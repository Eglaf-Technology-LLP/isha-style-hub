// payout_eligible_on is an Indian calendar date ("YYYY-MM-DD").
export const formatPayoutDate = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

export const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
