import { ReactNode } from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { isMulticolour, MULTICOLOUR, swatchColor } from '@/lib/colors';
import { colors, fonts } from '@/theme';
import { Touch } from './ui';

// The product page's colours when any colour has its own photo (website
// OptionPicker, 1cc399b): every colour is a small box - its variant's first
// photo, or its colour where it has none - with the name below. A photo
// carries its colour as a dot in the corner.
export function ColourBoxes({
  options,
  selected,
  onSelect,
  thumbnails,
  swatches,
  unavailable,
}: {
  options: string[];
  selected: string | null;
  onSelect: (colour: string) => void;
  // A photo of each colour, by colour name.
  thumbnails: Record<string, string>;
  // Colour codes the boutique picked, by colour name.
  swatches: Record<string, string>;
  // Colours with nothing in stock (still selectable).
  unavailable?: Set<string>;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map(option => {
        const active = selected === option;
        const out = !!unavailable?.has(option);
        const photo = thumbnails[option];
        const multi = isMulticolour(option);
        const hex = swatches[option] ?? swatchColor(option);
        return (
          <Touch
            key={option}
            haptic
            onPress={() => onSelect(option)}
            style={styles.item}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${option}${out ? ' (out of stock)' : ''}`}
          >
            <View style={[styles.box, active && styles.boxActive]}>
              {photo ? (
                <Image
                  source={{ uri: photo }}
                  style={[styles.fill, out && styles.faded]}
                  resizeMode="cover"
                />
              ) : (
                <Swatch
                  hex={hex}
                  multi={multi}
                  style={[styles.fill, styles.swatchBorder, out && styles.faded]}
                >
                  {!hex && !multi ? (
                    <Text style={styles.initial}>{option.charAt(0)}</Text>
                  ) : null}
                </Swatch>
              )}
              {photo && (hex || multi) ? (
                <Swatch hex={hex} multi={multi} style={styles.dot} />
              ) : null}
              {out ? <View style={styles.strike} /> : null}
            </View>
            <Text
              numberOfLines={2}
              style={[
                styles.label,
                active && styles.labelActive,
                out && styles.labelOut,
              ]}
            >
              {option}
            </Text>
          </Touch>
        );
      })}
    </View>
  );
}

// One colour, or a soft rainbow for "Multicolour".
function Swatch({
  hex,
  multi,
  style,
  children,
}: {
  hex: string | null;
  multi: boolean;
  style: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  if (multi) {
    return (
      <View style={[style, styles.stripes]}>
        {MULTICOLOUR.map(c => (
          <View key={c} style={[styles.stripe, { backgroundColor: c }]} />
        ))}
      </View>
    );
  }
  return (
    <View style={[style, { backgroundColor: hex ?? colors.muted }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  item: { width: 64, alignItems: 'center', gap: 6 },
  box: {
    width: 56,
    height: 76,
    padding: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.foreground },
  fill: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swatchBorder: { borderWidth: 1, borderColor: 'rgba(35,31,26,0.15)' },
  faded: { opacity: 0.4 },
  initial: {
    fontFamily: fonts.sans,
    fontSize: 10,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  dot: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.ivory,
    overflow: 'hidden',
  },
  stripes: { flexDirection: 'row' },
  stripe: { flex: 1 },
  strike: {
    position: 'absolute',
    width: 64,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(35,31,26,0.6)',
    transform: [{ rotate: '-54deg' }],
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center',
    color: colors.mutedForeground,
  },
  labelActive: { fontFamily: fonts.sansMedium, color: colors.foreground },
  labelOut: { textDecorationLine: 'line-through' },
});
