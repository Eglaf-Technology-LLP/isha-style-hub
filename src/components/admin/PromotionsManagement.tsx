import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, Zap, Gift, BarChart3 } from "lucide-react";
import { DiscountManagement } from "./DiscountManagement";
import { FlashSaleManagement } from "./FlashSaleManagement";
import { GiftCardManagement } from "./GiftCardManagement";
import { PromotionAnalytics } from "./PromotionAnalytics";
import { FLASH_SALES_TAB_ENABLED, GIFT_CARDS_TAB_ENABLED } from "@/lib/hiddenFeatures";
import { cn } from "@/lib/utils";

export function PromotionsManagement() {
  const tabCount = 2 + Number(FLASH_SALES_TAB_ENABLED) + Number(GIFT_CARDS_TAB_ENABLED);
  const what = ["discounts", FLASH_SALES_TAB_ENABLED && "flash sales", GIFT_CARDS_TAB_ENABLED && "gift cards"].filter(Boolean);
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
          {FLASH_SALES_TAB_ENABLED && (
            <TabsTrigger value="flash-sales" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Flash Sales</span>
            </TabsTrigger>
          )}
          {GIFT_CARDS_TAB_ENABLED && (
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

        {FLASH_SALES_TAB_ENABLED && (
          <TabsContent value="flash-sales">
            <FlashSaleManagement />
          </TabsContent>
        )}

        {GIFT_CARDS_TAB_ENABLED && (
          <TabsContent value="gift-cards">
            <GiftCardManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
