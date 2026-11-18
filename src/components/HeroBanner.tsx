import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ImageSourcePropType,
  Linking,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { CONFIG } from '@/config';
import {
  BUNDLED_HERO_IMAGES,
  HERO_SLIDES,
  HeroSlide,
} from '@/content/storefront';
import { useHeroSlides } from '@/lib/catalog';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';
import { Eyebrow, Touch } from './ui';

// Home page banner (the website's HeroCarousel): slides from Admin > Home
// Banner that move on by themselves (not while touched); the built-in slides
// only if those can't be loaded, and no banner at all when every slide is
// switched off.
export function HeroBanner() {
  const { width, height: screen } = useWindowDimensions();
  const { data, isLoading, isError } = useHeroSlides();
  // Portrait, close to the phone photo admins upload (about 1080 x 1600).
  const height = Math.round(Math.min(width * 1.4, screen * 0.7));
  if (isLoading)
    return <View style={{ height, backgroundColor: colors.maroonDeep }} />;
  const slides = isError ? HERO_SLIDES : data ?? [];
  if (slides.length === 0) return null;
  return <Carousel slides={slides} width={width} height={height} />;
}

function Carousel({
  slides,
  width,
  height,
}: {
  slides: HeroSlide[];
  width: number;
  height: number;
}) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<HeroSlide>>(null);
  const held = useRef(false);
  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => {
      if (held.current) return;
      setIndex(i => {
        const next = (i + 1) % count;
        listRef.current?.scrollToOffset({
          offset: next * width,
          animated: true,
        });
        return next;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [width, count]);

  return (
    <View>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={s => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => {
          held.current = true;
        }}
        onMomentumScrollEnd={e => {
          held.current = false;
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <Slide slide={item} width={width} height={height} />
        )}
      />
      {count > 1 ? (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View
              key={s.id}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const isExternal = (href: string) => /^https?:\/\//i.test(href);

// The phone photo when there is one. Website paths ("/hero/...") are the
// website's own files.
function photo(slide: HeroSlide): ImageSourcePropType | null {
  const src = slide.mobileImage || slide.image;
  if (!src) return null;
  if (typeof src === 'number') return src;
  if (BUNDLED_HERO_IMAGES[src]) return BUNDLED_HERO_IMAGES[src];
  return { uri: src.startsWith('/') ? `${CONFIG.siteUrl}${src}` : src };
}

function Slide({
  slide,
  width,
  height,
}: {
  slide: HeroSlide;
  width: number;
  height: number;
}) {
  const go = useGo();
  // Shop pages open in the app; anything else on the website or in the browser.
  const open = (href: string) => {
    if (isExternal(href)) return Linking.openURL(href);
    if (!go(href)) Linking.openURL(`${CONFIG.siteUrl}${href}`);
  };

  const image = photo(slide);
  const hasMedia = !!image;
  const centered = slide.align === 'center' || !hasMedia;
  const overlay = slide.overlay !== false;
  const buttonLabel = slide.cta?.label?.trim();
  // A link with no button text: the whole slide is tappable.
  const wholeSlideHref = slide.cta && !buttonLabel ? slide.cta.href : undefined;
  const hasText = !!(
    slide.eyebrow ||
    slide.title ||
    slide.titleAccent ||
    slide.subtitle ||
    buttonLabel ||
    slide.secondaryCta
  );
  const textAlign = centered ? 'center' : 'left';

  const body = (
    <>
      {image ? (
        <>
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {overlay ? (
            centered ? (
              <View style={[StyleSheet.absoluteFill, styles.shade]} />
            ) : (
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient
                    id={`shade-${slide.id}`}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <Stop
                      offset="0"
                      stopColor={colors.ink}
                      stopOpacity={0.75}
                    />
                    <Stop
                      offset="0.5"
                      stopColor={colors.ink}
                      stopOpacity={0.35}
                    />
                    <Stop offset="1" stopColor={colors.ink} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect
                  width="100%"
                  height="100%"
                  fill={`url(#shade-${slide.id})`}
                />
              </Svg>
            )
          ) : null}
        </>
      ) : (
        <View style={styles.frame} />
      )}

      {hasText ? (
        <View
          pointerEvents="box-none"
          style={[styles.text, centered && styles.textCentered]}
        >
          {slide.eyebrow ? (
            <Eyebrow style={[styles.eyebrow, { textAlign }]}>
              {slide.eyebrow}
            </Eyebrow>
          ) : null}
          {slide.title || slide.titleAccent ? (
            <Text style={[styles.title, { textAlign }]}>
              {slide.title}
              {slide.titleAccent ? (
                <>
                  {slide.title ? '\n' : null}
                  <Text style={styles.accent}>{slide.titleAccent}</Text>
                </>
              ) : null}
            </Text>
          ) : null}
          {!hasMedia ? <View style={styles.ornament} /> : null}
          {slide.subtitle ? (
            <Text
              style={[styles.subtitle, { textAlign }, hasMedia && styles.gap]}
            >
              {slide.subtitle}
            </Text>
          ) : null}
          {buttonLabel || slide.secondaryCta ? (
            <View style={[styles.buttons, centered && styles.buttonsCentered]}>
              {buttonLabel && slide.cta ? (
                <Touch
                  style={styles.cta}
                  onPress={() => open(slide.cta!.href)}
                  accessibilityRole="link"
                >
                  <Text style={styles.ctaText}>{buttonLabel}</Text>
                </Touch>
              ) : null}
              {slide.secondaryCta ? (
                <Touch
                  style={styles.secondary}
                  onPress={() => open(slide.secondaryCta!.href)}
                  accessibilityRole="link"
                >
                  <Text style={[styles.ctaText, styles.secondaryText]}>
                    {slide.secondaryCta.label}
                  </Text>
                </Touch>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const box = [styles.slide, { width, height }];
  return wholeSlideHref ? (
    <Touch
      style={box}
      onPress={() => open(wholeSlideHref)}
      accessibilityRole="link"
      accessibilityLabel={slide.title || 'Open offer'}
    >
      {body}
    </Touch>
  ) : (
    <View style={box}>{body}</View>
  );
}

const styles = StyleSheet.create({
  slide: { overflow: 'hidden', backgroundColor: colors.maroonDeep },
  shade: { backgroundColor: 'rgba(27,22,19,0.45)' },
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 14,
    borderWidth: 1,
    borderColor: colors.goldSoft,
  },
  text: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  textCentered: { alignItems: 'center' },
  eyebrow: { marginBottom: 14 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    color: colors.ivory,
  },
  accent: { fontFamily: fonts.serifItalic, color: 'rgba(252,251,248,0.95)' },
  ornament: {
    width: 56,
    height: 1,
    backgroundColor: colors.gold,
    marginVertical: 20,
    alignSelf: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(252,251,248,0.8)',
    maxWidth: 420,
  },
  gap: { marginTop: 16 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 },
  buttonsCentered: { justifyContent: 'center' },
  cta: {
    height: 46,
    paddingHorizontal: 22,
    justifyContent: 'center',
    backgroundColor: colors.ivory,
  },
  ctaText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  secondary: {
    height: 46,
    paddingHorizontal: 22,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(252,251,248,0.6)',
  },
  secondaryText: { color: colors.ivory },
  dots: {
    position: 'absolute',
    bottom: 14,
    left: 20,
    flexDirection: 'row',
    gap: 6,
  },
  dot: { width: 18, height: 2, backgroundColor: 'rgba(252,251,248,0.45)' },
  dotActive: { width: 32, backgroundColor: colors.ivory },
});
