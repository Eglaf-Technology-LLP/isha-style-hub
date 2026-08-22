import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, History, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface ShipmentEvent {
  id: string;
  event_status: string | null;
  event_status_id: number | null;
  activity: string | null;
  location: string | null;
  event_timestamp: string | null;
  received_at: string;
}

interface Props {
  shipmentId: string;
  awbCode: string | null;
}

// The full audit trail for one shipment, straight from shipment_events -
// every tracking update Shiprocket has ever sent us, plus any NDR action
// an admin took, in the order it actually happened. Answers "is anything
// missing or wrong" directly from real data instead of trusting a single
// status column.
export function ShipmentTimelineDialog({ shipmentId, awbCode }: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("shipment_events")
      .select("id, event_status, event_status_id, activity, location, event_timestamp, received_at")
      .eq("shipment_id", shipmentId)
      .order("event_timestamp", { ascending: true, nullsFirst: true })
      .then(({ data }) => {
        setEvents((data ?? []) as ShipmentEvent[]);
        setLoading(false);
      });
  }, [open, shipmentId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs gap-1 px-1.5"
        onClick={() => setOpen(true)}
      >
        <History className="h-3 w-3" /> History
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Shipment history</DialogTitle>
          <DialogDescription>{awbCode ? `AWB ${awbCode}` : "No AWB yet"}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No tracking events recorded yet.
          </p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="border-l-2 border-primary/30 pl-3 pb-1">
                <p className="text-sm font-medium">{e.event_status || "Update"}</p>
                {e.activity && <p className="text-xs text-muted-foreground">{e.activity}</p>}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{format(new Date(e.event_timestamp || e.received_at), "MMM d, yyyy h:mm a")}</span>
                  {e.location && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" /> {e.location}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
