import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { INDIAN_STATES } from '@/lib/account';
import {
  ADDRESS_LINE1_HINT,
  ADDRESS_LINE1_MIN,
  addressLine1Count,
} from '@/lib/addressLine1';
import { colors, fonts } from '@/theme';
import { Sheet } from './Listing';
import { Touch } from './ui';

// A labelled text field in the storefront style (square, ivory).
export function Field({
  label,
  required,
  hint,
  ...input
}: TextInputProps & { label: string; required?: boolean; hint?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        {...input}
        style={[
          styles.input,
          input.multiline && styles.multi,
          input.editable === false && styles.readOnly,
          input.style,
        ]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

// Address line 1 with the courier minimum (the website's AddressLine1Input):
// red, with a live count ("6/10"), until it has ADDRESS_LINE1_MIN characters
// (spaces at the ends not counted), then a tick. The one field every address
// form in the app uses; each form also locks its Save / Place order button
// with addressLine1Ok().
export function AddressLine1Field({
  value,
  onChange,
  onBlur,
  ...input
}: Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  const count = addressLine1Count(value);
  const short = count < ADDRESS_LINE1_MIN;
  // Red once something is typed, or when it was left empty.
  const red = short && (count > 0 || touched);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Address line 1 *</Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        {...input}
        value={value}
        onChangeText={onChange}
        onBlur={e => {
          onBlur?.(e);
          setTouched(true);
        }}
        accessibilityHint={ADDRESS_LINE1_HINT}
        style={[styles.input, red && styles.inputBad, input.style]}
      />
      <View style={styles.hintRow}>
        <Text style={[styles.hint, styles.flex, red && styles.bad]}>
          {ADDRESS_LINE1_HINT}
        </Text>
        {short ? (
          <Text style={[styles.hint, styles.count, red && styles.countBad]}>
            {count}/{ADDRESS_LINE1_MIN}
          </Text>
        ) : (
          <Check
            size={15}
            color={colors.success}
            style={styles.tick}
            accessibilityLabel="Long enough"
          />
        )}
      </View>
    </View>
  );
}

// The state, picked from the exact list invoices use (no free text).
export function StatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>State *</Text>
      <Touch
        style={[styles.input, styles.select]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <Text style={[styles.selectText, !value && styles.placeholder]}>
          {value || 'Choose state'}
        </Text>
        <ChevronDown size={18} color={colors.mutedForeground} />
      </Touch>
      <Sheet visible={open} title="State" onClose={() => setOpen(false)} scroll>
        {INDIAN_STATES.map(s => (
          <Touch
            key={s}
            style={styles.option}
            onPress={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            <Text style={[styles.optionText, s === value && styles.optionOn]}>
              {s}
            </Text>
            {s === value ? <Check size={17} color={colors.primary} /> : null}
          </Touch>
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
    marginBottom: 7,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  multi: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
  readOnly: { backgroundColor: colors.muted, color: colors.mutedForeground },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 5,
  },
  flex: { flex: 1 },
  inputBad: { borderColor: colors.destructive },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bad: { color: colors.destructive },
  count: { fontVariant: ['tabular-nums'] },
  countBad: { fontFamily: fonts.sansMedium, color: colors.destructive },
  tick: { marginTop: 5 },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  placeholder: { color: colors.mutedForeground },
  option: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  optionOn: { color: colors.primary, fontFamily: fonts.sansMedium },
});
