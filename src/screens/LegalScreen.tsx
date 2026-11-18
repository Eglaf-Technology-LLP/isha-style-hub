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
import { COMPANY, telHref } from '@/content/company';
import {
  Block,
  LEGAL_DOCS,
  LegalDoc,
  LegalDocKey,
  Segment,
} from '@/content/legal';
import { refundChargeLabel, shortDate, useRefundCharge } from '@/lib/orders';
import { returnWindowSpan, useReturnWindowHours } from '@/lib/settings';
import { LEGAL_DOC_BY_PATH, useGo, useParams } from '@/navigation';
import { colors, fonts } from '@/theme';

// AllBoutiqs' policy and info pages in the app - Terms & Conditions, Privacy
// Policy, Shipping and Return & Refund policies, About us, Contact us and
// FAQ: the website's text word for word (src/content/legal.ts), numbered
// sections and a contents list that jumps to each one.

export type LegalKind = LegalDocKey;

const isDoc = (doc: string | undefined): doc is LegalDocKey =>
  !!doc && doc in LEGAL_DOCS;

export default function LegalScreen() {
  const { doc } = useParams<'Legal'>();
  const go = useGo();
  const kind: LegalDocKey = isDoc(doc) ? doc : 'terms';
  return (
    <View style={styles.flex}>
      <AppHeader back title={LEGAL_DOCS[kind].title} />
      <LegalView kind={kind} onOpenPath={go} />
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
            {LEGAL_DOCS[shown ?? 'terms'].title}
          </Text>
          <Touch hitSlop={10} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color={colors.foreground} />
          </Touch>
        </View>
        {shown ? (
          <LegalView
            kind={shown}
            // Another policy opens in this popup; anything else on the website.
            onOpenPath={path => {
              const doc = LEGAL_DOC_BY_PATH[path];
              if (!doc) return false;
              setShown(doc);
              return true;
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
  // Opens an app page by its website path; false when the app hasn't got it
  // (then it opens on the website).
  onOpenPath: (path: string) => boolean;
}) {
  const page: LegalDoc = LEGAL_DOCS[kind];
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Record<string, number>>({});
  // Read from Admin settings, as on the website.
  const windowHours = useReturnWindowHours();
  const refundCharge = useRefundCharge().data ?? { pct: 5, gstPct: 18 };
  const values = {
    returnSpan: returnWindowSpan(windowHours),
    refundCharge: refundChargeLabel(refundCharge),
  };

  const open = (href: string) => {
    if (
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('http')
    )
      return Linking.openURL(href);
    if (onOpenPath(href.split('#')[0])) return;
    return Linking.openURL(`${CONFIG.siteUrl}${href}`);
  };

  const renderSegs = (segs: Segment[]) =>
    segs.map((s, i) =>
      typeof s === 'string' ? (
        s
      ) : 'v' in s ? (
        values[s.v]
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
    if ('complaint' in b) return null;
    // The website's GrievanceContact block.
    const g = COMPANY.grievanceOfficer;
    return (
      <View key={i} style={styles.grievance}>
        <Serif style={styles.grievanceTitle}>
          Grievance Officer{g.name ? ` - ${g.name}` : ''}
        </Serif>
        <Text style={styles.small}>{COMPANY.legalName}</Text>
        <Text style={styles.small}>{COMPANY.officeAddress}</Text>
        <Text style={styles.small}>
          Email:{' '}
          <Text style={styles.link} onPress={() => open(`mailto:${g.email}`)}>
            {g.email}
          </Text>
        </Text>
        <Text style={styles.small}>
          Phone:{' '}
          <Text style={styles.link} onPress={() => open(telHref(g.phone))}>
            {g.phone}
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
        {page.updated ? (
          <Text style={styles.updated}>
            Last updated {shortDate(page.updated)}
          </Text>
        ) : (
          <View style={styles.noDate} />
        )}
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
  noDate: { height: 12 },
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
    borderWidth: 1,
    borderColor: colors.goldSoft,
    backgroundColor: colors.ivory,
    padding: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  grievanceTitle: { fontSize: 18, marginBottom: 6 },
  small: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 21,
    color: colors.foreground,
  },
});
