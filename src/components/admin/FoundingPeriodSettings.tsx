import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFoundingPeriod } from "@/hooks/useFoundingPeriod";
import { twoMonthsFrom } from "@/lib/founding";
import { formatDate } from "@/lib/dates";

// Admin: the founding period - 0% marketplace commission for every boutique
// on orders placed between these dates (IST, both included). Orders keep
// being worked out from their own date, so a period that has started keeps
// its start date, and its end can't be moved into the past.
export function FoundingPeriodSettings({ today }: { today: string }) {
  const { period, launchDate, loading, refetch } = useFoundingPeriod();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFrom(period?.from ?? "");
    setUntil(period?.until ?? "");
  }, [period]);

  const started = !!period && period.from <= today;
  const changed = from !== (period?.from ?? "") || until !== (period?.until ?? "");

  const save = async () => {
    if (!from || !until) return toast.error("Choose the first and the last day of the founding period");
    if (until < from) return toast.error("The last day must be on or after the first day");
    if (!started && from < today) return toast.error("The founding period can't start in the past");
    if (until < today) return toast.error("The last day can't be in the past");
    setSaving(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({ founding_from: from, founding_until: until })
      .eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Founding period saved: 0% commission from ${formatDate(from)} to ${formatDate(until)}`);
    refetch();
  };

  return (
    <div className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50/40 p-4 dark:border-amber-500/30 dark:bg-amber-500/5">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-amber-500" /> Founding period · every boutique
        </p>
        <p className="text-sm text-muted-foreground">
          {loading
            ? "..."
            : period
              ? `0% marketplace commission on orders placed from ${formatDate(period.from)} to ${formatDate(period.until)} (both days included). After it, the commission below applies. Other charges still apply.`
              : "Not set. Orders pay the commission below."}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="founding-period-from">First day</Label>
          <Input
            id="founding-period-from"
            type="date"
            value={from}
            min={started ? undefined : today}
            disabled={started}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="founding-period-until">Last day (included)</Label>
          <Input
            id="founding-period-until"
            type="date"
            value={until}
            min={from && from > today ? from : today}
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
        {/* 3.4.3: fills both dates from the launch date (29 Nov -> 28 Jan). Once
            the period has started its first day stays as it is. */}
        <Button
          type="button"
          variant="outline"
          disabled={!launchDate || started}
          title={launchDate ? `Launch: ${formatDate(launchDate)}` : "No launch date set"}
          onClick={() => {
            if (!launchDate) return;
            setFrom(launchDate);
            setUntil(twoMonthsFrom(launchDate));
          }}
        >
          2 months from launch
        </Button>
        <Button type="button" onClick={save} disabled={saving || !changed}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
      {started && (
        <p className="text-xs text-muted-foreground">
          The period has started, so its first day stays {formatDate(period!.from)}.
        </p>
      )}
    </div>
  );
}
