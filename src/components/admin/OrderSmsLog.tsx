import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";

type SmsLog = { id: string; event: string; audience: string; phone: string; status: string; template_id: string | null; message_body: string | null; provider_message_id: string | null; provider_response: { status?: string } | string | null; error_message: string | null; created_at: string };

export function OrderSmsLog({ orderId }: { orderId: string }) {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await (supabase as any).from("order_sms_logs").select("id,event,audience,phone,status,template_id,message_body,provider_message_id,provider_response,error_message,created_at").eq("order_id", orderId).order("created_at", { ascending: false });
    setLogs((data ?? []) as SmsLog[]);
    setError(queryError?.message ?? null);
    setLoading(false);
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  return <section className="space-y-3">
    <div className="flex items-center justify-between">
      <h4 className="font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4" />SMS Log</h4>
      <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh SMS log"><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {loading ? <p className="text-sm text-muted-foreground">Loading SMS activity…</p>
      : error ? <p className="text-sm text-destructive">Could not load SMS log: {error}</p>
      : logs.length === 0 ? <p className="text-sm text-muted-foreground rounded-md bg-muted p-3">No SMS attempts recorded for this order.</p>
      : <div className="space-y-2">{logs.map((log) => <div key={log.id} className="rounded-md border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{log.event}</Badge><Badge variant="secondary">{log.audience}</Badge><Badge variant={log.status === "accepted" ? "default" : log.status === "failed" ? "destructive" : "outline"}>{log.status === "accepted" ? "accepted by Twilio" : log.status}</Badge><span className="text-muted-foreground">{log.phone || "No phone"}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(new Date(log.created_at))}{log.template_id ? ` · DLT template ${log.template_id}` : " · DLT template not configured"}{log.provider_message_id ? ` · Ref ${log.provider_message_id}` : ""}</p>
        {log.message_body && <p className="mt-1 rounded bg-muted p-2 text-xs">{log.message_body}</p>}
        {typeof log.provider_response === "object" && log.provider_response?.status && <p className="mt-1 text-xs text-muted-foreground">Twilio delivery status: {log.provider_response.status}</p>}
        {log.error_message && <p className="mt-1 text-xs text-destructive">{log.error_message}</p>}
      </div>)}</div>}
  </section>;
}
