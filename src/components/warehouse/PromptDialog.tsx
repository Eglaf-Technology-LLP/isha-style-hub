import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface PromptDialogProps {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: ReactNode;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (value: string) => Promise<boolean>;
}

// A small confirm step that can also ask for one piece of text (a shelf,
// what's wrong with an item, a reason).
export function PromptDialog({
  trigger,
  title,
  description,
  label,
  placeholder,
  multiline,
  required,
  confirmLabel,
  destructive,
  onConfirm,
}: PromptDialogProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (required && !value.trim()) return;
    setBusy(true);
    const ok = await onConfirm(value.trim());
    setBusy(false);
    if (ok) {
      setOpen(false);
      setValue("");
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
          </DialogHeader>
          {label !== undefined && (
            <div className="space-y-1.5">
              {label && <p className="text-sm font-medium">{label}</p>}
              {multiline ? (
                <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} rows={3} />
              ) : (
                <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Back
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={confirm}
              disabled={busy || (required && !value.trim())}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
