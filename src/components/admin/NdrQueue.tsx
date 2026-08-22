import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, RotateCw, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

interface NdrShipment {
  id: string;
  awb_code: string | null;
  courier_name: string | null;
  status_raw: string | null;
  vendor_order: { order_id: string; vendor: { name: string } | null } | null;
}

// Every shipment the courier reports as a failed delivery attempt
// (non-delivery report) - admin decides reattempt vs. return-to-origin,
// matching the "who handles a failed delivery/reattempt" part of the ask.
export function NdrQueue() {
  const [shipments, setShipments] = useState<NdrShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  const fetchNdr = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shipments")
      .select("id, awb_code, courier_name, status_raw, vendor_order:vendor_orders(order_id, vendor:vendors(name))")
      .eq("status", "ndr");
    if (error) {
      console.error("Failed to load NDR queue", error);
    } else {
      setShipments((data ?? []) as unknown as NdrShipment[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNdr();
  }, []);

  const takeAction = async (shipmentId: string, action: "re-attempt" | "return") => {
    const comment = comments[shipmentId]?.trim();
    if (!comment) {
      toast.error("Add a comment before taking action");
      return;
    }
    setActioning(shipmentId);
    const { errorMessage } = await invokeEdgeFunction("shiprocket-ndr-action", {
      shipment_id: shipmentId,
      action,
      comments: comment,
    });
    setActioning(null);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    toast.success(action === "re-attempt" ? "Reattempt requested" : "Return to origin requested");
    await fetchNdr();
  };

  if (loading || shipments.length === 0) return null;

  return (
    <Card className="border-orange-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-700">
          <AlertTriangle className="h-5 w-5" /> Failed delivery attempts (NDR)
        </CardTitle>
        <CardDescription>
          The courier couldn't deliver these - decide whether to try again or send the item back.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {shipments.map((s) => (
          <Dialog key={s.id}>
            <div className="flex items-center justify-between p-3 border border-border rounded-lg flex-wrap gap-2">
              <div className="text-sm">
                <p className="font-medium">{s.vendor_order?.vendor?.name || "Vendor"}</p>
                <p className="text-xs text-muted-foreground">
                  AWB {s.awb_code} · {s.courier_name} · {s.status_raw}
                </p>
              </div>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Take action
                </Button>
              </DialogTrigger>
            </div>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Resolve NDR</DialogTitle>
                <DialogDescription>AWB {s.awb_code} - {s.status_raw}</DialogDescription>
              </DialogHeader>
              <Textarea
                placeholder="Reason / comment (required by the courier)"
                value={comments[s.id] || ""}
                onChange={(e) => setComments((prev) => ({ ...prev, [s.id]: e.target.value }))}
                rows={3}
              />
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  disabled={actioning === s.id}
                  onClick={() => takeAction(s.id, "return")}
                  className="gap-1"
                >
                  {actioning === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                  Return to vendor
                </Button>
                <Button disabled={actioning === s.id} onClick={() => takeAction(s.id, "re-attempt")} className="gap-1">
                  {actioning === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                  Reattempt delivery
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ))}
      </CardContent>
    </Card>
  );
}
