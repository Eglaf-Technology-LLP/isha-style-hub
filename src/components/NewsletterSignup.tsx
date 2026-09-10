import { useState } from "react";
import { Send, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNewsletter } from "@/hooks/useNewsletter";

interface NewsletterSignupProps {
  variant?: "inline" | "popup" | "footer";
}

export function NewsletterSignup({ variant = "footer" }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const { subscribe, loading } = useNewsletter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    const success = await subscribe(email);
    if (success) {
      setEmail("");
    }
  };

  if (variant === "inline") {
    return (
      <form onSubmit={handleSubmit} className="flex gap-2 max-w-md">
        <Input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "..." : <Send className="h-4 w-4" />}
        </Button>
      </form>
    );
  }

  return (
    <div className="bg-muted/50 rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-brand/10 rounded-full">
          <Mail className="h-6 w-6 text-brand" />
        </div>
        <div>
          <h3 className="font-semibold">Subscribe to our Newsletter</h3>
          <p className="text-sm text-muted-foreground">
            Get exclusive offers, new arrivals & style tips
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          placeholder="Enter your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Subscribing..." : "Subscribe"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        By subscribing, you agree to receive marketing emails. Unsubscribe anytime.
      </p>
    </div>
  );
}
