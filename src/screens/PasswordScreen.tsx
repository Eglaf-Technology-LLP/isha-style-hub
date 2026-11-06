import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Button, Eyebrow, Sans, Serif, Touch } from '@/components/ui';
import {
  hasOwnPassword,
  PASSWORD_MIN_LENGTH,
  setOwnPassword,
  userContact,
  useSession,
} from '@/lib/auth';
import { success } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useBack } from '@/navigation';
import { colors, fonts } from '@/theme';

// Set or change the customer's own password (accounts start with one-time
// codes only, as on the website's Sign-in & security). Opened from Profile,
// or after a sign-up whose password didn't save.
export default function PasswordScreen() {
  const back = useBack();
  const user = useSession(st => st.user);
  const hasOne = hasOwnPassword(user);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH)
      return setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const r = await setOwnPassword(password);
    setBusy(false);
    if (r.error) return setError(r.error);
    success();
    toast(
      hasOne
        ? 'Password changed'
        : 'Password set. Next time, sign in with it or a code.',
      {
        important: true,
      },
    );
    back();
  };

  const title = hasOne ? 'Change password' : 'Set a password';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <AppHeader back title={title} />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Eyebrow>Sign-in & security</Eyebrow>
        <Serif style={styles.title}>{title}</Serif>
        <Sans style={styles.hint}>
          For <Text style={styles.strong}>{userContact(user)}</Text>. At least{' '}
          {PASSWORD_MIN_LENGTH} characters. One-time codes keep working too.
        </Sans>

        <Text style={styles.label}>{hasOne ? 'New password' : 'Password'}</Text>
        <View style={styles.field}>
          <TextInput
            value={password}
            onChangeText={t => {
              setPassword(t);
              setError(null);
            }}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            autoFocus
            style={styles.input}
          />
          <Touch
            hitSlop={10}
            onPress={() => setShow(v => !v)}
            accessibilityLabel={show ? 'Hide password' : 'Show password'}
          >
            {show ? (
              <EyeOff size={20} color={colors.mutedForeground} />
            ) : (
              <Eye size={20} color={colors.mutedForeground} />
            )}
          </Touch>
        </View>

        <Text style={styles.label}>Confirm password</Text>
        <View style={styles.field}>
          <TextInput
            value={confirm}
            onChangeText={t => {
              setConfirm(t);
              setError(null);
            }}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            style={styles.input}
            onSubmitEditing={save}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={busy ? 'Saving...' : 'Save password'}
          onPress={save}
          disabled={busy}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, marginTop: 6, marginBottom: 10 },
  hint: { color: colors.mutedForeground, lineHeight: 21, marginBottom: 20 },
  strong: { fontFamily: fonts.sansSemi, color: colors.foreground },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
    marginBottom: 8,
  },
  field: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.foreground,
    paddingVertical: 0,
  },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginBottom: 12,
  },
});
