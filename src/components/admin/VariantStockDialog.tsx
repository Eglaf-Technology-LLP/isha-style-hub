import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers } from "lucide-react";
import { ProductVariant } from "@/hooks/useProducts";

interface Props {
  productName: string;
  variants: ProductVariant[];
}

// Shared by every admin/vendor product list (ProductManagement,
// VendorCatalogManagement, VendorDashboard) so "how many variants does this
// product have, and how much stock does each one have" is visible without
// opening the full edit dialog.
export function VariantStockDialog({ productName, variants }: Props) {
  const [open, setOpen] = useState(false);

  if (variants.length === 0) return null;

  const variantLabel = (v: ProductVariant) =>
    [v.options?.size || v.options?.Size, v.options?.color || v.options?.Color]
      .filter(Boolean)
      .join(" / ") || v.name;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 gap-1 text-xs"
        onClick={() => setOpen(true)}
      >
        <Layers className="h-3 w-3" />
        {variants.length} variant{variants.length === 1 ? "" : "s"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{productName} - Variants</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      {v.image_url ? (
                        <img src={v.image_url} alt={variantLabel(v)} className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{variantLabel(v)}</TableCell>
                    <TableCell className="text-muted-foreground">{v.sku || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={v.stock === 0 ? "destructive" : "secondary"}>{v.stock}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
