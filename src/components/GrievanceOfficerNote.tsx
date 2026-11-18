import { Linking, StyleSheet, Text, View } from 'react-native';
import { COMPANY, telHref } from '@/content/company';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

// The Grievance Officer, small but always visible on every product page
// (Consumer Protection (E-Commerce) Rules, 2020) - worded as on the website
// (src/components/legal/GrievanceOfficerNote.tsx). Details from
// src/content/company.ts (generated from the website's src/lib/company.ts).
export function GrievanceOfficerNote() {
  const go = useGo();
  const g = COMPANY.grievanceOfficer;
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
          onPress={() => Linking.openURL(telHref(g.phone))}
        >
          {g.phone}
        </Text>
        {' · '}
        {COMPANY.legalName}, {COMPANY.officeAddress}
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
