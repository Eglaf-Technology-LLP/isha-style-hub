import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Ban, Banknote, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteProducts,
  updateProducts,
  type ProductBulkPatch,
  type ProductBulkResult,
  type useProductSelection,
} from "@/lib/productBulk";

interface ProductBulkBarProps {
  // Rows that can be ticked - everything the current filters show, on every page.
  totalCount: number;
  selection: ReturnType<typeof useProductSelection>;
  // "listing": List / Hide (boutique words); "status": Activate / Deactivate.
  wording: "listing" | "status";
  onUpdated: (ids: string[], patch: ProductBulkPatch) => void;
  onDeleted: (ids: string[]) => void;
}

const plural = (n: number) => `${n} product${n === 1 ? "" : "s"}`;

// The select-all bar over a product list, with what can be done to every
// ticked product at once - same look as Product Moderation's.
export function ProductBulkBar({ totalCount, selection, wording, onUpdated, onDeleted }: ProductBulkBarProps) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = selection.selectedIds;
  const n = ids.length;
  const allSelected = totalCount > 0 && n === totalCount;
  const on = wording === "listing" ? "List" : "Activate";
  const off = wording === "listing" ? "Hide" : "Deactivate";

  const report = (result: ProductBulkResult, did: string) => {
    if (result.done.length > 0 && result.failed === 0) toast.success(`${plural(result.done.length)} ${did}`);
    else if (result.done.length > 0) {
      toast.warning(`${plural(result.done.length)} ${did}; ${result.failed} couldn't be changed${result.error ? ` (${result.error})` : ""}`);
    } else toast.error(result.error ?? "Nothing could be changed");
  };

  const update = async (patch: ProductBulkPatch, did: string) => {
    setBusy(true);
    const result = await updateProducts(ids, patch);
    setBusy(false);
    if (result.done.length > 0) onUpdated(result.done, patch);
    report(result, did);
    selection.clear();
  };

  const remove = async () => {
    setConfirmDelete(false);
    setBusy(true);
    const result = await deleteProducts(ids);
    setBusy(false);
    if (result.done.length > 0) onDeleted(result.done);
    report(result, "deleted");
    selection.clear();
  };

  if (totalCount === 0) return null;

  return (
    <div className="sticky top-[65px] z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={allSelected ? true : n > 0 ? "indeterminate" : false}
          onCheckedChange={(v) => selection.selectAll(v === true)}
          aria-label="Select every product shown"
          disabled={busy}
        />
        {n > 0 ? `${n} of ${totalCount} selected` : `Select all (${totalCount})`}
      </label>
      {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => update({ is_active: true }, wording === "listing" ? "listed" : "activated")}>
            <Eye className="mr-1 h-4 w-4" /> {on}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => update({ is_active: false }, wording === "listing" ? "hidden" : "deactivated")}>
            <EyeOff className="mr-1 h-4 w-4" /> {off}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => update({ cod_available: true }, "now allow Cash on Delivery")}>
            <Banknote className="mr-1 h-4 w-4" /> COD on
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => update({ cod_available: false }, "no longer allow Cash on Delivery")}>
            <Ban className="mr-1 h-4 w-4" /> COD off
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={selection.clear}>
            Clear
          </Button>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {plural(n)}?</AlertDialogTitle>
            <AlertDialogDescription>
              They're removed from the site for good. Orders already placed keep their details. This can't be
              undone - to take them off the site for now, use {off} instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete {plural(n)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
