import { useState } from "react";
import { Ruler, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSizeGuides, SizeGuide } from "@/hooks/useSizeGuides";

interface SizeGuideModalProps {
  categoryId?: string;
}

export function SizeGuideModal({ categoryId }: SizeGuideModalProps) {
  const { sizeGuides, loading } = useSizeGuides(categoryId);
  const [open, setOpen] = useState(false);

  if (loading || sizeGuides.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="link" className="gap-1 px-0 h-auto text-sm">
          <Ruler className="h-4 w-4" />
          Size Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Size Guide</DialogTitle>
        </DialogHeader>

        {sizeGuides.length === 1 ? (
          <SizeGuideTable guide={sizeGuides[0]} />
        ) : (
          <Tabs defaultValue={sizeGuides[0].id}>
            <TabsList>
              {sizeGuides.map((guide) => (
                <TabsTrigger key={guide.id} value={guide.id}>
                  {guide.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {sizeGuides.map((guide) => (
              <TabsContent key={guide.id} value={guide.id}>
                <SizeGuideTable guide={guide} />
              </TabsContent>
            ))}
          </Tabs>
        )}

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-2">How to Measure</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• <strong>Chest:</strong> Measure around the fullest part of your chest</li>
            <li>• <strong>Waist:</strong> Measure around your natural waistline</li>
            <li>• <strong>Hip:</strong> Measure around the fullest part of your hips</li>
            <li>• <strong>Length:</strong> Measure from shoulder to hem</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SizeGuideTable({ guide }: { guide: SizeGuide }) {
  if (!guide.sizes.length || !guide.measurements.length) {
    return <p className="text-muted-foreground">No size information available</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Measurement</TableHead>
            {guide.sizes.map((size) => (
              <TableHead key={size} className="text-center">{size}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {guide.measurements.map((measurement) => (
            <TableRow key={measurement.name}>
              <TableCell className="font-medium">{measurement.name}</TableCell>
              {guide.sizes.map((size) => (
                <TableCell key={size} className="text-center">
                  {measurement.values[size] || "-"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground mt-2">
        All measurements are in centimeters (cm)
      </p>
    </div>
  );
}
