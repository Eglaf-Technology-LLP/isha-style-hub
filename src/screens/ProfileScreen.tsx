import {
  ChevronRight,
  FileText,
  Heart,
  LogOut,
  MessageCircle,
  Package,
  Shield,
  KeyRound,
} from 'lucide-react-native';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Button, Eyebrow, Sans, Serif, Touch } from '@/components/ui';
import { CONFIG } from '@/config';
import { hasOwnPassword, signOut, userContact, useSession } from '@/lib/auth';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';
import { version } from '../../package.json';

// Customer account. Boutique and admin areas are website-only.
export default function ProfileScreen() {
  const go = useGo();
  const { status, user } = useSession();
  const signedIn = status === 'signed-in';

  const rows: { icon: typeof Package; label: string; onPress: () => void }[] = [
    { icon: Package, label: 'My orders', onPress: () => go('/orders') },
    { icon: Heart, label: 'My wishlist', onPress: () => go('/wishlist') },
    ...(signedIn
      ? [
          {
            icon: KeyRound,
            label: hasOwnPassword(user) ? 'Change password' : 'Set a password',
            onPress: () => go('/password'),
          },
        ]
      : []),
    {
      icon: MessageCircle,
      label: 'Help on WhatsApp',
      onPress: () => Linking.openURL(CONFIG.whatsappUrl),
    },
    {
      icon: FileText,
      label: 'Terms & Conditions',
      onPress: () => Linking.openURL(`${CONFIG.siteUrl}/terms`),
    },
    {
      icon: Shield,
      label: 'Privacy policy',
      onPress: () => Linking.openURL(`${CONFIG.siteUrl}/privacy-policy`),
    },
  ];

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your bag stays on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <View style={styles.flex}>
      <AppHeader title="Profile" />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          {signedIn ? (
            <>
              <Eyebrow>Signed in as</Eyebrow>
              <Serif style={styles.heroTitle} numberOfLines={1}>
                {userContact(user)}
              </Serif>
            </>
          ) : (
            <>
              <Eyebrow>Welcome to</Eyebrow>
              <Serif style={styles.heroTitle}>AllBoutiqs</Serif>
              <Sans style={styles.heroText}>
                Sign in to track orders and keep your wishlist on every device.
              </Sans>
              <View style={styles.heroButtons}>
                <Button
                  label="Sign in"
                  onPress={() => go('/signin')}
                  style={styles.heroBtn}
                />
                <Button
                  label="Create account"
                  variant="light"
                  onPress={() => go('/signin?mode=signup')}
                  style={styles.heroBtn}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.list}>
          {rows.map(({ icon: Icon, label, onPress }) => (
            <Touch key={label} style={styles.row} onPress={onPress}>
              <Icon
                size={18}
                color={colors.mutedForeground}
                strokeWidth={1.6}
              />
              <Text style={styles.label}>{label}</Text>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </Touch>
          ))}
          {signedIn ? (
            <Touch style={styles.row} onPress={confirmSignOut}>
              <LogOut size={18} color={colors.destructive} strokeWidth={1.6} />
              <Text style={[styles.label, styles.danger]}>Sign out</Text>
            </Touch>
          ) : null}
        </View>
        <Sans style={styles.version}>Version {version}</Sans>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingBottom: 32 },
  hero: {
    backgroundColor: colors.maroonDeep,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  heroTitle: { fontSize: 28, color: colors.ivory, marginTop: 6 },
  heroText: { color: 'rgba(252,251,248,0.75)', marginTop: 8, lineHeight: 21 },
  heroButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  heroBtn: { flex: 1 },
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
  danger: { color: colors.destructive },
  version: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 12,
    color: colors.mutedForeground,
  },
});
