import { Scissors } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { madeToOrderLineNote, SoldOutTerms } from '@/lib/soldOutMadeToOrder';
import { colors, fonts } from '@/theme';

// A bag / checkout line for a sold-out size the boutique makes to order
// (the website's MadeToOrderLineNote): a "Made to order" tag, then "This
// size is sold out, so the boutique makes it for you · +₹210 (10%) per
// piece · 5 extra days · no Cash on Delivery".
export function MadeToOrderLineNote({
  terms,
}: {
  terms: SoldOutTerms | null | undefined;
}) {
  if (!terms) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Scissors size={11} color={colors.foreground} strokeWidth={1.8} />
        <Text style={styles.badgeText}>Made to order</Text>
      </View>
      <Text style={styles.text}>{madeToOrderLineNote(terms)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, gap: 3 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(181,138,74,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  text: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.mutedForeground,
  },
});
