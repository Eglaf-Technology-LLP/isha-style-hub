import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Field } from '@/components/Form';
import { Button, Sans } from '@/components/ui';
import { saveProfile, useProfile } from '@/lib/account';
import { formatPhone, useSession } from '@/lib/auth';
import { success } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useBack } from '@/navigation';
import { colors, fonts } from '@/theme';

// Profile: full name and phone (profiles table), sign-in email shown read-only.
export default function MyProfileScreen() {
  const back = useBack();
  const user = useSession(st => st.user);
  const { data, isLoading, refetch } = useProfile();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.full_name);
      setPhone(data.phone);
    }
  }, [data]);

  const save = async () => {
    setError(null);
    setBusy(true);
    const err = await saveProfile({ full_name: name, phone });
    setBusy(false);
    if (err) return setError(err);
    success();
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
          onChangeText={setName}
          autoComplete="name"
          placeholder="Your name"
        />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="+91 98765 43210"
        />
        {user?.email ? (
          <Field label="Email" value={user.email} editable={false} />
        ) : null}
        {user?.phone ? (
          <Field
            label="Sign-in mobile"
            value={formatPhone(user.phone)}
            editable={false}
            hint="The number you sign in with."
          />
        ) : null}
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
});
