import { Check, ChevronDown, CircleCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Field } from '@/components/Form';
import { Sheet } from '@/components/Listing';
import { Button, Sans, Serif, Touch } from '@/components/ui';
import { COMPANY } from '@/content/company';
import { useProfile } from '@/lib/account';
import { useSession } from '@/lib/auth';
import {
  checkComplaint,
  COMPLAINT_CATEGORIES,
  COMPLAINT_MESSAGE_MAX,
  COMPLAINT_MESSAGE_MIN,
  ComplaintErrors,
  ComplaintFields,
  EMPTY_COMPLAINT,
  nationalPhone,
  submitComplaint,
} from '@/lib/complaints';
import { success } from '@/lib/haptics';
import { useBack } from '@/navigation';
import { colors, fonts } from '@/theme';

// Raise a complaint (the website's complaint form, from its footer and
// Contact us): name, email, mobile, what it's about, order number
// (optional) and the complaint. Shows the ticket number once it's in.
export default function ComplaintScreen() {
  const back = useBack();
  const user = useSession(st => st.user);
  const { data: profile } = useProfile();
  const [fields, setFields] = useState<ComplaintFields>(EMPTY_COMPLAINT);
  const [errors, setErrors] = useState<ComplaintErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<{
    ticket: string;
    ackSent: boolean;
    email: string;
  } | null>(null);

  // Signed in: start with the account's name, email and mobile number.
  useEffect(() => {
    if (!user) return;
    setFields(f => ({
      ...f,
      name: f.name || profile?.full_name?.trim() || '',
      email: f.email || user.email || '',
      phone:
        f.phone || nationalPhone(user.phone || profile?.phone?.trim() || ''),
    }));
  }, [user, profile]);

  const set = (key: keyof ComplaintFields) => (value: string) => {
    setFields(f => ({ ...f, [key]: value }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const found = checkComplaint(fields);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    const res = await submitComplaint(fields);
    setSubmitting(false);
    if (res.error !== undefined) return setServerError(res.error);
    success();
    setResult({
      ticket: res.ticket,
      ackSent: res.ackSent,
      email: fields.email.trim(),
    });
  };

  if (result) {
    return (
      <View style={styles.flex}>
        <AppHeader back title="Complaint submitted" />
        <ScrollView contentContainerStyle={styles.done}>
          <CircleCheck size={42} color={colors.primary} strokeWidth={1.6} />
          <Serif style={styles.doneTitle}>Complaint submitted</Serif>
          <Sans style={styles.muted}>Your ticket number is</Sans>
          <Text style={styles.ticket} selectable>
            {result.ticket}
          </Text>
          <Sans style={[styles.muted, styles.center]}>
            {result.ackSent ? (
              <>
                We've emailed a confirmation to{' '}
                <Text style={styles.strong}>{result.email}</Text>.
              </>
            ) : (
              "We couldn't email you a confirmation, so please note your ticket number."
            )}{' '}
            We'll get back to you within 48 hours.
          </Sans>
          <Button label="Done" onPress={back} style={styles.doneButton} />
        </ScrollView>
      </View>
    );
  }

  const messageLength = fields.message.trim().length;
  const category = COMPLAINT_CATEGORIES.find(c => c.value === fields.category);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <AppHeader back title="Raise a complaint" />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Sans style={styles.intro}>
          Tell us what went wrong. You'll get a ticket number by email, and
          we'll get back to you within 48 hours.
        </Sans>

        <Field
          label="Full name"
          autoComplete="name"
          maxLength={100}
          value={fields.name}
          onChangeText={set('name')}
        />
        <FieldError text={errors.name} />
        <Field
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          maxLength={254}
          value={fields.email}
          onChangeText={set('email')}
        />
        <FieldError text={errors.email} />
        <Field
          label="Mobile number"
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={20}
          placeholder="98765 43210"
          value={fields.phone}
          onChangeText={set('phone')}
        />
        <FieldError text={errors.phone} />

        <View style={styles.pickWrap}>
          <Text style={styles.label}>Complaint about</Text>
          <Touch
            style={styles.pick}
            onPress={() => setPicking(true)}
            accessibilityRole="button"
          >
            <Text style={[styles.pickText, !category && styles.placeholder]}>
              {category?.label ?? 'Choose one'}
            </Text>
            <ChevronDown size={18} color={colors.mutedForeground} />
          </Touch>
        </View>
        <FieldError text={errors.category} />
        <Sheet
          visible={picking}
          title="Complaint about"
          onClose={() => setPicking(false)}
        >
          {COMPLAINT_CATEGORIES.map(c => (
            <Touch
              key={c.value}
              style={styles.option}
              onPress={() => {
                set('category')(c.value);
                setPicking(false);
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  c.value === fields.category && styles.optionOn,
                ]}
              >
                {c.label}
              </Text>
              {c.value === fields.category ? (
                <Check size={17} color={colors.primary} />
              ) : null}
            </Touch>
          ))}
        </Sheet>

        <Field
          label="Order number (optional)"
          maxLength={40}
          autoCapitalize="characters"
          placeholder="If it's about an order"
          value={fields.orderNumber}
          onChangeText={set('orderNumber')}
        />
        <Field
          label="Your complaint"
          multiline
          maxLength={COMPLAINT_MESSAGE_MAX}
          placeholder="What happened, and what would you like us to do?"
          value={fields.message}
          onChangeText={set('message')}
          style={styles.message}
          hint={
            messageLength < COMPLAINT_MESSAGE_MIN
              ? `${
                  COMPLAINT_MESSAGE_MIN - messageLength
                } more characters needed`
              : `${messageLength} / ${COMPLAINT_MESSAGE_MAX}`
          }
        />
        <FieldError text={errors.message} />

        {serverError ? (
          <Text style={styles.serverError} accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}

        <Button
          label={submitting ? 'Sending' : 'Submit complaint'}
          onPress={submit}
          disabled={submitting}
        />
        <Sans style={[styles.muted, styles.center, styles.or]}>
          Or write to our Grievance Officer at{' '}
          <Text
            style={styles.link}
            onPress={() =>
              Linking.openURL(`mailto:${COMPANY.grievanceOfficer.email}`)
            }
          >
            {COMPANY.grievanceOfficer.email}
          </Text>
        </Sans>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldError({ text }: { text?: string }) {
  return text ? <Text style={styles.fieldError}>{text}</Text> : null;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 40 },
  intro: { color: colors.mutedForeground, lineHeight: 21, marginBottom: 18 },
  message: { minHeight: 130 },
  fieldError: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.destructive,
    marginTop: -8,
    marginBottom: 14,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
    marginBottom: 7,
  },
  pickWrap: { marginBottom: 14 },
  pick: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickText: { fontFamily: fonts.sans, fontSize: 15, color: colors.foreground },
  placeholder: { color: colors.mutedForeground },
  option: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  optionOn: { color: colors.primary, fontFamily: fonts.sansMedium },
  serverError: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.destructive,
    borderWidth: 1,
    borderColor: 'rgba(171,56,43,0.4)',
    backgroundColor: 'rgba(171,56,43,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  muted: { color: colors.mutedForeground, lineHeight: 21 },
  center: { textAlign: 'center' },
  or: { marginTop: 14, fontSize: 12 },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  strong: { color: colors.foreground },
  done: { alignItems: 'center', padding: 24, paddingTop: 40 },
  doneTitle: { fontSize: 26, marginTop: 14, marginBottom: 6 },
  ticket: {
    fontFamily: fonts.sansSemi,
    fontSize: 24,
    letterSpacing: 2,
    color: colors.primary,
    marginVertical: 12,
  },
  doneButton: { alignSelf: 'stretch', marginTop: 24 },
});
