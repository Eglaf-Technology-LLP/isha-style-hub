import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNotifications } from "@/hooks/useNotifications";

// "New orders must be visible directly on the dashboard without an extra
// click" - so this sits on the Dashboard tab itself, not behind the bell.
// Reuses useNotifications' existing poll rather than a separate query.
export function NewOrdersBanner() {
  const { orderNotifications, markRead } = useNotifications();
  const newOrders = orderNotifications.filter((n) => n.type === "new_order" && !n.read_at);

  if (newOrders.length === 0) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4 text-primary" />
          {newOrders.length} new order{newOrders.length !== 1 ? "s" : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {newOrders.slice(0, 5).map((n) => (
          <div
            key={n.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background border border-border"
          >
            <div>
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => markRead(n.id)}>
              Mark seen
            </Button>
          </div>
        ))}
        {newOrders.length > 5 && (
          <p className="text-xs text-muted-foreground text-center">+{newOrders.length - 5} more</p>
        )}
      </CardContent>
    </Card>
  );
}
