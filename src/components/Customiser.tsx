import { Check, Scissors } from 'lucide-react-native';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  buildCustomisation,
  chargeLabel,
  customisationCharge,
  customisationPrice,
  CustomisationChoice,
  CustomiserState,
  measurementLabel,
  MEASUREMENTS,
  ProductCustomisationSetup,
} from '@/lib/customisation';
import { formatINR } from '@/lib/format';
import { colors, fonts } from '@/theme';
import { Touch } from './ui';

// Product page: the customer asks for this piece to be customised - made to
// their measurements and/or with a note - and sees exactly what it adds:
// the boutique's % of the piece's price, in whole rupees ("+₹6,700 (10%) ·
// Adds 3 extra days · Total 38 days"). The website's ProductCustomiser,
// without the priced options and reference photo it hides too.
export function Customiser({
  setup,
  baseDays,
  basePrice,
  value,
  onChange,
}: {
  setup: ProductCustomisationSetup;
  // The making / dispatch days the product page shows, for "Total T days".
  baseDays?: number | null;
  basePrice: number;
  value: CustomiserState;
  onChange: (next: CustomiserState) => void;
}) {
  if (!setup.customisable) return null;
  const set = <K extends keyof CustomiserState>(k: K, v: CustomiserState[K]) =>
    onChange({ ...value, [k]: v });

  const preview = buildCustomisation(setup, value, basePrice);
  // One charge for the piece, whatever is customised.
  const charge = customisationCharge(basePrice, setup.customisation_pct);
  const extraDays = setup.customisation_days ?? 0;
  const summary = [
    chargeLabel(charge, setup.customisation_pct),
    extraDays > 0
      ? `Adds ${extraDays} extra day${extraDays === 1 ? '' : 's'}`
      : null,
    extraDays > 0 && baseDays != null && baseDays > 0
      ? `Total ${baseDays + extraDays} days`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Scissors size={16} color={colors.primary} strokeWidth={1.7} />
            <Text style={styles.title}>Customise this piece</Text>
          </View>
          <Text style={styles.muted}>
            Made to your measurements or with the changes you choose.
          </Text>
          <Text style={styles.summary}>{summary}</Text>
        </View>
        <Switch
          accessibilityLabel="Customise this piece"
          value={value.enabled}
          onValueChange={v => set('enabled', v)}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.ivory}
        />
      </View>

      {value.enabled ? (
        <View style={styles.body}>
          <Touch
            style={styles.checkRow}
            onPress={() => set('customSize', !value.customSize)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value.customSize }}
          >
            <View style={[styles.box, value.customSize && styles.boxOn]}>
              {value.customSize ? (
                <Check size={13} color={colors.primaryForeground} />
              ) : null}
            </View>
            <Text style={styles.text}>Make it to my measurements</Text>
          </Touch>
          {value.customSize ? (
            <View style={styles.measureBox}>
              <Text style={styles.small}>
                In inches, measured over light clothing. * required
              </Text>
              <View style={styles.grid}>
                {MEASUREMENTS.map(m => (
                  <View key={m.key} style={styles.cell}>
                    <Text style={styles.label}>
                      {m.label}
                      {m.required ? ' *' : ''}
                    </Text>
                    <TextInput
                      value={value.measurements[m.key] ?? ''}
                      onChangeText={t =>
                        set('measurements', {
                          ...value.measurements,
                          [m.key]: t.replace(/[^0-9.]/g, '').slice(0, 5),
                        })
                      }
                      keyboardType="decimal-pad"
                      placeholder="in"
                      placeholderTextColor={colors.mutedForeground}
                      accessibilityLabel={m.label}
                      style={styles.input}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View>
            <Text style={styles.text}>
              Anything else? <Text style={styles.muted}>(optional)</Text>
            </Text>
            <TextInput
              value={value.note}
              onChangeText={t => set('note', t)}
              multiline
              maxLength={1000}
              placeholder="e.g. Keep the neckline a little higher"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, styles.note]}
            />
          </View>

          <View style={styles.sums}>
            <View style={styles.sumRow}>
              <Text style={styles.muted}>Price</Text>
              <Text style={styles.text}>{formatINR(basePrice)}</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.muted}>
                Customisation ({setup.customisation_pct}%)
              </Text>
              <Text style={styles.text}>+{formatINR(charge)}</Text>
            </View>
            <View style={[styles.sumRow, styles.sumTotal]}>
              <Text style={styles.bold}>You pay (each)</Text>
              <Text style={styles.bold}>{formatINR(basePrice + charge)}</Text>
            </View>
          </View>
          <Text style={styles.small}>
            Customised pieces are not returnable (a damaged, defective or wrong
            item can be reported within 24 hours of delivery).
          </Text>
          {'error' in preview && value.customSize ? (
            <Text style={[styles.small, styles.error]}>{preview.error}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// What the customer asked for on a customised bag or order line: the
// charge, their measurements and note (the website's CustomisationDetails).
export function CustomisationDetails({
  customisation,
}: {
  customisation: CustomisationChoice | null | undefined;
}) {
  const c = customisation;
  if (!c) return null;
  const order = (k: string) => {
    const i = MEASUREMENTS.findIndex(m => m.key === k);
    return i === -1 ? MEASUREMENTS.length : i;
  };
  const measurements = Object.entries(c.custom_size?.measurements ?? {})
    .filter(([, v]) => String(v).trim())
    .sort(([a], [b]) => order(a) - order(b));
  const price = customisationPrice(c);
  return (
    <View style={styles.details}>
      <View style={styles.titleRow}>
        <Scissors size={12} color={colors.foreground} strokeWidth={1.8} />
        <Text style={styles.detailsTitle}>Customised</Text>
        {price > 0 ? (
          <Text style={styles.small}>({chargeLabel(price, c.pct)} each)</Text>
        ) : null}
      </View>
      {c.custom_size ? <Text style={styles.small}>Custom size</Text> : null}
      {(c.options ?? []).map(o => (
        <Text key={o.id} style={styles.small}>
          {o.label}
        </Text>
      ))}
      {measurements.length ? (
        <Text style={styles.small}>
          {measurements
            .map(([k, v]) => `${measurementLabel(k)} ${v}"`)
            .join(' · ')}
        </Text>
      ) : null}
      {c.note ? <Text style={styles.small}>Note: {c.note}</Text> : null}
      {c.days > 0 ? (
        <Text style={styles.small}>
          Takes {c.days} extra day{c.days === 1 ? '' : 's'} to make
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    padding: 14,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.foreground,
  },
  summary: {
    marginTop: 4,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.foreground,
  },
  body: {
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  measureBox: { backgroundColor: colors.muted, padding: 12, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '48%', gap: 4 },
  label: { fontFamily: fonts.sans, fontSize: 12, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
  },
  note: { marginTop: 6, minHeight: 64, textAlignVertical: 'top' },
  sums: { backgroundColor: colors.muted, padding: 12, gap: 4 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 4,
  },
  text: { fontFamily: fonts.sans, fontSize: 14, color: colors.foreground },
  bold: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.foreground },
  muted: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.mutedForeground,
  },
  small: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.mutedForeground,
  },
  error: { color: colors.destructive },
  details: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    backgroundColor: colors.accent,
    padding: 8,
    gap: 2,
  },
  detailsTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.foreground,
  },
});
