import { useState, useEffect } from "react";
import { Clock, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFlashSales, FlashSale } from "@/hooks/useFlashSales";
import { cn } from "@/lib/utils";

interface FlashSaleBannerProps {
  sale: FlashSale;
  compact?: boolean;
}

export function FlashSaleBanner({ sale, compact = false }: FlashSaleBannerProps) {
  const { getTimeRemaining } = useFlashSales();
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining(sale.ends_at));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(sale.ends_at));
    }, 1000);

    return () => clearInterval(interval);
  }, [sale.ends_at]);

  if (!timeRemaining) return null;

  if (compact) {
    return (
      <Badge variant="destructive" className="gap-1 animate-pulse">
        <Flame className="h-3 w-3" />
        {sale.discount_percentage}% OFF
      </Badge>
    );
  }

  return (
    <div className="bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground rounded-lg p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Flame className="h-6 w-6 animate-pulse" />
          <div>
            <h3 className="font-bold text-lg">{sale.name}</h3>
            {sale.description && (
              <p className="text-sm opacity-90">{sale.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {sale.discount_percentage}% OFF
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <div className="flex gap-1 font-mono text-lg">
            <TimeUnit value={timeRemaining.hours} label="h" />
            <span>:</span>
            <TimeUnit value={timeRemaining.minutes} label="m" />
            <span>:</span>
            <TimeUnit value={timeRemaining.seconds} label="s" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <span className="bg-background/20 px-2 py-1 rounded">
      {value.toString().padStart(2, "0")}{label}
    </span>
  );
}

interface FlashSaleCountdownProps {
  endsAt: string;
}

export function FlashSaleCountdown({ endsAt }: FlashSaleCountdownProps) {
  const { getTimeRemaining } = useFlashSales();
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining(endsAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(endsAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

  if (!timeRemaining) return null;

  return (
    <div className="flex items-center gap-1 text-destructive text-sm font-medium">
      <Clock className="h-4 w-4" />
      <span>
        {timeRemaining.hours}h {timeRemaining.minutes}m {timeRemaining.seconds}s
      </span>
    </div>
  );
}
