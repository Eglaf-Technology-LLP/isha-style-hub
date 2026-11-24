import { useQuery } from '@tanstack/react-query';
import { FileMinus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COMPANY } from '@/content/company';
import { formatDateInWords } from '@/lib/dates';
import { invoiceLineDescription } from '@/lib/invoiceLine';
import { amountInWords } from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { Sheet } from './Listing';
import { Eyebrow, Sans, Serif, Touch } from './ui';

// The boutique's GST credit note(s) on one part of an order - the website's
// CreditNoteButton (fcd0580). The database issues them when an invoiced part
// is cancelled or comes back undelivered, or a return completes
// (credit_note_on_part_cancelled / credit_note_on_return_completed); a
// customer reads the ones on their own orders. Shown in the tax invoice's
// layout, with the same closing line. The link shows only when the part
// has one.

interface CreditNoteLine {
  line_no: number;
  description: string;
  hsn_code: string | null;
  quantity: number;
  taxable_value: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total: number;
}

interface CreditNote {
  id: string;
  credit_note_number: string;
  issued_at: string;
  reason: string | null;
  order_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  seller_name: string;
  seller_legal_name: string | null;
  seller_gstin: string | null;
  seller_state_code: string | null;
  billing_name: string | null;
  billing_state: string | null;
  place_of_supply_code: string | null;
  supply_type: 'intra_state' | 'inter_state' | null;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total: number;
  credit_note_lines: CreditNoteLine[];
}

const REASON_LABEL: Record<string, string> = {
  cancelled: 'Order cancelled',
  return: 'Goods returned',
  undelivered: 'Not delivered',
};

const money = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function useCreditNotes(vendorOrderId: string, enabled = true) {
  return useQuery({
    queryKey: ['credit-notes', vendorOrderId],
    enabled,
    queryFn: async (): Promise<CreditNote[]> => {
      const { data, error } = await supabase
        .from('credit_notes')
        .select(
          'id, credit_note_number, issued_at, reason, order_id, invoice_number, invoice_date, seller_name, seller_legal_name, seller_gstin, seller_state_code, billing_name, billing_state, place_of_supply_code, supply_type, taxable_value, cgst_amount, sgst_amount, igst_amount, total, credit_note_lines(line_no, description, hsn_code, quantity, taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, total)',
        )
        .eq('vendor_order_id', vendorOrderId)
        .order('issued_at');
      if (error) throw error;
      return (data ?? []) as unknown as CreditNote[];
    },
  });
}

// "Credit note" next to the tax invoice; nothing while the part has none.
export function CreditNoteLink({ vendorOrderId }: { vendorOrderId: string }) {
  const { data: notes = [] } = useCreditNotes(vendorOrderId);
  const [open, setOpen] = useState(false);
  if (!notes.length) return null;
  return (
    <>
      <Touch style={styles.link} onPress={() => setOpen(true)}>
        <FileMinus size={15} color={colors.primary} />
        <Text style={styles.linkText}>Credit note</Text>
      </Touch>
      <Sheet
        visible={open}
        title="Credit Note"
        onClose={() => setOpen(false)}
        scroll
      >
        {notes.map(n => (
          <CreditNoteView key={n.id} note={n} />
        ))}
        <Sans style={styles.foot}>
          To print or save as PDF, open My orders on the AllBoutiqs website.
        </Sans>
      </Sheet>
    </>
  );
}

function CreditNoteView({ note }: { note: CreditNote }) {
  const intra = note.supply_type !== 'inter_state';
  const lines = [...(note.credit_note_lines ?? [])].sort(
    (a, b) => a.line_no - b.line_no,
  );
  return (
    <View style={styles.note}>
      <Serif style={styles.title}>Credit Note</Serif>
      <Sans style={styles.text}>Original for recipient</Sans>
      <View style={styles.gap}>
        <Row label="Credit Note No" value={note.credit_note_number} />
        <Row label="Date" value={formatDateInWords(note.issued_at)} />
        {note.invoice_number ? (
          <Row
            label="Against invoice"
            value={`${note.invoice_number}${
              note.invoice_date
                ? ` · ${formatDateInWords(note.invoice_date)}`
                : ''
            }`}
          />
        ) : null}
        <Row label="Order No" value={note.order_id.slice(0, 8).toUpperCase()} />
        {note.reason ? (
          <Row
            label="Reason"
            value={REASON_LABEL[note.reason] ?? note.reason}
          />
        ) : null}
      </View>

      <Eyebrow style={[styles.head, styles.gapTop]}>Issued by (seller)</Eyebrow>
      <Text style={styles.strong}>
        {note.seller_legal_name ?? note.seller_name}
      </Text>
      {note.seller_legal_name ? (
        <Sans style={styles.text}>
          Boutique / Brand Name: {note.seller_name}
        </Sans>
      ) : null}
      {note.seller_state_code ? (
        <Sans style={styles.text}>State code: {note.seller_state_code}</Sans>
      ) : null}
      {note.seller_gstin ? (
        <Sans style={styles.text}>GSTIN: {note.seller_gstin}</Sans>
      ) : null}
      <Eyebrow style={[styles.head, styles.gapTop]}>To</Eyebrow>
      <Text style={styles.strong}>{note.billing_name ?? '—'}</Text>
      {note.billing_state ? (
        <Sans style={styles.text}>State: {note.billing_state}</Sans>
      ) : null}
      {note.place_of_supply_code ? (
        <Sans style={styles.text}>
          Place of supply: {note.place_of_supply_code}
        </Sans>
      ) : null}

      <View style={styles.gapTop}>
        {lines.map(l => (
          <View key={l.line_no} style={styles.line}>
            <Text style={styles.strong}>
              {invoiceLineDescription(l.description)}
            </Text>
            <Sans style={styles.text}>
              {l.hsn_code ? `HSN ${l.hsn_code} · ` : ''}Qty {l.quantity}
            </Sans>
            <Row label="Taxable value" value={money(l.taxable_value)} />
            {intra ? (
              <>
                <Row
                  label={`CGST ${Number(l.gst_rate) / 2}%`}
                  value={money(l.cgst_amount)}
                />
                <Row
                  label={`SGST ${Number(l.gst_rate) / 2}%`}
                  value={money(l.sgst_amount)}
                />
              </>
            ) : (
              <Row
                label={`IGST ${Number(l.gst_rate)}%`}
                value={money(l.igst_amount)}
              />
            )}
            <Row label="Total" value={money(l.total)} strong />
          </View>
        ))}
      </View>

      <View style={styles.gapTop}>
        <Row label="Taxable value" value={money(note.taxable_value)} />
        {intra ? (
          <>
            <Row label="CGST" value={money(note.cgst_amount)} />
            <Row label="SGST" value={money(note.sgst_amount)} />
          </>
        ) : (
          <Row label="IGST" value={money(note.igst_amount)} />
        )}
        <View style={styles.rule} />
        <Row
          label="Total credit (incl. GST)"
          value={money(note.total)}
          strong
        />
        <Sans style={styles.words}>{amountInWords(note.total)}</Sans>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footStrong}>
          Sold through {COMPANY.legalName}, GSTIN {COMPANY.gstin}
        </Text>
        <Sans style={styles.footText}>
          Subject to {COMPANY.jurisdiction} jurisdiction.
        </Sans>
        {/* The tax invoice's CA-approved closing line, for a credit note
            (client corrections Part 2, A10.4; 24 Nov 2026). */}
        <Sans style={styles.footText}>
          This is a computer-generated credit note issued electronically on
          behalf of the seller by AllBoutiqs Private Limited (e-commerce
          operator). No signature is required.
        </Sans>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Sans style={[styles.rowLabel, strong && styles.strong]}>{label}</Sans>
      <Sans style={[styles.rowValue, strong && styles.strong]}>{value}</Sans>
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
  },
  linkText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.primary,
  },
  note: {
    paddingBottom: 16,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 22 },
  head: { color: colors.foreground, marginBottom: 4 },
  gap: { marginTop: 10 },
  gapTop: { marginTop: 14 },
  strong: { fontFamily: fonts.sansSemi, color: colors.foreground },
  text: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground },
  line: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 2,
  },
  rowLabel: { color: colors.mutedForeground },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  words: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 6,
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  footStrong: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.foreground,
  },
  footText: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  foot: {
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: 8,
  },
});
