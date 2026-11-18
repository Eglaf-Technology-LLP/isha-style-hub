import { ComponentRef, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Field } from '@/components/Form';
import { Button, Sans } from '@/components/ui';
import { saveProfile, useProfile } from '@/lib/account';
import {
  contactTaken,
  formatPhone,
  nationalPhone,
  parseIdentifier,
  sendEmailLinkCode,
  signedUpWith,
  toE164,
  useSession,
  verifyEmailLink,
} from '@/lib/auth';
import { success, tap } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useBack } from '@/navigation';
import { CODE_LENGTH, CodeBoxes } from '@/screens/SignInScreen';
import { colors, fonts } from '@/theme';

const takenMessage = (what: 'email' | 'mobile number') =>
  `This ${what} is already registered with another AllBoutiqs account.`;

// Profile: full name (profiles table), email and mobile number - as the
// website's My Account (Live-Vendor ProfileSection, client 16 Nov 2026).
// The one the account was registered with is shown locked, for good - also
// after the other one is added and used to sign in. The other one can be
// added or changed, but never to one another account already has. An email
// added here is confirmed with a code and becomes a second way to sign in;
// a mobile number added here is the contact number for orders.
export default function MyProfileScreen() {
  const back = useBack();
  const user = useSession(st => st.user);
  const { data, isLoading, refetch } = useProfile();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneLocked = signedUpWith(user) === 'phone';
  // A refetch mustn't wipe what's typed but not saved yet.
  const edited = useRef(false);

  useEffect(() => {
    if (data && !edited.current) {
      setName(data.full_name);
      setPhone(nationalPhone(data.phone));
    }
  }, [data]);

  const save = async () => {
    setError(null);
    // Registered with a mobile number: the profile keeps that number.
    // Otherwise the typed one, if it's a real number no other account has.
    let savedPhone = '';
    if (phoneLocked) {
      savedPhone = user?.phone ? `+${user.phone.replace(/\D/g, '')}` : '';
    } else if (phone.trim()) {
      const e164 = toE164(phone);
      if (!e164)
        return setError(
          'Enter a 10-digit mobile number (or +country code for numbers outside India).',
        );
      setBusy(true);
      const taken = await contactTaken({ phone: e164 });
      setBusy(false);
      if (taken) return setError(takenMessage('mobile number'));
      savedPhone = e164;
    }
    setBusy(true);
    const err = await saveProfile({ full_name: name, phone: savedPhone });
    setBusy(false);
    if (err) return setError(err);
    success();
    edited.current = false;
    refetch();
    toast('Profile updated successfully!');
    back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <AppHeader back title="My profile" />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {!isLoading && !data?.full_name ? (
          <Sans style={styles.note}>
            Add your name - it goes on your orders and invoices.
          </Sans>
        ) : null}
        <Field
          label="Full name"
          value={name}
          onChangeText={t => {
            edited.current = true;
            setName(t);
          }}
          autoComplete="name"
          placeholder="Your name"
        />
        {phoneLocked ? (
          <EmailField current={user?.email || ''} />
        ) : (
          <Field
            label="Email"
            value={user?.email || ''}
            editable={false}
            hint="You registered with this email, so it can't be changed."
          />
        )}
        {phoneLocked ? (
          <Field
            label="Mobile number"
            value={formatPhone(user?.phone)}
            editable={false}
            hint="You registered with this number, so it can't be changed."
          />
        ) : (
          <Field
            label="Mobile number"
            value={phone}
            onChangeText={t => {
              edited.current = true;
              setPhone(t);
              setError(null);
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="10-digit mobile number"
            hint="For your orders and deliveries."
          />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={busy ? 'Saving...' : 'Save'}
          onPress={save}
          disabled={busy || isLoading}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// The email of an account registered with a mobile number: add one, or
// change it, by confirming a code sent to it. It then signs in to this same
// account (auth-email-otp, purpose "link").
function EmailField({ current }: { current: string }) {
  const [text, setText] = useState(current);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);

  // Shows the saved email once it's confirmed.
  useEffect(() => setText(current), [current]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const parsed = parseIdentifier(text);
  const email = parsed?.kind === 'email' ? parsed.value : null;
  const changed = text.trim().toLowerCase() !== current.toLowerCase();

  const sendCode = async (value: string) => {
    setBusy(true);
    setError(null);
    if (await contactTaken({ email: value })) {
      setBusy(false);
      return setError(takenMessage('email'));
    }
    const r = await sendEmailLinkCode(value);
    setBusy(false);
    if (r.retryAfter) setResendIn(r.retryAfter);
    if (r.error) return setError(r.error);
    if (!r.retryAfter) setResendIn(60);
    tap();
    setSentTo(value);
    setCode('');
  };

  const check = async (typed: string) => {
    if (!sentTo || typed.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const r = await verifyEmailLink(sentTo, typed);
    setBusy(false);
    if (r.error) {
      // Clear the boxes and put the cursor back for a fresh try.
      setError(r.error);
      setCode('');
      setTimeout(() => codeInput.current?.focus(), 0);
      return;
    }
    success();
    toast(`${sentTo} saved. You can sign in with it too.`);
    setSentTo(null);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Email</Text>
      <TextInput
        value={text}
        editable={!sentTo}
        onChangeText={t => {
          setText(t);
          setError(null);
        }}
        placeholder="you@example.com"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        style={[
          styles.input,
          !!sentTo && styles.readOnly,
          !!error && styles.inputError,
        ]}
      />

      {sentTo ? (
        <>
          <Sans style={styles.small}>
            Enter the 6-digit code sent to{' '}
            <Text style={styles.strong}>{sentTo}</Text>.{' '}
            {resendIn > 0 ? (
              <Text>Resend in {resendIn}s</Text>
            ) : (
              <Text
                style={styles.link}
                onPress={() => !busy && sendCode(sentTo)}
              >
                Resend code
              </Text>
            )}
          </Sans>
          <CodeBoxes
            value={code}
            inputRef={codeInput}
            disabled={busy}
            onChange={v => {
              setCode(v);
              setError(null);
              if (v.length === CODE_LENGTH) check(v);
            }}
          />
          {error ? (
            <Text style={styles.fieldError} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={busy ? 'Checking...' : 'Verify'}
              onPress={() => check(code)}
              disabled={busy || code.length !== CODE_LENGTH}
              style={styles.action}
            />
            <Button
              label="Cancel"
              variant="outline"
              onPress={() => {
                setSentTo(null);
                setError(null);
              }}
              style={styles.action}
            />
          </View>
        </>
      ) : (
        <>
          {error ? (
            <Text style={styles.fieldError} accessibilityRole="alert">
              {error}
            </Text>
          ) : (
            <Text style={styles.hint}>
              {changed && text.trim() && !email
                ? 'Enter a valid email address.'
                : "We'll email a code to confirm it. You can then sign in with it too."}
            </Text>
          )}
          {changed && text.trim() ? (
            <Button
              label={
                busy
                  ? 'Sending...'
                  : current
                  ? 'Verify new email'
                  : 'Verify email'
              }
              variant="outline"
              onPress={() => email && sendCode(email)}
              disabled={busy || !email}
              style={styles.verify}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 40 },
  note: {
    backgroundColor: colors.accent,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    padding: 12,
    marginBottom: 16,
    lineHeight: 20,
  },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginBottom: 12,
  },
  // The email / mobile field with its code step: the same look as Field.
  block: { marginBottom: 14 },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
    marginBottom: 7,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  readOnly: { backgroundColor: colors.muted, color: colors.mutedForeground },
  inputError: { borderColor: colors.destructive },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 5,
  },
  fieldError: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.destructive,
    marginTop: 6,
    lineHeight: 18,
  },
  small: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 10,
    lineHeight: 19,
  },
  strong: { fontFamily: fonts.sansSemi, color: colors.foreground },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  verify: { marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: { flex: 1 },
});
