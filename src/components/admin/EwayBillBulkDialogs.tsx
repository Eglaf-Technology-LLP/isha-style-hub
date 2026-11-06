import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, FileUp, ListChecks, Loader2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatEwbNumber, orderRefOf, uploadEwayBillPdf, localInput } from "@/lib/ewayBill";
import { parsePastedNumbers } from "@/lib/ewayBillJson";
import type { AdminEwayBill } from "@/hooks/useEwayBillsAdmin";

type RowResult = { ok: boolean; error?: string };

// ---------- numbers ----------

// After uploading the JSON on the portal: the numbers for many requests at
// once - typed, or pasted from the portal's result table (matched by
// document number). Each boutique / the warehouse is told as its number is saved.
export function EwayBillBulkEntryDialog({ bills, onSaved }: { bills: AdminEwayBill[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [pasted, setPasted] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Record<string, RowResult>>({});

  const openDialog = () => {
    setNumbers({});
    setPasted("");
    setResults({});
    setGeneratedAt(localInput(new Date()));
    setOpen(true);
  };

  const applyPaste = (text: string) => {
    setPasted(text);
    const found = parsePastedNumbers(text, bills.map((b) => b.document_number));
    if (!found.size) return;
    setNumbers((prev) => {
      const next = { ...prev };
      for (const b of bills) {
        const n = found.get(b.document_number);
        if (n) next[b.id] = n;
      }
      return next;
    });
  };

  const digitsOf = (id: string) => (numbers[id] ?? "").replace(/\s/g, "");
  const ready = bills.filter((b) => /^\d{12}$/.test(digitsOf(b.id)) && !results[b.id]?.ok);
  const invalid = bills.filter((b) => digitsOf(b.id) && !/^\d{12}$/.test(digitsOf(b.id)));
  const pastedMatches = useMemo(
    () => (pasted ? parsePastedNumbers(pasted, bills.map((b) => b.document_number)).size : 0),
    [pasted, bills],
  );

  const save = async () => {
    setSaving(true);
    const { data, errorMessage } = await invokeEdgeFunction<{ results: { eway_bill_id: string; ok: boolean; error?: string }[] }>(
      "eway-bill-actions",
      {
        action: "record_bulk",
        entries: ready.map((b) => ({
          eway_bill_id: b.id,
          ewb_number: digitsOf(b.id),
          ewb_date: generatedAt ? new Date(generatedAt).toISOString() : null,
        })),
      },
    );
    setSaving(false);
    if (errorMessage || !data) {
      toast.error(errorMessage ?? "Couldn't save");
      return;
    }
    const next = { ...results };
    for (const r of data.results) next[r.eway_bill_id] = { ok: r.ok, error: r.error };
    setResults(next);
    const okCount = data.results.filter((r) => r.ok).length;
    const failed = data.results.length - okCount;
    if (okCount) onSaved();
    if (failed) toast.error(`${okCount} saved, ${failed} not - see the list`);
    else {
      toast.success(`${okCount} e-way bill${okCount === 1 ? "" : "s"} saved - boutiques and warehouse told`);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={openDialog} disabled={!bills.length}>
        <ListChecks className="h-3.5 w-3.5" /> Enter numbers ({bills.length})
      </Button>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enter e-way bill numbers</DialogTitle>
          <DialogDescription>
            Paste the portal's result after the bulk upload (any text with the document number and the 12-digit number on
            one line), or type each number. Each boutique is emailed as soon as its number is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="ewb-paste">Paste from the portal</Label>
          <Textarea
            id="ewb-paste"
            rows={4}
            className="font-mono text-xs"
            placeholder={"AB0001/2627/0012   331012345678   06/11/2026 ...\nAB0002C2627/0003  331012345679 ..."}
            value={pasted}
            onChange={(e) => applyPaste(e.target.value)}
          />
          {pasted && (
            <p className="text-xs text-muted-foreground">
              Matched {pastedMatches} of {bills.length} by document number.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-[220px] gap-1">
          <Label htmlFor="ewb-bulk-date">Generated on (for all)</Label>
          <Input id="ewb-bulk-date" type="datetime-local" value={generatedAt} onChange={(e) => setGeneratedAt(e.target.value)} />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>E-way bill number</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((b) => {
                const r = results[b.id];
                const bad = digitsOf(b.id) && !/^\d{12}$/.test(digitsOf(b.id));
                return (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs">
                      {orderRefOf(b.order_id)}
                      <div className="text-muted-foreground">{b.vendorName}</div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{b.document_number}</TableCell>
                    <TableCell className="text-xs">{formatMoney(b.value)}</TableCell>
                    <TableCell>
                      <Input
                        className={`h-8 text-xs font-mono w-[170px] ${bad ? "border-destructive" : ""}`}
                        inputMode="numeric"
                        placeholder="12 digits"
                        value={numbers[b.id] ?? ""}
                        disabled={r?.ok}
                        onChange={(e) => setNumbers((n) => ({ ...n, [b.id]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      {r?.ok && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      {r && !r.ok && (
                        <span className="text-destructive inline-flex items-start gap-1 max-w-[220px]">
                          <XCircle className="h-4 w-4 shrink-0" /> {r.error}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {invalid.length > 0 && <p className="text-xs text-destructive">{invalid.length} number(s) aren't 12 digits.</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Close
          </Button>
          <Button onClick={save} disabled={!ready.length || saving || invalid.length > 0}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save {ready.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- PDFs ----------

// The bill a downloaded PDF belongs to, from its file name: the 12-digit
// e-way bill number, or the document number (with / written as - or _).
function matchFile(name: string, bills: AdminEwayBill[]): AdminEwayBill | null {
  const upper = name.toUpperCase();
  const digits = upper.match(/(?<!\d)\d{12}(?!\d)/g) ?? [];
  for (const d of digits) {
    const hit = bills.find((b) => b.ewb_number === d);
    if (hit) return hit;
  }
  const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const squashedName = squash(name);
  const byDoc = [...bills]
    .sort((a, b) => b.document_number.length - a.document_number.length)
    .find((b) => squashedName.includes(squash(b.document_number)));
  return byDoc ?? null;
}

// The PDFs downloaded from the portal, many at once. Matched to their
// e-way bill by file name; anything unmatched is picked by hand.
export function EwayBillPdfUploadDialog({ bills, onSaved }: { bills: AdminEwayBill[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<{ file: File; billId: string }[]>([]);
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [uploading, setUploading] = useState(false);

  const openDialog = () => {
    setFiles([]);
    setResults({});
    setOpen(true);
  };

  const pick = (list: FileList | null) => {
    if (!list) return;
    setResults({});
    setFiles(Array.from(list).map((file) => ({ file, billId: matchFile(file.name, bills)?.id ?? "" })));
  };

  const assigned = files.filter((f) => f.billId);
  const duplicates = assigned.length !== new Set(assigned.map((f) => f.billId)).size;

  const upload = async () => {
    setUploading(true);
    const next: Record<string, RowResult> = {};
    for (const f of assigned) {
      const bill = bills.find((b) => b.id === f.billId)!;
      const error = await uploadEwayBillPdf(bill, f.file);
      next[f.file.name] = error ? { ok: false, error } : { ok: true };
      setResults({ ...next });
    }
    setUploading(false);
    const okCount = Object.values(next).filter((r) => r.ok).length;
    if (okCount) onSaved();
    if (okCount === assigned.length) {
      toast.success(`${okCount} PDF${okCount === 1 ? "" : "s"} attached - boutiques can print them`);
      setOpen(false);
    } else toast.error("Some PDFs weren't attached - see the list");
  };

  const label = (b: AdminEwayBill) =>
    `${orderRefOf(b.order_id)} · ${b.vendorName} · ${b.document_number}${b.ewb_number ? ` · ${formatEwbNumber(b.ewb_number)}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={openDialog} disabled={!bills.length}>
        <FileUp className="h-3.5 w-3.5" /> Upload PDFs
      </Button>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Attach e-way bill PDFs</DialogTitle>
          <DialogDescription>
            Select the PDFs printed from the portal. They're matched by the e-way bill number (or document number) in the
            file name; pick any that aren't. The boutique can then download and print its copy.
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept="application/pdf" multiple onChange={(e) => pick(e.target.files)} />
        {files.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>E-way bill</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f, idx) => {
                  const r = results[f.file.name];
                  return (
                    <TableRow key={`${f.file.name}-${idx}`}>
                      <TableCell className="text-xs break-all max-w-[200px]">{f.file.name}</TableCell>
                      <TableCell>
                        <Select
                          value={f.billId}
                          onValueChange={(v) => setFiles((list) => list.map((x, i) => (i === idx ? { ...x, billId: v } : x)))}
                        >
                          <SelectTrigger className="h-8 text-xs w-[340px] max-w-full">
                            <SelectValue placeholder="Not matched - pick the e-way bill" />
                          </SelectTrigger>
                          <SelectContent>
                            {bills.map((b) => (
                              <SelectItem key={b.id} value={b.id} className="text-xs">
                                {label(b)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r?.ok && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        {r && !r.ok && <span className="text-destructive">{r.error}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {duplicates && <p className="text-xs text-destructive">Two files are matched to the same e-way bill.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Close
          </Button>
          <Button onClick={upload} disabled={!assigned.length || uploading || duplicates}>
            {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Attach {assigned.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
