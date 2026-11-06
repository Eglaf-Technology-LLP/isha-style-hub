import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/lib/toast';
import { colors, fonts } from '@/theme';

// The bottom toast: slides up, stays 3 seconds (5 for long ones), fades away.
// Sits above the tab bar and the sticky bottom bars.
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const { message, id, long, hide } = useToast();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    const t = setTimeout(
      () => {
        Animated.timing(anim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => hide());
      },
      long ? 5000 : 3000,
    );
    return () => clearTimeout(t);
  }, [id, message, long, anim, hide]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        { bottom: insets.bottom + 76 },
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  text: {
    backgroundColor: colors.ink,
    color: colors.ivory,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    overflow: 'hidden',
    borderRadius: 4,
  },
});
