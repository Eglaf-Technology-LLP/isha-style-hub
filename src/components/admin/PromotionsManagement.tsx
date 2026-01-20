import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, Zap, Gift, BarChart3 } from "lucide-react";
import { DiscountManagement } from "./DiscountManagement";
import { FlashSaleManagement } from "./FlashSaleManagement";
import { GiftCardManagement } from "./GiftCardManagement";
import { PromotionAnalytics } from "./PromotionAnalytics";

export function PromotionsManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Promotions</h2>
        <p className="text-muted-foreground">
          Manage discounts, flash sales, and gift cards
        </p>
      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="discounts" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">Discounts</span>
          </TabsTrigger>
          <TabsTrigger value="flash-sales" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Flash Sales</span>
          </TabsTrigger>
          <TabsTrigger value="gift-cards" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            <span className="hidden sm:inline">Gift Cards</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics">
          <PromotionAnalytics />
        </TabsContent>

        <TabsContent value="discounts">
          <DiscountManagement />
        </TabsContent>

        <TabsContent value="flash-sales">
          <FlashSaleManagement />
        </TabsContent>

        <TabsContent value="gift-cards">
          <GiftCardManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
