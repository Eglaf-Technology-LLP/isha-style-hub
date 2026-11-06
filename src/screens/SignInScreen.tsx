import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MessageSquareText,
  Smartphone,
  UserRound,
} from 'lucide-react-native';
import { ComponentRef, ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  looksLikePhone,
  parseIdentifier,
  PASSWORD_MIN_LENGTH,
  sendCode,
  setOwnPassword,
  signInWithPassword,
  useSession,
  verifyCode,
} from '@/lib/auth';
import { success, tap } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useBack, useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

// The website's sign-in form (src/components/auth/InlineSignInForm.tsx on
// Live-Vendor), for customers:
// - Sign in: email or mobile, then a one-time code or the password (the
//   last choice is remembered). "Forgot password?" sets a new one after a code.
// - Create account: email or mobile, an optional password, the Privacy
//   Policy + Terms; a code confirms it, then the password is saved.
// - A code for a new email/number simply creates the account.

const CODE_LENGTH = 6;
const PHONE_RESEND_SECONDS = 60;
const METHOD_KEY = 'allboutiqs:signin-method';

type Tab = 'signin' | 'signup';
type Method = 'code' | 'password';
type View_ = 'form' | 'reset' | 'code';

const shown = (id: Identifier) =>
  id.kind === 'phone' ? formatPhone(id.value) : id.value;

export default function SignInScreen() {
  const back = useBack();
  const go = useGo();
  const status = useSession(st => st.status);
  const notice = useSession(st => st.notice);
  const clearNotice = useSession(st => st.clearNotice);
  const setPendingConsent = useSession(st => st.setPendingConsent);

  const startTab: Tab =
    (useRoute().params as { mode?: string } | undefined)?.mode === 'signup'
      ? 'signup'
      : 'signin';
  const [tab, setTab] = useState<Tab>(startTab);
  const [view, setView] = useState<View_>('form');
  const [method, setMethod] = useState<Method>('code');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [target, setTarget] = useState<Identifier | null>(null);
  // The password to save once the code is verified (Create account / Forgot password).
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);

  // Remembered sign-in method (code / password), as on the website.
  useEffect(() => {
    AsyncStorage.getItem(METHOD_KEY)
      .then(v => v === 'password' && setMethod('password'))
      .catch(() => undefined);
  }, []);
  const rememberMethod = (m: Method) =>
    AsyncStorage.setItem(METHOD_KEY, m).catch(() => undefined);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Signed in: back to where they came from (the password, if any, is
  // saved by then - see verify()).
  const closing = useRef(false);
  useEffect(() => {
    if (status === 'signed-in' && !verifying && !closing.current) {
      closing.current = true;
      back();
    }
  }, [status, verifying, back]);

  const parsed = parseIdentifier(identifier);
  const resetting = view === 'reset';
  const usesPassword = resetting || tab === 'signup' || method === 'password';
  const passwordRequired =
    resetting || (tab === 'signin' && method === 'password');

  const switchTo = (next: { tab?: Tab; view?: 'form' | 'reset' }) => {
    if (next.tab) setTab(next.tab);
    setView(next.view ?? 'form');
    setError(null);
    setConsentError(null);
    clearNotice();
  };

  const send = async (id: Identifier, savePassword: string | null) => {
    setBusy(true);
    setError(null);
    const result = await sendCode(id);
    setBusy(false);
    if (result.retryAfter) setResendIn(result.retryAfter);
    if (result.error) return setError(result.error);
    if (id.kind === 'phone' && !result.retryAfter)
      setResendIn(PHONE_RESEND_SECONDS);
    tap();
    setTarget(id);
    setPendingPassword(savePassword);
    setCode('');
    setView('code');
    toast(
      id.kind === 'phone'
        ? `Code texted to ${shown(id)}`
        : `Code sent to ${id.value}`,
    );
  };

  const submit = async () => {
    clearNotice();
    if (!parsed) {
      return setError(
        looksLikePhone(identifier)
          ? 'Enter a 10-digit mobile number (or +country code for numbers outside India).'
          : 'Enter a valid email address or mobile number.',
      );
    }
    const creating = tab === 'signup' && !resetting;
    if (creating && !terms) {
      return setConsentError(
        'Please agree to the Privacy Policy and the Terms & Conditions.',
      );
    }
    if (
      usesPassword &&
      (passwordRequired || password) &&
      password.length < PASSWORD_MIN_LENGTH
    ) {
      return setError(
        `Your password needs at least ${PASSWORD_MIN_LENGTH} characters.`,
      );
    }
    if (tab === 'signin' && method === 'password' && !resetting) {
      setBusy(true);
      setError(null);
      const r = await signInWithPassword(parsed, password);
      setBusy(false);
      if (r.error) return setError(r.error);
      rememberMethod('password');
      success();
      toast("You're signed in");
      return;
    }
    // Saved as soon as the code makes the account (src/lib/auth.ts).
    if (creating) setPendingConsent({ marketing });
    await send(parsed, usesPassword && password ? password : null);
  };

  const verify = async (value: string) => {
    if (!target || value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    const r = await verifyCode(target, value);
    if (r.error) {
      // Clear the boxes and put the cursor back for a fresh try.
      setVerifying(false);
      setError(r.error);
      setCode('');
      setTimeout(() => codeInput.current?.focus(), 0);
      return;
    }
    // Signed in now; the password still saves on the same session.
    let passwordError: string | null = null;
    if (pendingPassword)
      passwordError = (await setOwnPassword(pendingPassword)).error;
    rememberMethod(pendingPassword && !passwordError ? 'password' : 'code');
    success();
    if (passwordError) {
      Alert.alert(
        "You're signed in, but your password wasn't saved",
        `${passwordError} You can set it in Profile > Set a password.`,
        [
          { text: 'Later', onPress: back },
          {
            text: 'Set it now',
            onPress: () => go('/password', { replace: true }),
          },
        ],
      );
      closing.current = true;
    } else if (r.isNewUser) {
      toast(
        pendingPassword
          ? 'Welcome to AllBoutiqs! Your account is ready. Next time, sign in with your password or a code.'
          : 'Welcome to AllBoutiqs! Your account is ready.',
        { important: true },
      );
    } else if (pendingPassword) {
      toast("Password saved. You're signed in.");
    } else {
      toast("You're signed in");
    }
    setVerifying(false);
  };

  // ---------- code step ----------
  if (view === 'code' && target) {
    return (
      <Frame title="Enter the code">
        <Sans style={styles.hint}>
          We {target.kind === 'phone' ? 'texted' : 'sent'} a 6-digit code to{' '}
          <Text style={styles.strong}>{shown(target)}</Text>.{' '}
          <Text
            style={styles.inlineLink}
            onPress={() => {
              setView(pendingPassword && tab === 'signin' ? 'reset' : 'form');
              setError(null);
            }}
          >
            Change
          </Text>
        </Sans>
        {pendingPassword ? (
          <Sans style={styles.small}>
            Your password is saved as soon as the code is right.
          </Sans>
        ) : null}
        <TextInput
          ref={codeInput}
          value={code}
          onChangeText={t => {
            const v = t.replace(/\D/g, '').slice(0, CODE_LENGTH);
            setCode(v);
            setError(null);
            if (v.length === CODE_LENGTH) verify(v);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          editable={!verifying}
          maxLength={CODE_LENGTH}
          placeholder="------"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, styles.code]}
          accessibilityLabel="6-digit code"
        />
        {error ? (
          <Text
            style={[styles.error, styles.centerText]}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}
        <Button
          label={verifying ? 'Checking...' : 'Verify and continue'}
          onPress={() => verify(code)}
          disabled={verifying || code.length !== CODE_LENGTH}
        />
        <Sans style={[styles.small, styles.centerText, styles.gapTop]}>
          Didn't get it?{' '}
          {target.kind === 'email' ? 'Check spam, or' : 'Check the number, or'}{' '}
          {resendIn > 0 ? (
            <Text>resend in {resendIn}s</Text>
          ) : (
            <Text
              style={styles.inlineLink}
              onPress={() => !busy && send(target, pendingPassword)}
            >
              {busy ? 'sending...' : 'Resend code'}
            </Text>
          )}
        </Sans>
        {verifying ? (
          <ActivityIndicator color={colors.primary} style={styles.gapTop} />
        ) : null}
      </Frame>
    );
  }

  // ---------- form ----------
  const IdIcon =
    parsed?.kind === 'phone' || (!parsed && looksLikePhone(identifier))
      ? Smartphone
      : parsed
      ? Mail
      : UserRound;
  const idHint = !parsed
    ? 'Indian mobile numbers work without +91.'
    : !usesPassword || resetting || tab === 'signup'
    ? parsed.kind === 'phone'
      ? `We'll text a code to ${shown(parsed)}.`
      : `We'll email a code to ${parsed.value}.`
    : null;
  const submitLabel = resetting
    ? 'Send code'
    : tab === 'signup'
    ? 'Send verification code'
    : method === 'password'
    ? 'Sign in'
    : 'Send code';
  const footnote: ReactNode = resetting ? (
    <Text style={styles.inlineLink} onPress={() => switchTo({ view: 'form' })}>
      Back to sign in
    </Text>
  ) : tab === 'signup' ? (
    "We'll send a 6-digit code to confirm the email or mobile number is yours."
  ) : method === 'code' ? (
    'New to AllBoutiqs? The same code creates your account.'
  ) : (
    <>
      New here?{' '}
      <Text
        style={styles.inlineLink}
        onPress={() => switchTo({ tab: 'signup' })}
      >
        Create an account
      </Text>
    </>
  );

  return (
    <Frame
      title={
        resetting
          ? 'Set a new password'
          : tab === 'signin'
          ? 'Sign in'
          : 'Create account'
      }
    >
      {resetting ? (
        <Sans style={styles.hint}>
          We'll send a code to your email or mobile to confirm it's you, then
          save the new password. Never set one? This sets your first.
        </Sans>
      ) : (
        <View style={styles.tabs} accessibilityRole="tablist">
          {(
            [
              ['signin', 'Sign in'],
              ['signup', 'Create account'],
            ] as const
          ).map(([value, label]) => (
            <Touch
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              style={[styles.tab, tab === value && styles.tabActive]}
              onPress={() => switchTo({ tab: value })}
            >
              <Text
                style={[styles.tabText, tab === value && styles.tabTextActive]}
              >
                {label}
              </Text>
            </Touch>
          ))}
        </View>
      )}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={styles.label}>Email or mobile number</Text>
      <View style={styles.field}>
        <IdIcon size={17} color={colors.mutedForeground} />
        <TextInput
          value={identifier}
          onChangeText={t => {
            setIdentifier(t);
            setError(null);
          }}
          placeholder="Email or 10-digit mobile"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={
            looksLikePhone(identifier) ? 'phone-pad' : 'email-address'
          }
          autoComplete="username"
          textContentType="username"
          style={styles.fieldInput}
          returnKeyType={usesPassword ? 'next' : 'send'}
          onSubmitEditing={usesPassword ? undefined : submit}
        />
      </View>
      {idHint ? <Sans style={styles.small}>{idHint}</Sans> : null}

      {tab === 'signin' && !resetting ? (
        <View style={styles.methods} accessibilityRole="radiogroup">
          <MethodChoice
            active={method === 'code'}
            onPress={() => setMethod('code')}
            icon={MessageSquareText}
          >
            One-time code
          </MethodChoice>
          <MethodChoice
            active={method === 'password'}
            onPress={() => setMethod('password')}
            icon={KeyRound}
          >
            Password
          </MethodChoice>
        </View>
      ) : null}

      {usesPassword ? (
        <>
          <View style={styles.labelRow}>
            <Text style={styles.label}>
              {resetting
                ? 'New password'
                : tab === 'signup'
                ? 'Create a password'
                : 'Password'}
              {tab === 'signup' && !resetting ? (
                <Text style={styles.optional}> (optional)</Text>
              ) : null}
            </Text>
            {tab === 'signin' && !resetting ? (
              <Text
                style={[styles.inlineLink, styles.smallLink]}
                onPress={() => switchTo({ view: 'reset' })}
              >
                Forgot password?
              </Text>
            ) : null}
          </View>
          <View style={styles.field}>
            <TextInput
              value={password}
              onChangeText={v => {
                setPassword(v);
                setError(null);
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={
                tab === 'signin' && !resetting
                  ? 'current-password'
                  : 'new-password'
              }
              textContentType={
                tab === 'signin' && !resetting ? 'password' : 'newPassword'
              }
              style={styles.fieldInput}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <Touch
              hitSlop={10}
              onPress={() => setShowPassword(v => !v)}
              accessibilityLabel={
                showPassword ? 'Hide password' : 'Show password'
              }
            >
              {showPassword ? (
                <EyeOff size={19} color={colors.mutedForeground} />
              ) : (
                <Eye size={19} color={colors.mutedForeground} />
              )}
            </Touch>
          </View>
          {resetting || tab === 'signup' ? (
            <Sans style={styles.small}>
              At least {PASSWORD_MIN_LENGTH} characters.
              {tab === 'signup' && !resetting
                ? ' Leave it empty to always sign in with a one-time code.'
                : ''}
            </Sans>
          ) : null}
        </>
      ) : null}

      {tab === 'signup' && !resetting ? (
        <View style={styles.consent}>
          <Checkbox
            checked={terms}
            onPress={() => {
              setTerms(v => !v);
              setConsentError(null);
            }}
          >
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
          <Checkbox checked={marketing} onPress={() => setMarketing(v => !v)}>
            Send me offers and new arrivals by email (optional).
          </Checkbox>
          {consentError ? (
            <Text style={styles.error}>{consentError}</Text>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        label={busy ? 'Please wait...' : submitLabel}
        onPress={submit}
        disabled={busy}
        style={styles.gapTop}
      />
      <Sans style={[styles.small, styles.centerText, styles.gapTop]}>
        {footnote}
      </Sans>
      {busy ? (
        <ActivityIndicator color={colors.primary} style={styles.gapTop} />
      ) : null}
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader back title={title} />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Eyebrow>Welcome to AllBoutiqs</Eyebrow>
        <Serif style={styles.title}>{title}</Serif>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MethodChoice({
  active,
  onPress,
  icon: Icon,
  children,
}: {
  active: boolean;
  onPress: () => void;
  icon: typeof KeyRound;
  children: ReactNode;
}) {
  return (
    <Touch
      haptic
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={[styles.method, active && styles.methodActive]}
    >
      <Icon
        size={16}
        color={active ? colors.primary : colors.mutedForeground}
      />
      <Text style={[styles.methodText, active && styles.methodTextActive]}>
        {children}
      </Text>
    </Touch>
  );
}

export function Checkbox({
  checked,
  onPress,
  children,
}: {
  checked: boolean;
  onPress: () => void;
  children: ReactNode;
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
    marginBottom: 20,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
  },
  tabTextActive: { color: colors.foreground },
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 16,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
    marginBottom: 8,
  },
  optional: {
    fontFamily: fonts.sans,
    textTransform: 'none',
    letterSpacing: 0,
    color: colors.mutedForeground,
  },
  field: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    paddingHorizontal: 14,
  },
  fieldInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.foreground,
    paddingVertical: 0,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    paddingHorizontal: 14,
    color: colors.foreground,
    marginVertical: 16,
  },
  code: {
    fontSize: 26,
    letterSpacing: 12,
    textAlign: 'center',
    fontFamily: fonts.sansSemi,
  },
  methods: { flexDirection: 'row', gap: 8, marginTop: 16 },
  method: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
  },
  methodActive: { borderColor: colors.primary, backgroundColor: colors.accent },
  methodText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.mutedForeground,
  },
  methodTextActive: { color: colors.primary },
  hint: { color: colors.mutedForeground, marginBottom: 8, lineHeight: 21 },
  strong: { fontFamily: fonts.sansSemi, color: colors.foreground },
  small: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 6,
    lineHeight: 18,
  },
  smallLink: { fontSize: 12 },
  centerText: { textAlign: 'center' },
  gapTop: { marginTop: 16 },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 12,
    lineHeight: 19,
  },
  consent: { gap: 12, marginTop: 18 },
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
});
