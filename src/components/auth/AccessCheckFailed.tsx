import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// A role or boutique check that couldn't be made (usually the connection) is
// not a "no" (src/lib/accessCheck.ts): this says so and offers another try.
export function AccessCheckFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-serif">Couldn't load your dashboard</CardTitle>
          <CardDescription>We couldn't reach AllBoutiqs. Check your internet connection and try again.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={onRetry}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
