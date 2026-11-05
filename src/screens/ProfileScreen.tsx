import {
  ChevronRight,
  FileText,
  MessageCircle,
  Package,
  Shield,
  Store,
  User,
} from 'lucide-react-native';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CONFIG } from '@/config';
import { version } from '../../package.json';
import { AppHeader } from '@/components/AppHeader';
import { Eyebrow, Sans, Serif, Touch } from '@/components/ui';
import { SITE_URL } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

const WHATSAPP = CONFIG.whatsappUrl;

// Phase 1: sign-in, orders and returns live on the website (they open in the
// browser); phase 2 brings them into the app.
const ROWS = [
  { icon: User, label: 'Sign in / Sign up', url: `${SITE_URL}/account` },
  { icon: Package, label: 'My orders & returns', url: `${SITE_URL}/orders` },
  { icon: MessageCircle, label: 'WhatsApp us', url: WHATSAPP },
  { icon: Store, label: 'Sell on AllBoutiqs', url: `${SITE_URL}/sell-with-us` },
  { icon: FileText, label: 'Terms of use', url: `${SITE_URL}/terms` },
  { icon: Shield, label: 'Privacy policy', url: `${SITE_URL}/privacy-policy` },
];

export default function Profile() {
  return (
    <View style={{ flex: 1 }}>
      <AppHeader title="Profile" />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.hero}>
          <Eyebrow>Welcome to</Eyebrow>
          <Serif style={{ fontSize: 30, color: colors.ivory, marginTop: 6 }}>
            AllBoutiqs
          </Serif>
          <Sans style={{ color: 'rgba(252,251,248,0.75)', marginTop: 8 }}>
            India's finest boutiques, one address.
          </Sans>
        </View>
        <View style={styles.list}>
          {ROWS.map(({ icon: Icon, label, url }) => (
            <Touch
              key={label}
              style={styles.row}
              onPress={() => Linking.openURL(url)}
              accessibilityRole="link"
            >
              <Icon
                size={18}
                color={colors.mutedForeground}
                strokeWidth={1.6}
              />
              <Text style={styles.label}>{label}</Text>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </Touch>
          ))}
        </View>
        <Sans style={styles.version}>Version {version}</Sans>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.maroonDeep,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  list: {
    marginTop: 16,
    backgroundColor: colors.ivory,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    height: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  version: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 12,
    color: colors.mutedForeground,
  },
});
