import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AI_CONTENT_OPTIONS, AiContentStatus } from "@/lib/aiContent";
import { cn } from "@/lib/utils";

interface AiDeclarationFieldProps {
  idPrefix: string;
  value: AiContentStatus | null | undefined;
  onChange: (value: AiContentStatus) => void;
}

export function AiDeclarationField({ idPrefix, value, onChange }: AiDeclarationFieldProps) {
  return (
    <div className={cn("space-y-2 rounded-lg border p-3", value ? "border-border" : "border-amber-300 bg-amber-50/50")}>
      <div>
        <Label className="text-sm font-medium">
          AI content declaration <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground">
          Tell us honestly how this listing's images were made. Required before saving.
        </p>
      </div>
      <RadioGroup
        value={value ?? ""}
        onValueChange={(v) => onChange(v as AiContentStatus)}
        className="grid sm:grid-cols-2 gap-2"
      >
        {AI_CONTENT_OPTIONS.map((o) => (
          <label
            key={o.value}
            htmlFor={`${idPrefix}-ai-${o.value}`}
            className={cn(
              "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50",
              value === o.value ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <RadioGroupItem value={o.value} id={`${idPrefix}-ai-${o.value}`} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.description}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
