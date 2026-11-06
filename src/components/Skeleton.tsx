import { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '@/theme';

// A grey block that gently pulses while content loads (the Myntra / Ajio
// "shimmer" placeholder), in the storefront's muted ivory.
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[styles.block, style, { opacity: pulse }]} />;
}

// The shape of a product card: photo, boutique, name, price.
export function ProductCardSkeleton({ width }: { width: number }) {
  return (
    <View style={{ width }}>
      <Skeleton style={{ width, height: (width * 4) / 3 }} />
      <Skeleton style={[styles.line, styles.w60]} />
      <Skeleton style={[styles.line, styles.w85]} />
      <Skeleton style={[styles.line, styles.w40]} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.muted },
  line: { height: 10, marginTop: 8 },
  w40: { width: '40%' },
  w60: { width: '60%' },
  w85: { width: '85%' },
});
