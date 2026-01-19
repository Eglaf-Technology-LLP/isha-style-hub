import { useFlashSales } from "@/hooks/useFlashSales";
import { FlashSaleBanner } from "@/components/FlashSaleBanner";

export function ActiveFlashSales() {
  const { activeFlashSales, loading } = useFlashSales();

  if (loading || activeFlashSales.length === 0) return null;

  return (
    <div className="container mx-auto px-4 py-4 space-y-3">
      {activeFlashSales.slice(0, 2).map((sale) => (
        <FlashSaleBanner key={sale.id} sale={sale} />
      ))}
    </div>
  );
}
