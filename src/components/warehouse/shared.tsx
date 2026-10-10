import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useWarehouseData, WhShipment } from "@/hooks/useWarehouseData";
import { WarehouseTiming } from "@/lib/warehouse";

export type WarehouseData = ReturnType<typeof useWarehouseData>;

export interface WarehouseInfo {
  id: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: Record<string, string>;
}

export interface WarehouseViewProps {
  data: WarehouseData;
  timing: WarehouseTiming;
  isAdmin: boolean;
  warehouse: WarehouseInfo | null;
}

export const orderRef = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

// A warehouse database step (receive, inspect, pack...). Toasts its own error.
export async function runRpc(name: string, args: Record<string, unknown>, success: string): Promise<boolean> {
  const { error } = await supabase.rpc(name as any, args as any);
  if (error) {
    toast.error(error.message);
    return false;
  }
  toast.success(success);
  return true;
}

// A warehouse step that books a courier or moves money (warehouse-actions).
export async function runAction<T = any>(action: string, body: Record<string, unknown>, success?: string) {
  const { data, errorMessage } = await invokeEdgeFunction<T>("warehouse-actions", { action, ...body });
  if (errorMessage) {
    toast.error(errorMessage);
    return null;
  }
  if (success) toast.success(success);
  return data ?? ({} as T);
}

export function TrackLink({ shipment }: { shipment: Pick<WhShipment, "awb_code" | "courier_name"> | null }) {
  if (!shipment?.awb_code) return null;
  return (
    <a
      href={`https://shiprocket.co/tracking/${shipment.awb_code}`}
      target="_blank"
      rel="noreferrer"
      className="text-primary inline-flex items-center gap-0.5 hover:underline text-xs"
    >
      {shipment.courier_name ? `${shipment.courier_name} · ` : ""}AWB {shipment.awb_code} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground text-center py-10">{text}</p>;
}
