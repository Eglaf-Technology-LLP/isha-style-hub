import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, Zap, Gift, BarChart3 } from "lucide-react";
import { DiscountManagement } from "./DiscountManagement";
import { FlashSaleManagement } from "./FlashSaleManagement";
import { GiftCardManagement } from "./GiftCardManagement";
import { PromotionAnalytics } from "./PromotionAnalytics";
import { FLASH_SALES_TAB_ENABLED, GIFT_CARDS_TAB_ENABLED } from "@/lib/hiddenFeatures";
import { useShown } from "@/hooks/useSuperAdmin";
import { cn } from "@/lib/utils";

export function PromotionsManagement() {
  // Hidden screens (src/lib/hiddenFeatures.ts): a super admin sees them all.
  const showFlashSales = useShown(FLASH_SALES_TAB_ENABLED);
  const showGiftCards = useShown(GIFT_CARDS_TAB_ENABLED);
  const tabCount = 2 + Number(showFlashSales) + Number(showGiftCards);
  const what = ["discounts", showFlashSales && "flash sales", showGiftCards && "gift cards"].filter(Boolean);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Promotions</h2>
        <p className="text-muted-foreground">
          Manage {what.length > 1 ? `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}` : what[0]}
        </p>
      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList
          className={cn("grid w-full", tabCount === 2 ? "max-w-xs grid-cols-2" : tabCount === 3 ? "max-w-md grid-cols-3" : "max-w-lg grid-cols-4")}
        >
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="discounts" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">Discounts</span>
          </TabsTrigger>
          {showFlashSales && (
            <TabsTrigger value="flash-sales" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Flash Sales</span>
            </TabsTrigger>
          )}
          {showGiftCards && (
            <TabsTrigger value="gift-cards" className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              <span className="hidden sm:inline">Gift Cards</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="analytics">
          <PromotionAnalytics />
        </TabsContent>

        <TabsContent value="discounts">
          <DiscountManagement />
        </TabsContent>

        {showFlashSales && (
          <TabsContent value="flash-sales">
            <FlashSaleManagement />
          </TabsContent>
        )}

        {showGiftCards && (
          <TabsContent value="gift-cards">
            <GiftCardManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
