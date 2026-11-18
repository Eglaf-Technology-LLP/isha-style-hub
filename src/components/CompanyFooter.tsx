import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react-native';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { COMPANY, telHref } from '@/content/company';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';
import { Button, Eyebrow, Touch } from './ui';

// The website footer's company details (src/components/Footer.tsx), at the
// bottom of the Profile tab: complaints, customer care (WhatsApp only on the
// WhatsApp number), the registered office, Grievance Officer and ISO line.
export function CompanyFooter() {
  const go = useGo();
  const g = COMPANY.grievanceOfficer;
  const care = [
    {
      icon: Phone,
      text: `Call ${COMPANY.supportPhone}`,
      href: telHref(COMPANY.supportPhone),
    },
    {
      icon: MessageCircle,
      text: `WhatsApp ${COMPANY.whatsapp} (WhatsApp only)`,
      href: COMPANY.whatsappUrl,
    },
    {
      icon: Mail,
      text: COMPANY.supportEmail,
      href: `mailto:${COMPANY.supportEmail}`,
    },
  ];

  return (
    <View style={styles.wrap}>
      <Eyebrow style={styles.eyebrow}>Complaints</Eyebrow>
      <Text style={styles.text}>
        Something not right with an order, a boutique or the site? Tell us.
        You'll get a ticket number by email, and we'll get back to you within 48
        hours.
      </Text>
      <Button
        label="Raise a complaint"
        variant="light"
        onPress={() => go('/complaint')}
        style={styles.button}
      />

      <View style={styles.rule} />
      <Eyebrow style={styles.eyebrow}>Customer care</Eyebrow>
      {care.map(({ icon: Icon, text, href }) => (
        <Touch
          key={href}
          style={styles.row}
          onPress={() => Linking.openURL(href)}
          accessibilityRole="link"
        >
          <Icon size={16} color={colors.gold} strokeWidth={1.7} />
          <Text style={styles.rowText}>{text}</Text>
        </Touch>
      ))}
      <View style={styles.row}>
        <MapPin size={16} color={colors.gold} strokeWidth={1.7} />
        <Text style={styles.rowText}>{COMPANY.officeAddress}</Text>
      </View>

      <View style={styles.rule} />
      <Text style={styles.text}>
        India's Premium Boutique Marketplace – women's designer fashion from
        boutiques and designer brands.
      </Text>
      <Text style={styles.small}>
        Grievance Officer: {g.name} ·{' '}
        <Text
          style={styles.smallLink}
          onPress={() => Linking.openURL(`mailto:${g.email}`)}
        >
          {g.email}
        </Text>{' '}
        ·{' '}
        <Text
          style={styles.smallLink}
          onPress={() => Linking.openURL(telHref(g.phone))}
        >
          {g.phone}
        </Text>
      </Text>
      <Text style={styles.small}>{COMPANY.isoCertificate}</Text>
      <Text style={[styles.small, styles.legal]}>
        © {new Date().getFullYear()} {COMPANY.legalName} · GSTIN {COMPANY.gstin}{' '}
        · CIN {COMPANY.cin}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 24,
    backgroundColor: colors.ink,
    paddingHorizontal: 20,
    paddingVertical: 26,
  },
  eyebrow: { marginBottom: 10 },
  text: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(252,251,248,0.7)',
  },
  button: { alignSelf: 'flex-start', marginTop: 16, borderColor: colors.gold },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(252,251,248,0.15)',
    marginVertical: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 7,
  },
  rowText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(252,251,248,0.8)',
  },
  small: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 19,
    color: 'rgba(252,251,248,0.6)',
    marginTop: 10,
  },
  smallLink: { color: 'rgba(252,251,248,0.85)' },
  legal: { marginTop: 16, color: 'rgba(252,251,248,0.5)' },
});
