import { Link } from "react-router-dom";
import { Crown, Check, Loader2, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useMembership, MEMBERSHIP_PLANS, INSIDER_BENEFITS, type MembershipPlan } from "@/hooks/useMembership";
import { format } from "date-fns";

export default function Membership() {
  const { user, loading: authLoading } = useAuth();
  const { membership, isActive, loading, actionLoading, subscribe, cancel, toggleAutoRenew } = useMembership();

  const annualSavings = MEMBERSHIP_PLANS.monthly.price * 12 - MEMBERSHIP_PLANS.annual.price;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="bg-gradient-to-br from-primary/15 via-accent/20 to-primary/5 py-16 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" /> Premium Membership
          </div>
          <Crown className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-3">AllBoutiqs Insider</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Unlock free shipping, exclusive discounts, double loyalty points, and early access — all year long.
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-12 space-y-10 max-w-5xl">
        {authLoading || loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !user ? (
          <Card>
            <CardContent className="py-10 text-center">
              <h2 className="text-2xl font-semibold mb-2">Sign in to join AllBoutiqs Insider</h2>
              <p className="text-muted-foreground mb-4">Create an account to unlock premium benefits.</p>
              <Button asChild>
                <Link to="/account">Sign In</Link>
              </Button>
            </CardContent>
          </Card>
        ) : isActive && membership ? (
          <ActiveMembershipCard
            membership={membership}
            onCancel={cancel}
            onToggleAutoRenew={toggleAutoRenew}
            actionLoading={actionLoading}
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" /> Member Benefits
                </CardTitle>
                <CardDescription>Everything you get with AllBoutiqs Insider</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid sm:grid-cols-2 gap-3">
                  {INSIDER_BENEFITS.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <PlanCard
                plan="monthly"
                onSubscribe={subscribe}
                actionLoading={actionLoading}
              />
              <PlanCard
                plan="annual"
                onSubscribe={subscribe}
                actionLoading={actionLoading}
                highlight
                tag={`Save ₹${annualSavings}`}
              />
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Demo subscription — no payment is collected. Connect Stripe/Razorpay to charge real customers.
            </p>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function PlanCard({
  plan,
  onSubscribe,
  actionLoading,
  highlight,
  tag,
}: {
  plan: MembershipPlan;
  onSubscribe: (p: MembershipPlan) => void;
  actionLoading: boolean;
  highlight?: boolean;
  tag?: string;
}) {
  const info = MEMBERSHIP_PLANS[plan];
  return (
    <Card className={highlight ? "border-primary shadow-lg relative" : ""}>
      {tag && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">{tag}</Badge>
      )}
      <CardHeader>
        <CardTitle>{info.label}</CardTitle>
        <CardDescription>Billed every {info.days} days</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <span className="text-4xl font-bold">₹{info.price}</span>
          <span className="text-muted-foreground">
            {plan === "monthly" ? " / month" : " / year"}
          </span>
        </div>
        <Button
          className="w-full"
          variant={highlight ? "default" : "outline"}
          disabled={actionLoading}
          onClick={() => onSubscribe(plan)}
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Start ${info.label}`}
        </Button>
      </CardContent>
    </Card>
  );
}

function ActiveMembershipCard({
  membership,
  onCancel,
  onToggleAutoRenew,
  actionLoading,
}: {
  membership: ReturnType<typeof useMembership>["membership"];
  onCancel: () => void;
  onToggleAutoRenew: () => void;
  actionLoading: boolean;
}) {
  if (!membership) return null;
  return (
    <Card>
      <CardHeader className="bg-gradient-to-r from-primary to-primary/70 text-primary-foreground rounded-t-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Crown className="h-6 w-6" />
            <CardTitle className="text-primary-foreground">AllBoutiqs Insider — Active</CardTitle>
          </div>
          <Badge variant="secondary" className="capitalize">{membership.plan}</Badge>
        </div>
        <CardDescription className="text-primary-foreground/90">
          Renews on {format(new Date(membership.expires_at), "PPP")}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <ul className="grid sm:grid-cols-2 gap-3">
          {INSIDER_BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border rounded-lg p-4">
          <div>
            <p className="font-medium">Auto-renew</p>
            <p className="text-sm text-muted-foreground">
              {membership.auto_renew ? "Your plan will renew automatically" : "Plan will end on expiry"}
            </p>
          </div>
          <Switch checked={membership.auto_renew} onCheckedChange={onToggleAutoRenew} />
        </div>

        <Button variant="outline" onClick={onCancel} disabled={actionLoading}>
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel Membership"}
        </Button>
      </CardContent>
    </Card>
  );
}
