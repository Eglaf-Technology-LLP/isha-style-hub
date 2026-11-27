import { useCallback, useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { flashFocusedElement } from "@/hooks/useDeepLink";
import { formatDateTime } from "@/lib/dates";
import { PROBLEM_REPORT_COLUMNS, problemReasonLabel, type ProblemReport } from "@/lib/problemReport";

// Report a problem (src/lib/problemReport.ts), in the Returns tab: every
// report for the admins, who mark it resolved with a reply the customer
// sees; a boutique sees the reports about its own pieces (RLS), read-only.
// A bell opens this with ?problem=<id>.

type Filter = "open" | "resolved";

export function ProblemReportsPanel({ vendorId }: { vendorId?: string }) {
  const isAdmin = !vendorId;
  const [reports, setReports] = useState<ProblemReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [params] = useSearchParams();
  const location = useLocation();
  const focusId = params.get("problem");

  const load = useCallback(async () => {
    let query = supabase.from("problem_reports").select(PROBLEM_REPORT_COLUMNS).order("created_at", { ascending: false }).limit(200);
    if (vendorId) query = query.contains("vendor_ids", [vendorId]);
    const { data, error } = await query;
    if (error) {
      console.error("Error fetching problem reports:", error);
      toast.error("Couldn't load the problem reports");
    } else {
      setReports((data ?? []) as unknown as ProblemReport[]);
    }
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  // From a bell: show its list and bring it into view.
  useEffect(() => {
    if (!focusId || loading) return;
    const report = reports.find((r) => r.id === focusId);
    if (!report) return;
    setFilter(report.status);
    flashFocusedElement(report.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, location.key, loading]);

  const setStatus = async (report: ProblemReport, status: "open" | "resolved") => {
    const reply = (replies[report.id] ?? report.admin_note ?? "").trim();
    if (status === "resolved" && !reply) {
      toast.error("Write what was done - the customer sees this reply");
      return;
    }
    setSaving(report.id);
    const { error } = await supabase
      .from("problem_reports")
      .update(status === "resolved" ? { status, admin_note: reply } : { status })
      .eq("id", report.id);
    setSaving(null);
    if (error) {
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }
    toast.success(status === "resolved" ? `${report.ticket} marked resolved` : `${report.ticket} reopened`);
    load();
  };

  const counts = {
    open: reports.filter((r) => r.status === "open").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };
  const shown = reports.filter((r) => r.status === filter);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5" />
          Problem reports
          {counts.open > 0 && <Badge variant="destructive">{counts.open} open</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Damaged, wrong or missing pieces and measurements off by more than 1 inch, reported by customers within 24 hours
          of delivery with an unboxing video and photos.
          {isAdmin ? " Mark each one resolved with a reply - the customer sees it on their order." : " AllBoutiqs handles each one and will contact you."}
        </p>
        <div className="flex gap-2">
          {(["open", "resolved"] as Filter[]).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "open" ? "Open" : "Resolved"} ({counts[f]})
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {filter === "open" ? "No open problem reports." : "No resolved problem reports yet."}
          </p>
        ) : (
          shown.map((report) => {
            const items = vendorId ? report.items.filter((i) => i.vendor_id === vendorId) : report.items;
            return (
              <div key={report.id} data-focus-id={report.id} className="space-y-3 border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold">{report.ticket}</span>
                    <Badge variant="outline">{problemReasonLabel(report.reason)}</Badge>
                    <span className="text-muted-foreground">
                      Order #{report.order_id.slice(0, 8).toUpperCase()} · {formatDateTime(report.created_at)}
                    </span>
                  </div>
                  <Badge className={report.status === "resolved" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                    {report.status === "resolved" ? "Resolved" : "Open"}
                  </Badge>
                </div>

                <ul className="list-disc pl-5 text-sm">
                  {items.map((i) => (
                    <li key={i.order_item_id}>
                      {[i.product_title, i.size && `Size ${i.size}`, i.color, `Qty ${i.quantity}`].filter(Boolean).join(" · ")}
                    </li>
                  ))}
                </ul>

                <p className="whitespace-pre-wrap break-words bg-muted/40 p-3 text-sm">{report.note}</p>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,280px)_1fr]">
                  <video src={report.video_url} controls preload="metadata" className="max-h-56 w-full border border-border bg-black" />
                  <div className="flex flex-wrap content-start gap-2">
                    {report.photo_urls.map((url, n) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" title={`Photo ${n + 1}`}>
                        <img src={url} alt={`Photo ${n + 1}`} className="h-24 w-24 border border-border object-cover hover:opacity-80" />
                      </a>
                    ))}
                  </div>
                </div>

                {report.status === "resolved" && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Reply to the customer{report.resolved_at ? ` (${formatDateTime(report.resolved_at)})` : ""}: </span>
                    {report.admin_note}
                  </p>
                )}

                {isAdmin &&
                  (report.status === "open" ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        maxLength={2000}
                        placeholder="What was done (replacement sent, refund, ...) - the customer sees this"
                        value={replies[report.id] ?? ""}
                        onChange={(e) => setReplies((r) => ({ ...r, [report.id]: e.target.value }))}
                      />
                      <Button size="sm" onClick={() => setStatus(report, "resolved")} disabled={saving === report.id}>
                        {saving === report.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                        Mark resolved
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus(report, "open")} disabled={saving === report.id}>
                      <RotateCcw className="mr-1 h-4 w-4" />
                      Reopen
                    </Button>
                  ))}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
