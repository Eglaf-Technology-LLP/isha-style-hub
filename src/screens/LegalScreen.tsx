import { X } from 'lucide-react-native';
import { ComponentRef, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { Eyebrow, Serif, Touch } from '@/components/ui';
import { CONFIG } from '@/config';
import {
  Block,
  LEGAL_UPDATED,
  LegalDoc,
  PRIVACY,
  Segment,
  TERMS,
} from '@/content/legal';
import { shortDate } from '@/lib/orders';
import { useGo, useParams } from '@/navigation';
import { colors, fonts } from '@/theme';

// The customer Terms & Conditions and the Privacy Policy, in the app - the
// website's text word for word (src/content/legal.ts), numbered sections
// and a contents list that jumps to each one.

// Pages the app has; any other path opens on the website.
const IN_APP = ['/terms', '/privacy-policy', '/orders', '/account'];

export type LegalKind = 'terms' | 'privacy';

export default function LegalScreen() {
  const { doc } = useParams<'Legal'>();
  const go = useGo();
  return (
    <View style={styles.flex}>
      <AppHeader back title={(doc === 'privacy' ? PRIVACY : TERMS).title} />
      <LegalView
        kind={doc === 'privacy' ? 'privacy' : 'terms'}
        onOpenPath={go}
      />
    </View>
  );
}

// Over a popup (the consent box): the same page in its own full-screen popup,
// so it isn't hidden behind it.
export function LegalModal({
  kind,
  onClose,
}: {
  kind: LegalKind | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<LegalKind | null>(kind);
  if (kind !== null && shown === null) setShown(kind);
  if (kind === null && shown !== null) setShown(null);
  return (
    <Modal
      visible={!!kind}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.modalHead}>
          <Text style={styles.modalTitle}>
            {(shown === 'privacy' ? PRIVACY : TERMS).title}
          </Text>
          <Touch hitSlop={10} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color={colors.foreground} />
          </Touch>
        </View>
        {shown ? (
          <LegalView
            kind={shown}
            onOpenPath={path => {
              if (path === '/terms') setShown('terms');
              else if (path === '/privacy-policy') setShown('privacy');
              else Linking.openURL(`${CONFIG.siteUrl}${path}`);
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

export function LegalView({
  kind,
  onOpenPath,
}: {
  kind: LegalKind;
  onOpenPath: (path: string) => void;
}) {
  const page: LegalDoc = kind === 'privacy' ? PRIVACY : TERMS;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Record<string, number>>({});

  const open = (href: string) => {
    if (
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('http')
    )
      return Linking.openURL(href);
    if (IN_APP.includes(href)) return onOpenPath(href);
    return Linking.openURL(`${CONFIG.siteUrl}${href}`);
  };

  const renderSegs = (segs: Segment[]) =>
    segs.map((s, i) =>
      typeof s === 'string' ? (
        s
      ) : 'b' in s ? (
        <Text key={i} style={styles.bold}>
          {s.b}
        </Text>
      ) : (
        <Text key={i} style={styles.link} onPress={() => open(s.href)}>
          {s.t}
        </Text>
      ),
    );

  const renderBlock = (b: Block, i: number) => {
    if ('p' in b)
      return (
        <Text key={i} style={styles.p}>
          {renderSegs(b.p)}
        </Text>
      );
    if ('ul' in b)
      return (
        <View key={i} style={styles.ul}>
          {b.ul.map((item, j) => (
            <View key={j} style={styles.li}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.liText}>{renderSegs(item)}</Text>
            </View>
          ))}
        </View>
      );
    return (
      <View key={i} style={styles.grievance}>
        <Text style={styles.bold}>Grievance Officer</Text>
        <Text style={styles.p}>AllBoutiqs Private Limited</Text>
        <Text style={styles.p}>
          19, Puniynagari, Near Smrudhipark, Deesa, Banaskantha, Gujarat 385535
        </Text>
        <Text style={styles.p}>
          Email:{' '}
          <Text
            style={styles.link}
            onPress={() => open(`mailto:${CONFIG.supportEmail}`)}
          >
            {CONFIG.supportEmail}
          </Text>
        </Text>
        <Text style={styles.p}>
          Phone:{' '}
          <Text
            style={styles.link}
            onPress={() =>
              open(`tel:${CONFIG.supportPhone.replace(/\s/g, '')}`)
            }
          >
            {CONFIG.supportPhone}
          </Text>
        </Text>
      </View>
    );
  };

  return (
    <ScrollView ref={scroll} contentContainerStyle={styles.body}>
      <View style={styles.hero}>
        <Eyebrow>{page.eyebrow}</Eyebrow>
        <Serif style={styles.title}>{page.title}</Serif>
        <Text style={styles.updated}>
          Last updated {shortDate(LEGAL_UPDATED)}
        </Text>
        {page.intro.map(renderBlock)}
      </View>

      <View style={styles.contents}>
        <Eyebrow style={styles.contentsHead}>Contents</Eyebrow>
        {page.sections.map((s, i) => (
          <Touch
            key={s.id}
            style={styles.contentsRow}
            onPress={() =>
              scroll.current?.scrollTo({
                y: (offsets.current[s.id] ?? 0) - 8,
                animated: true,
              })
            }
          >
            <Text style={styles.contentsNum}>{i + 1}.</Text>
            <Text style={styles.contentsText}>{s.title}</Text>
          </Touch>
        ))}
      </View>

      {page.sections.map((s, i) => (
        <View
          key={s.id}
          style={styles.section}
          onLayout={e => {
            offsets.current[s.id] = e.nativeEvent.layout.y;
          }}
        >
          <Serif style={styles.h2}>
            <Text style={styles.num}>{i + 1}. </Text>
            {s.title}
          </Serif>
          {s.blocks.map(renderBlock)}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  modalHead: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.foreground,
  },
  body: { paddingBottom: 40 },
  hero: {
    backgroundColor: colors.ivory,
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 30, marginTop: 6 },
  updated: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 6,
    marginBottom: 10,
  },
  contents: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.goldSoft,
  },
  contentsHead: { marginBottom: 8 },
  contentsRow: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  contentsNum: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.gold,
    width: 22,
  },
  contentsText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.primary,
  },
  section: { paddingHorizontal: 20, paddingTop: 18 },
  h2: { fontSize: 21, marginBottom: 8 },
  num: { color: colors.gold },
  p: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22,
    color: colors.foreground,
    marginBottom: 8,
  },
  bold: { fontFamily: fonts.sansSemi, color: colors.foreground },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  ul: { marginBottom: 8 },
  li: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bullet: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22,
    color: colors.gold,
  },
  liText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22,
    color: colors.foreground,
  },
  grievance: {
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingLeft: 12,
    marginTop: 4,
  },
});
