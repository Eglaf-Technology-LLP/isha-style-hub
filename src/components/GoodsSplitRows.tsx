import { formatMoney } from "@/lib/format";
import type { GoodsSplit } from "@/lib/orderAmounts";

interface GoodsSplitRowsProps {
  split: GoodsSplit;
  format?: (amount: number) => string;
  // Inside a <dl>: rows of <dt>/<dd>.
  list?: boolean;
  // Short labels, for a table cell.
  compact?: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

// The items' price as product value, customisation charge (when there is
// one) and GST, on separate lines - for every order summary (see
// src/lib/orderAmounts.ts).
export function GoodsSplitRows({
  split,
  format = formatMoney,
  list = false,
  compact = false,
  className = "flex justify-between gap-4",
  labelClassName = "text-muted-foreground",
  valueClassName,
}: GoodsSplitRowsProps) {
  const rows: [string, number][] = [
    // As checkout words it ("Product value", then "GST").
    ["Product value", split.productValue],
    ...(split.customisation > 0
      ? ([[compact ? "Customisation" : "Customisation charge (excl. GST)", split.customisation]] as [string, number][])
      : []),
    ["GST", split.gst],
  ];
  const Term = list ? "dt" : "span";
  const Value = list ? "dd" : "span";
  return (
    <>
      {rows.map(([label, amount]) => (
        <div key={label} className={className}>
          <Term className={labelClassName}>{label}</Term>
          <Value className={valueClassName}>{format(amount)}</Value>
        </div>
      ))}
    </>
  );
}
