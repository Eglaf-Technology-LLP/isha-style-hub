import { StyleSheet, Text, View } from 'react-native';
import { LEGAL_PATHS } from '@/content/legal';
import { formatDateInWordsWithDay } from '@/lib/dates';
import { CUSTOMER_CANCEL_WINDOW_HOURS } from '@/lib/orders';
import { returnWindowAdjective } from '@/lib/settings';
import { useShipsBy } from '@/lib/shipsBy';
import { CartItem } from '@/lib/stores';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

// Under each piece in checkout's order summary, before paying: its rules
// (the website's CheckoutLineRules, client corrections Part 2, A23.2) -
// "Made to Order · ships by …", "Not returnable" or "24-hour returns", and
// "COD not available". A sold-out size made to order already has its own
// note (made to order, no Cash on Delivery) just above, so only its ship-by
// date and returns are added here.
export interface LineRules {
  madeToOrder: boolean;
  soldOutMadeToOrder: boolean;
  returnable: boolean;
  returnHours: number;
  codAvailable: boolean;
}

export function CheckoutLineRules({
  item,
  rules,
}: {
  item: CartItem;
  rules: LineRules;
}) {
  // When a made-to-order line ships: the same server estimate as the
  // product page's, without a PIN code, with the customisation / sold-out
  // days in it. Nothing until it's back.
  const { data: shipsByDate } = useShipsBy(item.vendorId, item.productId, {
    enabled: rules.madeToOrder || rules.soldOutMadeToOrder,
    soldOutMadeToOrder: rules.soldOutMadeToOrder,
    customised: !!item.customisation,
  });
  const shipsBy = shipsByDate
    ? `ships by ${formatDateInWordsWithDay(shipsByDate)}`
    : null;
  const parts = [
    rules.soldOutMadeToOrder
      ? shipsBy && `${shipsBy[0].toUpperCase()}${shipsBy.slice(1)}`
      : rules.madeToOrder &&
        ['Made to Order', shipsBy].filter(Boolean).join(' · '),
    rules.returnable
      ? `${returnWindowAdjective(rules.returnHours)} returns`
      : 'Not returnable',
    !rules.codAvailable && !rules.soldOutMadeToOrder && 'COD not available',
  ].filter((p): p is string => !!p);

  return <Text style={styles.rules}>{parts.join(' · ')}</Text>;
}

// Above the Pay / Place order button (the website's CheckoutTermsNote,
// client corrections Part 2, A23.1): what the customer agrees to, with
// links, and the cancellation rule - no cancellation fee (decided 24 Nov
// 2026). The policies open over checkout, so it isn't lost. `compact` (the
// bottom bar) leaves out the cancellation rule.
export function CheckoutTermsNote({ compact = false }: { compact?: boolean }) {
  const go = useGo();
  const link = (path: string, label: string) => (
    <Text
      style={styles.link}
      onPress={() => go(path)}
      accessibilityRole="link"
      suppressHighlighting
    >
      {label}
    </Text>
  );
  return (
    <View style={styles.terms}>
      <Text style={[styles.termsText, compact && styles.compact]}>
        By placing this order you agree to the{' '}
        {link(LEGAL_PATHS.terms, 'Terms & Conditions')},{' '}
        {link(LEGAL_PATHS.returns, 'Return & Refund Policy')} and{' '}
        {link(LEGAL_PATHS.privacy, 'Privacy Policy')}.
      </Text>
      {!compact ? (
        <Text style={styles.termsText}>
          You can cancel within {CUSTOMER_CANCEL_WINDOW_HOURS} hours of placing
          the order - no cancellation fee, full refund. If the boutique or
          AllBoutiqs cancels it, you get a full refund too.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rules: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  terms: { gap: 6 },
  termsText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mutedForeground,
  },
  compact: { fontSize: 10, lineHeight: 14 },
  link: { textDecorationLine: 'underline', color: colors.mutedForeground },
});
