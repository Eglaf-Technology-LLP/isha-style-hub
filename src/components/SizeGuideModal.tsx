import { useEffect, useState } from "react";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchTemplate,
  fetchVendorChart,
  hasAnyValue,
  standardValues,
  unitLabel,
  type ChartValues,
  type SizeChartTemplate,
} from "@/lib/sizeCharts";

// Product page "Size chart": the boutique's own numbers for this category
// (else AllBoutiqs' standard numbers, if set), in the category's fixed
// template, with how to take each measurement. Hidden when there's nothing
// to show.
export function SizeGuideModal({ categoryId, vendorId }: { categoryId?: string | null; vendorId?: string | null }) {
  const [template, setTemplate] = useState<SizeChartTemplate | null>(null);
  const [values, setValues] = useState<ChartValues | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setTemplate(null);
    setValues(null);
    if (!categoryId) return;
    (async () => {
      const t = await fetchTemplate(categoryId);
      if (!live || !t) return;
      const own = vendorId ? await fetchVendorChart(vendorId, categoryId) : null;
      if (!live) return;
      setTemplate(t);
      setValues(hasAnyValue(own) ? own : hasAnyValue(standardValues(t)) ? standardValues(t) : null);
    })();
    return () => {
      live = false;
    };
  }, [categoryId, vendorId]);

  if (!template || !values) return null;
  const rows = template.measurements.filter((m) => template.sizes.some((s) => String(values[m.key]?.[s] ?? "").trim()));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="link" className="gap-1 px-0 h-auto text-sm">
          <Ruler className="h-4 w-4" />
          Size chart
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Size chart · {template.name}</DialogTitle>
          <DialogDescription>Garment measurements in {unitLabel(template.unit)}.</DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Measurement</TableHead>
                {template.sizes.map((size) => (
                  <TableHead key={size} className="text-center">
                    {size}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.key}>
                  <TableCell className="font-medium whitespace-nowrap">{m.name}</TableCell>
                  {template.sizes.map((size) => (
                    <TableCell key={size} className="text-center tabular-nums">
                      {String(values[m.key]?.[size] ?? "").trim() || "–"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {rows.some((m) => m.hint) && (
          <div className="mt-2 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">How to measure</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {rows
                .filter((m) => m.hint)
                .map((m) => (
                  <li key={m.key}>
                    <strong className="text-foreground">{m.name}:</strong> {m.hint}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
