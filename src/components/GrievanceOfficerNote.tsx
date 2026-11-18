import { Linking, StyleSheet, Text, View } from 'react-native';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

// The Grievance Officer, small but always visible on every product page
// (Consumer Protection (E-Commerce) Rules, 2020) - worded as on the website
// (src/components/legal/GrievanceOfficerNote.tsx; details from its
// src/lib/company.ts, client corrections 15 Nov 2026).
export const GRIEVANCE_OFFICER = {
  name: 'Dhvani Soni',
  email: 'grievance@allboutiqs.com',
  phone: '+91 76004 84789',
} as const;
export const COMPANY_LEGAL_NAME = 'AllBoutiqs Private Limited';
export const COMPANY_OFFICE_ADDRESS =
  'PL-19, Puniynagari, Near Smrudhipark, Disa Bazar, Deesa, Banaskantha-385535, Gujarat';

export function GrievanceOfficerNote() {
  const go = useGo();
  const g = GRIEVANCE_OFFICER;
  return (
    <View style={styles.wrap} accessibilityLabel="Grievance Officer">
      <Text style={styles.text}>
        <Text style={styles.label}>Grievance Officer:</Text> {g.name}
        {' · '}
        <Text
          style={styles.link}
          onPress={() => Linking.openURL(`mailto:${g.email}`)}
        >
          {g.email}
        </Text>
        {' · '}
        <Text
          style={styles.link}
          onPress={() => Linking.openURL(`tel:${g.phone.replace(/\s/g, '')}`)}
        >
          {g.phone}
        </Text>
        {' · '}
        {COMPANY_LEGAL_NAME}, {COMPANY_OFFICE_ADDRESS}
      </Text>
      <Text
        style={[styles.text, styles.link, styles.more]}
        onPress={() => go('/privacy-policy')}
        accessibilityRole="link"
      >
        How complaints are handled
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  text: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mutedForeground,
  },
  label: { color: colors.foreground },
  link: { textDecorationLine: 'underline' },
  more: { marginTop: 4, alignSelf: 'flex-start' },
});
