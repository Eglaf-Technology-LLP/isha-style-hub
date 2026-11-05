import { ReactNode } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import { tap } from '@/lib/haptics';
import { colors, eyebrow, fonts } from '@/theme';

export function Serif({ style, ...p }: TextProps) {
  return (
    <Text
      {...p}
      style={[{ fontFamily: fonts.serif, color: colors.foreground }, style]}
    />
  );
}

export function Sans({ style, ...p }: TextProps) {
  return (
    <Text
      {...p}
      style={[
        { fontFamily: fonts.sans, color: colors.foreground, fontSize: 14 },
        style,
      ]}
    />
  );
}

export function Eyebrow({ style, ...p }: TextProps) {
  return <Text {...p} style={[eyebrow, style]} />;
}

// A Pressable that dims and shrinks a touch while held - the "native feel".
export function Touch({
  style,
  haptic,
  onPress,
  ...p
}: PressableProps & { style?: StyleProp<ViewStyle>; haptic?: boolean }) {
  return (
    <Pressable
      {...p}
      onPress={e => {
        if (haptic) tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        style,
        pressed && { opacity: 0.7, transform: [{ scale: 0.985 }] },
      ]}
    />
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
  icon,
}: {
  label: string;
  onPress?: () => void;
  // light: outline on a dark (maroon) band.
  variant?: 'primary' | 'outline' | 'dark' | 'light';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
}) {
  const bg = disabled
    ? colors.muted
    : variant === 'primary'
    ? colors.primary
    : variant === 'dark'
    ? colors.ink
    : 'transparent';
  const fg = disabled
    ? colors.mutedForeground
    : variant === 'outline'
    ? colors.foreground
    : colors.primaryForeground;
  return (
    <Touch
      haptic
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      style={[
        s.button,
        { backgroundColor: bg },
        (variant === 'outline' || variant === 'light') && {
          borderWidth: 1,
          borderColor: variant === 'light' ? colors.ivory : colors.foreground,
        },
        style,
      ]}
    >
      {icon}
      <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
    </Touch>
  );
}

// The website's BrandPlaceholder: ivory, fine gold frame, a serif initial.
export function Placeholder({
  label,
  dark,
  style,
}: {
  label: string;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        s.placeholder,
        dark && { backgroundColor: colors.maroonDeep },
        style,
      ]}
    >
      <View
        style={[s.placeholderFrame, dark && { borderColor: colors.goldSoft }]}
      />
      <Serif
        style={{ fontSize: 28, color: dark ? colors.ivory : colors.primary }}
        numberOfLines={1}
      >
        {label}
      </Serif>
    </View>
  );
}

export function SectionHeader({
  eyebrowText,
  title,
  accent,
  action,
  onAction,
}: {
  eyebrowText?: string;
  title: string;
  accent?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.section}>
      <View style={{ flex: 1 }}>
        {eyebrowText ? <Eyebrow>{eyebrowText}</Eyebrow> : null}
        <Serif style={{ fontSize: 26, marginTop: 4 }}>
          {title}
          {accent ? (
            <Text
              style={{ fontFamily: fonts.serifItalic, color: colors.primary }}
            >
              {' '}
              {accent}
            </Text>
          ) : null}
        </Serif>
      </View>
      {action ? (
        <Touch onPress={onAction} hitSlop={10}>
          <Text style={s.action}>{action}</Text>
        </Touch>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    height: 50,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 2,
  },
  buttonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  placeholder: {
    flex: 1,
    backgroundColor: colors.ivory,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  placeholderFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 8,
    borderWidth: 1,
    borderColor: colors.goldSoft,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  action: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.primary,
  },
});
