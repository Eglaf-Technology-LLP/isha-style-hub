import { Check, Lock } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Button, Eyebrow, Sans, Serif, Touch } from '@/components/ui';
import { CONFIG } from '@/config';
import {
  formatPhone,
  Identifier,
  parseIdentifier,
  sendCode,
  signInWithPassword,
  useSession,
  verifyCode,
} from '@/lib/auth';
import { success, tap } from '@/lib/haptics';
import { useRoute } from '@react-navigation/native';
import { useBack } from '@/navigation';
import { colors, fonts } from '@/theme';

type Mode = 'signin' | 'signup';

// Sign in or create a customer account, all in the app: a 6-digit code to
// the email (or by SMS to the mobile), or a password the customer set.
export default function SignInScreen() {
  const back = useBack();
  const status = useSession(st => st.status);
  const notice = useSession(st => st.notice);
  const clearNotice = useSession(st => st.clearNotice);
  const setPendingConsent = useSession(st => st.setPendingConsent);

  const startMode =
    (useRoute().params as { mode?: string } | undefined)?.mode === 'signup'
      ? 'signup'
      : 'signin';
  const [mode, setMode] = useState<Mode>(startMode);
  const [raw, setRaw] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [sentTo, setSentTo] = useState<Identifier | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  // Signed in: back to where they came from.
  useEffect(() => {
    if (status === 'signed-in') {
      success();
      back();
    }
  }, [status, back]);

  useEffect(() => () => clearInterval(timer.current), []);
  const startWait = (seconds: number) => {
    setWait(seconds);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setWait(w => {
        if (w <= 1) clearInterval(timer.current);
        return Math.max(0, w - 1);
      });
    }, 1000);
  };

  const id = parseIdentifier(raw);

  const send = async (target: Identifier | null = id) => {
    clearNotice();
    setError(null);
    if (!target)
      return setError('Enter a valid email or 10-digit mobile number.');
    if (mode === 'signup' && !terms)
      return setError(
        'Please agree to the Privacy Policy and the Terms & Conditions.',
      );
    if (mode === 'signup') setPendingConsent({ marketing });
    setBusy(true);
    const r = await sendCode(target);
    setBusy(false);
    if (r.error) {
      if (r.retryAfter) startWait(r.retryAfter);
      return setError(r.error);
    }
    tap();
    setSentTo(target);
    setCode('');
    startWait(60);
  };

  const verify = async () => {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code.');
    setError(null);
    setBusy(true);
    const r = await verifyCode(sentTo, code);
    setBusy(false);
    if (r.error) setError(r.error);
    // Success: the session store flips to signed-in and the effect above closes this screen.
  };

  const passwordSignIn = async () => {
    clearNotice();
    setError(null);
    if (!id) return setError('Enter a valid email or 10-digit mobile number.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    const r = await signInWithPassword(id, password);
    setBusy(false);
    if (r.error) setError(r.error);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setSentTo(null);
    setUsePassword(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader
        back
        title={mode === 'signin' ? 'Sign in' : 'Create account'}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Eyebrow>Welcome to AllBoutiqs</Eyebrow>
        <Serif style={styles.title}>
          {sentTo
            ? 'Enter your code'
            : mode === 'signin'
            ? 'Sign in to shop'
            : 'Create your account'}
        </Serif>

        {!sentTo ? (
          <View style={styles.tabs}>
            {(['signin', 'signup'] as Mode[]).map(m => (
              <Touch
                key={m}
                style={[styles.tab, mode === m && styles.tabActive]}
                onPress={() => switchMode(m)}
              >
                <Text
                  style={[styles.tabText, mode === m && styles.tabTextActive]}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              </Touch>
            ))}
          </View>
        ) : null}

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {sentTo ? (
          <>
            <Sans style={styles.hint}>
              We sent a 6-digit code to{' '}
              <Text style={styles.strong}>
                {sentTo.kind === 'email'
                  ? sentTo.value
                  : formatPhone(sentTo.value)}
              </Text>
              .
            </Sans>
            <TextInput
              value={code}
              onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              maxLength={6}
              placeholder="------"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, styles.code]}
              onSubmitEditing={verify}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={busy ? 'Checking...' : 'Verify and continue'}
              onPress={verify}
              disabled={busy}
            />
            <View style={styles.row}>
              <Touch hitSlop={8} onPress={() => setSentTo(null)}>
                <Text style={styles.link}>
                  Change {sentTo.kind === 'email' ? 'email' : 'number'}
                </Text>
              </Touch>
              <Touch
                hitSlop={8}
                disabled={wait > 0 || busy}
                onPress={() => send(sentTo)}
              >
                <Text style={[styles.link, wait > 0 && styles.disabled]}>
                  {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
                </Text>
              </Touch>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>Email or mobile number</Text>
            <TextInput
              value={raw}
              onChangeText={t => {
                setRaw(t);
                setError(null);
              }}
              placeholder="you@example.com or 98765 43210"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="username"
              textContentType="username"
              style={styles.input}
              onSubmitEditing={() => (usePassword ? passwordSignIn() : send())}
            />

            {usePassword ? (
              <>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  style={styles.input}
                  onSubmitEditing={passwordSignIn}
                />
              </>
            ) : null}

            {mode === 'signup' ? (
              <View style={styles.consent}>
                <Checkbox checked={terms} onPress={() => setTerms(v => !v)}>
                  I agree to the{' '}
                  <Text
                    style={styles.inlineLink}
                    onPress={() =>
                      Linking.openURL(`${CONFIG.siteUrl}/privacy-policy`)
                    }
                  >
                    Privacy Policy
                  </Text>{' '}
                  and the{' '}
                  <Text
                    style={styles.inlineLink}
                    onPress={() => Linking.openURL(`${CONFIG.siteUrl}/terms`)}
                  >
                    Terms & Conditions
                  </Text>
                  .
                </Checkbox>
                <Checkbox
                  checked={marketing}
                  onPress={() => setMarketing(v => !v)}
                >
                  Send me offers and new arrivals by email (optional).
                </Checkbox>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {usePassword ? (
              <Button
                label={busy ? 'Signing in...' : 'Sign in'}
                icon={<Lock size={15} color={colors.primaryForeground} />}
                onPress={passwordSignIn}
                disabled={busy}
              />
            ) : (
              <Button
                label={busy ? 'Sending...' : 'Send code'}
                onPress={() => send()}
                disabled={busy || wait > 0}
              />
            )}

            {mode === 'signin' ? (
              <Touch
                hitSlop={8}
                style={styles.center}
                onPress={() => setUsePassword(v => !v)}
              >
                <Text style={styles.link}>
                  {usePassword
                    ? 'Sign in with a code instead'
                    : 'Use my password instead'}
                </Text>
              </Touch>
            ) : (
              <Sans style={styles.small}>
                No password needed - we'll send a one-time code. You can set a
                password later.
              </Sans>
            )}
          </>
        )}
        {busy ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Checkbox({
  checked,
  onPress,
  children,
}: {
  checked: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Touch
      onPress={onPress}
      style={styles.check}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? (
          <Check size={14} color={colors.primaryForeground} strokeWidth={3} />
        ) : null}
      </View>
      <Text style={styles.checkText}>{children}</Text>
    </Touch>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, marginTop: 6, marginBottom: 18 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: 18,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
  },
  tabTextActive: { color: colors.primary },
  notice: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.foreground,
    backgroundColor: colors.accent,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    padding: 12,
    marginBottom: 16,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.foreground,
    marginBottom: 14,
  },
  code: {
    fontSize: 24,
    letterSpacing: 10,
    textAlign: 'center',
    fontFamily: fonts.sansSemi,
  },
  hint: { color: colors.mutedForeground, marginBottom: 16, lineHeight: 21 },
  strong: { fontFamily: fonts.sansSemi, color: colors.foreground },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginBottom: 12,
    lineHeight: 19,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  link: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primary },
  disabled: { color: colors.mutedForeground },
  center: { alignSelf: 'center', marginTop: 18 },
  small: {
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
  consent: { gap: 12, marginBottom: 16 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.foreground,
  },
  inlineLink: { color: colors.primary, textDecorationLine: 'underline' },
  spinner: { marginTop: 16 },
});
