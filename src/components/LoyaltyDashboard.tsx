import { Link } from "react-router-dom";
import { Crown, Gift, Users, TrendingUp, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLoyaltyPoints } from "@/hooks/useLoyaltyPoints";
import { useReferrals } from "@/hooks/useReferrals";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const tierColors = {
  bronze: "bg-amber-700",
  silver: "bg-gray-400",
  gold: "bg-yellow-500",
  platinum: "bg-purple-600",
};

const tierIcons = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  platinum: "💎",
};

export function LoyaltyDashboard() {
  const { user } = useAuth();
  const { 
    loyaltyPoints, 
    transactions, 
    loading, 
    getNextTier, 
    getTierBenefits, 
    getPointsValue,
    TIER_THRESHOLDS,
  } = useLoyaltyPoints();
  const { myReferralCode, generateMyReferralCode, getReferralStats, referrals } = useReferrals();

  const referralStats = getReferralStats();
  const nextTier = getNextTier();

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Crown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Join Our Loyalty Program</h3>
          <p className="text-muted-foreground mb-4">
            Sign up to earn points and unlock exclusive rewards!
          </p>
          <Button asChild>
            <Link to="/login">Sign Up Now</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  const currentTier = loyaltyPoints?.tier || 'bronze';
  const currentPoints = loyaltyPoints?.total_points || 0;
  const lifetimePoints = loyaltyPoints?.lifetime_points || 0;

  return (
    <div className="space-y-6">
      {/* Points Summary */}
      <Card className="overflow-hidden">
        <div className={`${tierColors[currentTier as keyof typeof tierColors]} text-white p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{tierIcons[currentTier as keyof typeof tierIcons]}</span>
                <Badge variant="secondary" className="text-sm capitalize">
                  {currentTier} Member
                </Badge>
              </div>
              <h2 className="text-4xl font-bold">{currentPoints.toLocaleString()}</h2>
              <p className="opacity-90">Available Points</p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-75">Points Value</p>
              <p className="text-2xl font-bold">₹{getPointsValue(currentPoints).toFixed(0)}</p>
            </div>
          </div>
        </div>
        
        {nextTier && (
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span>Progress to {nextTier.tier}</span>
              <span>{nextTier.pointsNeeded} points needed</span>
            </div>
            <Progress 
              value={(lifetimePoints / TIER_THRESHOLDS[nextTier.tier as keyof typeof TIER_THRESHOLDS]) * 100} 
              className="h-2"
            />
          </CardContent>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Tier Benefits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Your Benefits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {getTierBenefits(currentTier).map((benefit, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  {benefit}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Referral Program */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Refer Friends
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {myReferralCode ? (
              <>
                <div className="bg-muted p-4 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-1">Your Referral Code</p>
                  <p className="text-xl font-mono font-bold">{myReferralCode}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{referralStats.pending}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{referralStats.completed}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{referralStats.totalEarned}</p>
                    <p className="text-xs text-muted-foreground">Points Earned</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  Earn 500 points for every friend who makes a purchase!
                </p>
                <Button onClick={() => generateMyReferralCode()}>
                  Get Referral Code
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No transactions yet. Start shopping to earn points!
            </p>
          ) : (
            <div className="space-y-3">
              {transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium capitalize">{tx.transaction_type}</p>
                    <p className="text-sm text-muted-foreground">
                      {tx.description || format(new Date(tx.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <span className={`font-semibold ${tx.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.points > 0 ? '+' : ''}{tx.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
