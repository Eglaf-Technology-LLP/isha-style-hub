import { Link } from "react-router-dom";
import { Gift, ChevronRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useGiftCards } from "@/hooks/useGiftCards";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { format } from "date-fns";

export function GiftCardSection() {
  const { user } = useAuth();
  const { myGiftCards, loading, checkBalance } = useGiftCards();
  const [balanceCode, setBalanceCode] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const handleCheckBalance = async () => {
    if (!balanceCode) return;
    setChecking(true);
    const result = await checkBalance(balanceCode);
    setBalance(result);
    setChecking(false);
  };

  return (
    <div className="space-y-6">
      {/* Check Balance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Check Gift Card Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter gift card code"
              value={balanceCode}
              onChange={(e) => setBalanceCode(e.target.value.toUpperCase())}
              className="font-mono"
            />
            <Button onClick={handleCheckBalance} disabled={checking}>
              {checking ? "Checking..." : "Check"}
            </Button>
          </div>
          {balance !== null && (
            <div className="bg-muted p-4 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold">₹{balance.toLocaleString()}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchase Gift Cards */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <Gift className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">Give the Gift of Fashion</h3>
              <p className="text-muted-foreground">
                Purchase a gift card for someone special
              </p>
            </div>
            <Button>
              Buy Gift Card
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* My Gift Cards */}
      {user && (
        <Card>
          <CardHeader>
            <CardTitle>My Gift Cards</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse h-24 bg-muted rounded-lg" />
            ) : myGiftCards.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                You haven't purchased any gift cards yet
              </p>
            ) : (
              <div className="space-y-3">
                {myGiftCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-mono font-medium">{card.code}</p>
                      <p className="text-sm text-muted-foreground">
                        {card.recipient_name ? `For ${card.recipient_name}` : "For you"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">₹{card.current_balance.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        of ₹{card.initial_balance.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={card.is_active ? "default" : "secondary"}>
                      {card.is_active ? "Active" : "Used"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
