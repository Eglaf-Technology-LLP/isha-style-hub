import { Package, CheckCircle2, Truck, MapPin, PackageCheck, Ban, RotateCcw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { OrderTimeline, TimelineStage } from "@/lib/orderStatus";

const STAGE_ICONS: Record<TimelineStage["key"], typeof Package> = {
  placed: Package,
  confirmed: CheckCircle2,
  shipped: Truck,
  out_for_delivery: MapPin,
  delivered: PackageCheck,
};

function formatDate(iso: string | null, withTime = false): string | null {
  if (!iso) return null;
  try {
    return format(new Date(iso), withTime ? "MMM d, yyyy" : "MMM d, yyyy");
  } catch {
    return null;
  }
}

interface OrderStatusTimelineProps {
  timeline: OrderTimeline;
  compact?: boolean;
}

export function OrderStatusTimeline({ timeline, compact = false }: OrderStatusTimelineProps) {
  if (timeline.kind === "cancelled" || timeline.kind === "returned") {
    const Icon = timeline.kind === "cancelled" ? Ban : RotateCcw;
    const label = timeline.kind === "cancelled" ? "Order Cancelled" : "Returned";
    return (
      <div className={`flex items-center gap-2 text-destructive ${compact ? "text-xs" : "text-sm"}`}>
        <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        <span className="font-medium">{label}</span>
        {timeline.terminalAt && (
          <span className="text-muted-foreground">{formatDate(timeline.terminalAt)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={`flex items-start ${compact ? "gap-0" : "gap-0"}`}>
        {timeline.stages.map((stage, i) => {
          const Icon = STAGE_ICONS[stage.key];
          const isLast = i === timeline.stages.length - 1;
          const reached = stage.state !== "upcoming";
          return (
            <div key={stage.key} className="flex-1 flex flex-col items-center relative">
              <div className="flex items-center w-full">
                <div
                  className={`flex items-center justify-center rounded-full shrink-0 ${
                    compact ? "h-5 w-5" : "h-8 w-8"
                  } ${
                    reached
                      ? stage.state === "current"
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className={compact ? "h-3 w-3" : "h-4 w-4"} />
                </div>
                {!isLast && (
                  <div
                    className={`flex-1 ${compact ? "h-0.5" : "h-1"} ${
                      i < timeline.stages.length - 1 && timeline.stages[i + 1].state !== "upcoming"
                        ? "bg-primary/40"
                        : "bg-muted"
                    }`}
                  />
                )}
              </div>
              {!compact && (
                <div className="text-center mt-1.5 px-0.5">
                  <p className={`text-xs font-medium ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                    {stage.label}
                  </p>
                  {stage.date && <p className="text-[10px] text-muted-foreground">{formatDate(stage.date)}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {compact && (
        <p className="text-xs font-medium">
          {timeline.stages.find((s) => s.state === "current")?.label}
        </p>
      )}

      {timeline.isNdr && (
        <div className="flex items-center gap-1.5 text-amber-600 text-xs">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Last delivery attempt failed - a retry is scheduled</span>
        </div>
      )}

      {timeline.estimatedDeliveryDate && (
        <p className={`text-primary font-medium ${compact ? "text-xs" : "text-sm"}`}>
          Expected delivery: {formatDate(timeline.estimatedDeliveryDate)}
        </p>
      )}
    </div>
  );
}
