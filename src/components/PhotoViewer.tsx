import { X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  GestureResponderEvent,
  Modal,
  NativeTouchEvent,
  PanResponder,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/theme';
import { Touch } from './ui';

// Full-screen product photos, as the website's full-screen view (783fe3d):
// pinch to zoom (1x-4x) around the fingers, double-tap to zoom in where
// tapped (or back out), drag with one finger to move a zoomed photo - only
// up to its own edge, never into empty space - and swipe to the next photo
// when not zoomed in. The whole photo on the cream background, no black
// bars. Built on React Native's own touch system - no extra native module.
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
          <Text style={styles.counter} numberOfLines={1}>
            {index + 1} / {images.length}
            <Text style={styles.hint}>
              {'   '}
              {zoomed
                ? 'Drag to move · double-tap to zoom out'
                : 'Pinch or double-tap to zoom'}
            </Text>
          </Text>
          <Touch
            hitSlop={12}
            onPress={onClose}
            style={styles.close}
            accessibilityLabel="Close photos"
          >
            <X size={22} color={colors.foreground} />
          </Touch>
        </View>
      </View>
    </Modal>
  );
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
// A touch that moves less than this is a tap, not a drag.
const TAP_SLOP = 10;

type Point = { x: number; y: number };
// Scale, and how far the photo's centre is moved from the frame's centre.
type View2D = { s: number; x: number; y: number };
const UNZOOMED: View2D = { s: 1, x: 0, y: 0 };

// Zoom to scale `s`, keeping the bit of the photo that was under `at` (in
// view `from`) under `to` - the fingers stay on the same spot.
function zoomAround(from: View2D, at: Point, to: Point, s: number): View2D {
  const px = (at.x - from.x) / from.s;
  const py = (at.y - from.y) / from.s;
  return { s, x: to.x - px * s, y: to.y - py * s };
}

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
  const view = useRef<View2D>(UNZOOMED);
  // The photo's own width / height, once loaded (it's drawn "contain").
  const ratio = useRef<number | null>(null);
  const gesture = useRef<
    | { kind: 'pan'; start: Point; view: View2D; fingers: 1 }
    | { kind: 'pinch'; dist: number; mid: Point; view: View2D; fingers: 2 }
    | null
  >(null);

  // Screen point -> offset from the frame's centre (the frame fills the
  // screen from its top-left corner).
  const local = (x: number, y: number): Point => ({
    x: x - width / 2,
    y: y - height / 2,
  });

  // Keeps the zoomed photo covering the frame: it can be dragged up to its
  // own edge, never past it, and stays centred along a side that still fits.
  const fit = (v: View2D): View2D => {
    const s = Math.min(MAX_SCALE, Math.max(1, v.s));
    if (s === 1) return UNZOOMED;
    let w = width;
    let h = height;
    if (ratio.current) {
      if (width / height > ratio.current) w = height * ratio.current;
      else h = width / ratio.current;
    }
    const maxX = Math.max(0, (w * s - width) / 2);
    const maxY = Math.max(0, (h * s - height) / 2);
    return {
      s,
      x: Math.min(maxX, Math.max(-maxX, v.x)),
      y: Math.min(maxY, Math.max(-maxY, v.y)),
    };
  };

  const apply = (next: View2D, animate = false) => {
    const v = fit(next);
    const wasZoomed = view.current.s > 1;
    view.current = v;
    if (animate) {
      Animated.parallel([
        Animated.spring(scale, { toValue: v.s, useNativeDriver: true }),
        Animated.spring(tx, { toValue: v.x, useNativeDriver: true }),
        Animated.spring(ty, { toValue: v.y, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(v.s);
      tx.setValue(v.x);
      ty.setValue(v.y);
    }
    if (wasZoomed !== v.s > 1) onZoomChange(v.s > 1);
  };

  // (Re)starts the gesture from the fingers down now, so lifting one finger
  // of a pinch carries on as a drag without a jump.
  const begin = (touches: readonly NativeTouchEvent[]) => {
    const v = view.current;
    if (touches.length >= 2) {
      const [a, b] = touches;
      gesture.current = {
        kind: 'pinch',
        dist: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1,
        mid: local((a.pageX + b.pageX) / 2, (a.pageY + b.pageY) / 2),
        view: v,
        fingers: 2,
      };
    } else if (touches.length === 1) {
      gesture.current = {
        kind: 'pan',
        start: { x: touches[0].pageX, y: touches[0].pageY },
        view: v,
        fingers: 1,
      };
    } else gesture.current = null;
  };

  const pinching = (e: GestureResponderEvent) =>
    e.nativeEvent.touches.length >= 2;

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Take the touch for pinches, and for drags while zoomed in
        // (otherwise the list underneath swipes to the next photo).
        onStartShouldSetPanResponder: e => pinching(e) || view.current.s > 1,
        onMoveShouldSetPanResponder: e => pinching(e) || view.current.s > 1,
        onPanResponderGrant: e => begin(e.nativeEvent.touches),
        onPanResponderMove: e => {
          const touches = e.nativeEvent.touches;
          const fingers = Math.min(2, touches.length);
          if (!gesture.current || gesture.current.fingers !== fingers)
            begin(touches);
          const g = gesture.current;
          if (!g) return;
          if (g.kind === 'pinch') {
            const [a, b] = touches;
            const s = Math.min(
              MAX_SCALE,
              Math.max(
                1,
                (g.view.s * Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) /
                  g.dist,
              ),
            );
            apply(
              zoomAround(
                g.view,
                g.mid,
                local((a.pageX + b.pageX) / 2, (a.pageY + b.pageY) / 2),
                s,
              ),
            );
          } else if (g.view.s > 1) {
            const t = touches[0];
            apply({
              ...g.view,
              x: g.view.x + t.pageX - g.start.x,
              y: g.view.y + t.pageY - g.start.y,
            });
          }
        },
        onPanResponderRelease: () => {
          gesture.current = null;
          // A pinch that ended (almost) at 1x snaps back to the whole photo.
          if (view.current.s < 1.05) apply(UNZOOMED, true);
        },
        onPanResponderTerminate: () => {
          gesture.current = null;
        },
        onPanResponderTerminationRequest: () => view.current.s <= 1,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height],
  );

  // Double tap: zoom in to 2.5x where tapped, or back out. Only real taps
  // count (a short touch that barely moved), not the end of a swipe or a
  // pinch.
  const touch = useRef({ x: 0, y: 0, t: 0, fingers: 0 });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const onTouchStart = (e: GestureResponderEvent) => {
    const t = e.nativeEvent;
    if (t.touches.length > 1) {
      touch.current.fingers = t.touches.length;
      return;
    }
    touch.current = { x: t.pageX, y: t.pageY, t: Date.now(), fingers: 1 };
  };
  const onTap = (e: GestureResponderEvent) => {
    const t = e.nativeEvent;
    if (t.touches.length > 0) return; // other fingers still down
    const moved = Math.hypot(
      t.pageX - touch.current.x,
      t.pageY - touch.current.y,
    );
    if (
      touch.current.fingers > 1 ||
      moved > TAP_SLOP ||
      Date.now() - touch.current.t > 250
    ) {
      lastTap.current = null;
      return;
    }
    const now = Date.now();
    const prev = lastTap.current;
    if (
      prev &&
      now - prev.t < DOUBLE_TAP_MS &&
      Math.hypot(t.pageX - prev.x, t.pageY - prev.y) < 30
    ) {
      lastTap.current = null;
      const at = local(t.pageX, t.pageY);
      apply(
        view.current.s > 1
          ? UNZOOMED
          : zoomAround(view.current, at, at, DOUBLE_TAP_SCALE),
        true,
      );
    } else lastTap.current = { t: now, x: t.pageX, y: t.pageY };
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
        onLoad={e => {
          const { width: w, height: h } = e.nativeEvent.source ?? {};
          if (w && h) ratio.current = w / h;
        }}
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
  root: { flex: 1, backgroundColor: colors.ivory },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  counter: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.foreground,
  },
  hint: {
    fontFamily: fonts.sans,
    letterSpacing: 0.4,
    color: colors.mutedForeground,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(252,251,248,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
