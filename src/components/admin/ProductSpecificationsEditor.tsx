import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { ProductSpecification } from "@/hooks/useProducts";

interface ProductSpecificationsEditorProps {
  specifications: ProductSpecification[];
  onChange: (specifications: ProductSpecification[]) => void;
}

// Every product type shows different details (a saree's Wash Care/Fabric
// Composition/Length vs. a lehenga's Package Contains/Dupatta Fabric/USP) -
// a free-form label/value list rather than a fixed per-category schema, so
// nothing needs to be pre-defined before a vendor can describe their own
// product. Common labels are quick-add chips, same pattern VariantManager
// uses for size/color, plus free-text for anything not listed.
const SUGGESTED_LABELS = [
  "Fabric", "Fabric Composition", "Wash Care", "Fit", "Length", "Sleeve",
  "Neck", "Pattern", "Occasion", "Mood", "Package Contains", "Closure",
  "Lining", "Transparency", "Stretch", "Size Tip", "USP", "Lapel",
];

const generateRowId = () => `spec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function ProductSpecificationsEditor({ specifications, onChange }: ProductSpecificationsEditorProps) {
  const [customLabel, setCustomLabel] = useState("");

  const usedLabels = new Set(specifications.map((s) => s.label));

  const addRow = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || usedLabels.has(trimmed)) return;
    onChange([...specifications, { label: trimmed, value: "" }]);
    setCustomLabel("");
  };

  const updateRow = (index: number, field: "label" | "value", value: string) => {
    onChange(specifications.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const removeRow = (index: number) => {
    onChange(specifications.filter((_, i) => i !== index));
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Product Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Add a detail</Label>
          <div className="flex flex-wrap gap-1">
            {SUGGESTED_LABELS.filter((l) => !usedLabels.has(l)).map((label) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => addRow(label)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add custom detail label..."
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRow(customLabel))}
              className="flex-1"
            />
            <Button type="button" size="sm" onClick={() => addRow(customLabel)} disabled={!customLabel.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {specifications.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            {specifications.map((spec, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={spec.label}
                  onChange={(e) => updateRow(index, "label", e.target.value)}
                  className="w-40 h-8 text-xs font-medium shrink-0"
                />
                <Input
                  placeholder="Value"
                  value={spec.value}
                  onChange={(e) => updateRow(index, "value", e.target.value)}
                  className="flex-1 h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => removeRow(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {specifications.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-1">
            No details added yet - pick one above or type your own.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
