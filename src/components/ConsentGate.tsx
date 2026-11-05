import { useState } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { CONFIG } from '@/config';
import { acceptTerms, signOut, useSession } from '@/lib/auth';
import { Checkbox } from '@/screens/SignInScreen';
import { colors, fonts } from '@/theme';
import { Button, Eyebrow, Serif, Touch } from './ui';

// Every signed-in customer has agreed to the Privacy Policy and the Terms
// (as on the website). An account made by a sign-in code, or before the
// Terms existed, is asked once here.
export function ConsentGate() {
  const needed = useSession(st => st.status === 'signed-in' && st.needsConsent);
  const markConsented = useSession(st => st.markConsented);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (!terms)
      return setError(
        'Please agree to the Privacy Policy and the Terms & Conditions.',
      );
    setSaving(true);
    const { error: e } = await acceptTerms(marketing);
    setSaving(false);
    if (e) return setError(e.message);
    markConsented();
  };

  return (
    <Modal
      visible={needed}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Eyebrow>One last step</Eyebrow>
          <Serif style={styles.title}>Our terms</Serif>
          <View style={styles.boxes}>
            <Checkbox checked={terms} onPress={() => setTerms(v => !v)}>
              I agree to the{' '}
              <Text
                style={styles.link}
                onPress={() =>
                  Linking.openURL(`${CONFIG.siteUrl}/privacy-policy`)
                }
              >
                Privacy Policy
              </Text>{' '}
              and the{' '}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL(`${CONFIG.siteUrl}/terms`)}
              >
                Terms & Conditions
              </Text>
              .
            </Checkbox>
            <Checkbox checked={marketing} onPress={() => setMarketing(v => !v)}>
              Send me offers and new arrivals by email (optional).
            </Checkbox>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={saving ? 'Saving...' : 'Agree and continue'}
            onPress={accept}
            disabled={saving}
          />
          <Touch style={styles.out} onPress={() => signOut()}>
            <Text style={styles.outText}>Sign out instead</Text>
          </Touch>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(27,22,19,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  card: { backgroundColor: colors.ivory, padding: 22 },
  title: { fontSize: 26, marginTop: 4, marginBottom: 16 },
  boxes: { gap: 12, marginBottom: 16 },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginBottom: 12,
  },
  out: { alignSelf: 'center', marginTop: 14 },
  outText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.mutedForeground,
  },
});
