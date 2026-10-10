import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, PackageCheck } from "lucide-react";

export interface ParcelSize {
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

interface PackParcelDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  initial?: Partial<ParcelSize>;
  variant?: "default" | "outline" | "secondary";
  onSubmit: (size: ParcelSize) => Promise<boolean>;
}

// After repacking, staff weigh and measure the parcel so the courier charges
// what it really is.
export function PackParcelDialog({ triggerLabel, title, description, initial, variant = "default", onSubmit }: PackParcelDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    weightKg: String(initial?.weightKg ?? ""),
    lengthCm: String(initial?.lengthCm ?? ""),
    breadthCm: String(initial?.breadthCm ?? ""),
    heightCm: String(initial?.heightCm ?? ""),
  });
  const values = {
    weightKg: Number(form.weightKg),
    lengthCm: Number(form.lengthCm),
    breadthCm: Number(form.breadthCm),
    heightCm: Number(form.heightCm),
  };
  const valid = Object.values(values).every((v) => Number.isFinite(v) && v > 0);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await onSubmit(values);
    setBusy(false);
    if (ok) setOpen(false);
  };

  const field = (key: keyof typeof form, label: string, step: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`pp-${key}`}>{label}</Label>
      <Input
        id={`pp-${key}`}
        type="number"
        min={0}
        step={step}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <Button size="sm" variant={variant} className="h-8 text-xs gap-1" onClick={() => setOpen(true)}>
        <PackageCheck className="h-3 w-3" />
        {triggerLabel}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {field("weightKg", "Weight (kg)", "0.01")}
          {field("lengthCm", "Length (cm)", "1")}
          {field("breadthCm", "Breadth (cm)", "1")}
          {field("heightCm", "Height (cm)", "1")}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Back
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save parcel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
