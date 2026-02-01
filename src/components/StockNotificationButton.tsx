import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useStockNotifications } from "@/hooks/useStockNotifications";
import { useAuth } from "@/hooks/useAuth";
import { Bell, Loader2, Check } from "lucide-react";

interface StockNotificationButtonProps {
  productId: string;
  productName: string;
}

export function StockNotificationButton({ productId, productName }: StockNotificationButtonProps) {
  const { user } = useAuth();
  const { isSubscribed, subscribe, unsubscribe, loading } = useStockNotifications(productId);
  const [email, setEmail] = useState(user?.email || "");
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = async () => {
    if (!email) return;

    setIsSubmitting(true);
    const success = await subscribe(email);
    setIsSubmitting(false);

    if (success) {
      setIsOpen(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsSubmitting(true);
    await unsubscribe();
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <Button variant="outline" disabled className="w-full">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (isSubscribed) {
    return (
      <Button
        variant="outline"
        className="w-full border-primary/50 text-primary hover:bg-primary/10"
        onClick={handleUnsubscribe}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Check className="h-4 w-4 mr-2" />
        )}
        You'll be notified when back in stock
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Bell className="h-4 w-4 mr-2" />
          Notify Me When Available
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Get Notified</DialogTitle>
          <DialogDescription>
            We'll send you an email when <strong>{productName}</strong> is back in stock.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notification-email">Email Address</Label>
            <Input
              id="notification-email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubscribe} disabled={!email || isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Bell className="h-4 w-4 mr-2" />
            )}
            Notify Me
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
