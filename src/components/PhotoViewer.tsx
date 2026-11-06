import { X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  GestureResponderEvent,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/theme';
import { Touch } from './ui';

// Full-screen product photos (Myntra-style): swipe between them, pinch or
// double-tap to zoom, drag to look around while zoomed. Built on React
// Native's own touch system - no extra native module.
export function PhotoViewer({
  images,
  start,
  visible,
  onClose,
}: {
  images: string[];
  start: number;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  const [zoomed, setZoomed] = useState(false);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root}>
        <FlatList
          data={images}
          keyExtractor={(u, i) => `${i}-${u}`}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          renderItem={({ item }) => (
            <ZoomableImage
              uri={item}
              width={width}
              height={height}
              onZoomChange={setZoomed}
            />
          )}
        />
        <View style={[styles.top, { top: insets.top + 8 }]}>
          <Text style={styles.counter}>
            {index + 1} / {images.length}
          </Text>
          <Touch
            hitSlop={12}
            onPress={onClose}
            style={styles.close}
            accessibilityLabel="Close photos"
          >
            <X size={22} color={colors.ivory} />
          </Touch>
        </View>
      </View>
    </Modal>
  );
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const distance = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

function ZoomableImage({
  uri,
  width,
  height,
  onZoomChange,
}: {
  uri: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const s = useRef({
    scale: 1,
    x: 0,
    y: 0,
    pinchStart: 0,
    scaleStart: 1,
    xStart: 0,
    yStart: 0,
    lastTap: 0,
  });

  const apply = (next: number, x: number, y: number, animate = false) => {
    const clamped = Math.min(MAX_SCALE, Math.max(1, next));
    // Keep the photo covering the screen: no dragging past its edges.
    const maxX = ((clamped - 1) * width) / 2;
    const maxY = ((clamped - 1) * height) / 2;
    const cx = Math.max(-maxX, Math.min(maxX, x));
    const cy = Math.max(-maxY, Math.min(maxY, y));
    const wasZoomed = s.current.scale > 1.01;
    s.current = { ...s.current, scale: clamped, x: cx, y: cy };
    if (animate) {
      Animated.parallel([
        Animated.spring(scale, { toValue: clamped, useNativeDriver: true }),
        Animated.spring(tx, { toValue: cx, useNativeDriver: true }),
        Animated.spring(ty, { toValue: cy, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(clamped);
      tx.setValue(cx);
      ty.setValue(cy);
    }
    if (wasZoomed !== clamped > 1.01) onZoomChange(clamped > 1.01);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Take the touch for pinches, and for drags while zoomed (otherwise
        // the list underneath swipes to the next photo).
        onStartShouldSetPanResponder: e =>
          e.nativeEvent.touches.length === 2 || s.current.scale > 1.01,
        onMoveShouldSetPanResponder: e =>
          e.nativeEvent.touches.length === 2 || s.current.scale > 1.01,
        onPanResponderGrant: e => {
          s.current.xStart = s.current.x;
          s.current.yStart = s.current.y;
          s.current.scaleStart = s.current.scale;
          s.current.pinchStart =
            e.nativeEvent.touches.length === 2 ? distance(e) : 0;
        },
        onPanResponderMove: (e, g) => {
          if (e.nativeEvent.touches.length === 2) {
            if (!s.current.pinchStart) {
              s.current.pinchStart = distance(e);
              s.current.scaleStart = s.current.scale;
            }
            apply(
              (s.current.scaleStart * distance(e)) / s.current.pinchStart,
              s.current.x,
              s.current.y,
            );
          } else if (s.current.scale > 1.01) {
            apply(
              s.current.scale,
              s.current.xStart + g.dx,
              s.current.yStart + g.dy,
            );
          }
        },
        onPanResponderRelease: () => {
          s.current.pinchStart = 0;
          if (s.current.scale < 1.05) apply(1, 0, 0, true);
        },
        onPanResponderTerminationRequest: () => s.current.scale <= 1.01,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height],
  );

  // Double tap: zoom in to 2.5x, or back out. Only real taps count (a
  // short touch that barely moved), not the end of a swipe or a pinch.
  const touch = useRef({ x: 0, y: 0, t: 0, fingers: 0 });
  const onTouchStart = (e: GestureResponderEvent) => {
    const t = e.nativeEvent;
    touch.current = {
      x: t.pageX,
      y: t.pageY,
      t: Date.now(),
      fingers: Math.max(1, t.touches.length),
    };
  };
  const onTap = (e: GestureResponderEvent) => {
    const t = e.nativeEvent;
    const moved = Math.hypot(
      t.pageX - touch.current.x,
      t.pageY - touch.current.y,
    );
    if (
      touch.current.fingers > 1 ||
      moved > 10 ||
      Date.now() - touch.current.t > 250
    ) {
      s.current.lastTap = 0;
      return;
    }
    const now = Date.now();
    if (now - s.current.lastTap < 280) {
      if (s.current.scale > 1.01) apply(1, 0, 0, true);
      else apply(DOUBLE_TAP_SCALE, 0, 0, true);
      s.current.lastTap = 0;
    } else s.current.lastTap = now;
  };

  return (
    <View
      style={{ width, height }}
      {...responder.panHandlers}
      onTouchStart={onTouchStart}
      onTouchEnd={onTap}
    >
      <Animated.Image
        source={{ uri }}
        resizeMode="contain"
        style={[
          { width, height },
          { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
        ]}
        accessibilityLabel="Product photo, pinch or double-tap to zoom"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ivory },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(252,251,248,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
