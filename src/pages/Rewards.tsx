import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LoyaltyDashboard } from "@/components/LoyaltyDashboard";
import { GiftCardSection } from "@/components/GiftCardSection";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Gift, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function Rewards() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex justify-center items-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="bg-gradient-to-r from-primary/10 to-accent py-12 md:py-16">
        <div className="container mx-auto px-4 text-center">
          <Gift className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            Rewards & Gift Cards
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Earn points, redeem rewards, and share the love with gift cards
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-12 space-y-12">
        {user ? (
          <LoyaltyDashboard />
        ) : (
          <div className="text-center py-8 bg-muted/30 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Sign in to view your rewards</h2>
            <p className="text-muted-foreground mb-4">
              Track your loyalty points, referrals, and exclusive perks
            </p>
            <Button>Sign In</Button>
          </div>
        )}

        <GiftCardSection />
      </main>

      <Footer />
    </div>
  );
}
