import { Badge } from "@/components/ui/badge";

const STATUS: Record<string, { label: string; className: string }> = {
  not_setup: { label: "Not set up", className: "bg-red-100 text-red-800 hover:bg-red-100" },
  pending: {
    label: "Submitted - confirmed after your first successful transfer",
    className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  },
  active: { label: "Verified - transfers reaching your bank", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  needs_update: { label: "Needs update - bank declined the last transfer", className: "bg-red-100 text-red-800 hover:bg-red-100" },
  disabled: { label: "Payouts paused by AllBoutiqs", className: "bg-muted text-muted-foreground hover:bg-muted" },
};

export function PayoutAccountStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.not_setup;
  return <Badge className={s.className}>{s.label}</Badge>;
}
