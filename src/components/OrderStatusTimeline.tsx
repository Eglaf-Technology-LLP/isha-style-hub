import { Package, CheckCircle2, Truck, MapPin, PackageCheck, Ban, RotateCcw, AlertTriangle, Scissors, ShieldCheck } from "lucide-react";
import { OrderTimeline, TimelineStage } from "@/lib/orderStatus";
import { formatDateInWords as formatDay, formatDateInWordsWithDay, formatDateTimeInWords as formatDateTime } from "@/lib/dates";

const STAGE_ICONS: Record<TimelineStage["key"], typeof Package> = {
  placed: Package,
  confirmed: CheckCircle2,
  preparing: Scissors,
  quality_check: ShieldCheck,
  shipped: Truck,
  out_for_delivery: MapPin,
  delivered: PackageCheck,
};

function formatDate(iso: string | null, withTime = false): string | null {
  if (!iso) return null;
  return (withTime ? formatDateTime(iso) : formatDay(iso)) || null;
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
      <div className="space-y-1">
        <div className={`flex items-center gap-2 text-destructive ${compact ? "text-xs" : "text-sm"}`}>
          <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          <span className="font-medium">{label}</span>
          {timeline.terminalAt && (
            <span className="text-muted-foreground">{formatDate(timeline.terminalAt, true)}</span>
          )}
        </div>
        {timeline.note && <p className="text-xs text-muted-foreground">{timeline.note}</p>}
      </div>
    );
  }

  const stageDot = (stage: TimelineStage, size: string) => {
    const Icon = STAGE_ICONS[stage.key];
    const reached = stage.state !== "upcoming";
    return (
      <div
        className={`flex items-center justify-center rounded-full shrink-0 ${size} ${
          reached
            ? stage.state === "current"
              ? "bg-primary text-primary-foreground"
              : "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className={compact ? "h-3 w-3" : "h-4 w-4"} />
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {!compact && <p className="text-sm font-medium">{timeline.currentLabel}</p>}

      {/* Every step with its date and time (client, 24 Nov 2026). Phones: a
          list, top to bottom; wider screens: a line, left to right. */}
      {!compact && (
        <ol className="space-y-0 md:hidden">
          {timeline.stages.map((stage, i) => {
            const reached = stage.state !== "upcoming";
            const isLast = i === timeline.stages.length - 1;
            return (
              <li key={stage.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  {stageDot(stage, "h-7 w-7")}
                  {!isLast && (
                    <div
                      className={`w-0.5 flex-1 min-h-3 ${timeline.stages[i + 1].state !== "upcoming" ? "bg-primary/40" : "bg-muted"}`}
                    />
                  )}
                </div>
                <div className={`pb-3 pt-1 ${reached ? "" : "text-muted-foreground"}`}>
                  <p className="text-xs font-medium">{stage.label}</p>
                  {stage.date && <p className="text-[11px] text-muted-foreground">{formatDate(stage.date, true)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className={`items-start ${compact ? "flex" : "hidden md:flex"}`}>
        {timeline.stages.map((stage, i) => {
          const isLast = i === timeline.stages.length - 1;
          const reached = stage.state !== "upcoming";
          return (
            <div key={stage.key} className="flex-1 flex flex-col items-center relative">
              <div className="flex items-center w-full">
                {stageDot(stage, compact ? "h-5 w-5" : "h-8 w-8")}
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
                  {stage.date && <p className="text-[10px] text-muted-foreground">{formatDate(stage.date, true)}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {compact && <p className="text-xs font-medium">{timeline.currentLabel}</p>}

      {timeline.isNdr && (
        <div className="flex items-center gap-1.5 text-amber-600 text-xs">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Last delivery attempt failed - a retry is scheduled</span>
        </div>
      )}

      {timeline.note && <p className="text-xs text-muted-foreground">{timeline.note}</p>}

      {timeline.estimatedDeliveryDate && (
        <p className={`text-primary font-medium ${compact ? "text-xs" : "text-sm"}`}>
          Expected delivery: {formatDateInWordsWithDay(timeline.estimatedDeliveryDate)}
        </p>
      )}
    </div>
  );
}
