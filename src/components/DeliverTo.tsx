import { Check, ChevronDown, MapPin } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';
import { Address, useAddressActions, useAddresses } from '@/lib/account';
import { toast } from '@/lib/toast';
import { AddressSheet } from '@/screens/AddressesScreen';
import { colors, fonts } from '@/theme';
import { Sheet } from './Listing';
import { Button, Sans, Touch } from './ui';

// The delivery address for this purchase (Myntra-style "Deliver to" strip on
// the bag): the default saved address unless another is picked; add one
// right here when there is none.

interface DeliverState {
  addressId: string | null;
  sheet: 'pick' | 'add' | null;
  pick: (id: string) => void;
  open: (sheet: 'pick' | 'add' | null) => void;
}

export const useDeliverTo = create<DeliverState>(set => ({
  addressId: null,
  sheet: null,
  pick: addressId => set({ addressId, sheet: null }),
  open: sheet => set({ sheet }),
}));

// The address the order will go to: the one picked, else the default, else
// the newest.
export function useDeliveryAddress(): {
  address: Address | null;
  loading: boolean;
} {
  const { data = [], isLoading } = useAddresses();
  const picked = useDeliverTo(st => st.addressId);
  const address =
    data.find(a => a.id === picked) ??
    data.find(a => a.is_default) ??
    data[0] ??
    null;
  return { address, loading: isLoading };
}

export function DeliverTo() {
  const { data: addresses = [] } = useAddresses();
  const { address, loading } = useDeliveryAddress();
  const { sheet, open, pick } = useDeliverTo();
  const { save } = useAddressActions();

  return (
    <View style={styles.wrap}>
      {/* Always a dropdown: the chosen address, or "Select a delivery
          address" when there is none - tap for the list and Add new. */}
      <Touch
        style={styles.row}
        onPress={() => open('pick')}
        accessibilityRole="button"
        accessibilityLabel={
          address
            ? `Deliver to ${address.full_name}, ${address.pincode}. Change`
            : 'Select a delivery address'
        }
      >
        <MapPin size={18} color={colors.primary} strokeWidth={1.6} />
        <View style={styles.flex}>
          {address ? (
            <>
              <Text style={styles.to} numberOfLines={1}>
                Deliver to:{' '}
                <Text style={styles.strong}>
                  {address.full_name}, {address.pincode}
                </Text>
              </Text>
              <Sans style={styles.line} numberOfLines={1}>
                {[address.address_line_1, address.address_line_2, address.city]
                  .filter(Boolean)
                  .join(', ')}
              </Sans>
            </>
          ) : (
            <Text style={styles.selectText}>
              {loading ? 'Loading addresses...' : 'Select a delivery address'}
            </Text>
          )}
        </View>
        <ChevronDown size={18} color={colors.primary} />
      </Touch>

      <Sheet
        visible={sheet === 'pick'}
        title="Deliver to"
        onClose={() => open(null)}
        scroll
      >
        {addresses.length === 0 ? (
          <Sans style={styles.none}>
            No saved addresses yet. Add one to see it here.
          </Sans>
        ) : null}
        {addresses.map(a => {
          const on = a.id === address?.id;
          return (
            <Touch
              key={a.id}
              style={[styles.option, on && styles.optionOn]}
              onPress={() => pick(a.id)}
            >
              <View style={[styles.radio, on && styles.radioOn]}>
                {on ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.flex}>
                <Text style={styles.strong}>
                  {a.full_name}
                  {a.label ? (
                    <Text style={styles.label}> {a.label.toUpperCase()}</Text>
                  ) : null}
                </Text>
                <Sans style={styles.line}>
                  {[
                    a.address_line_1,
                    a.address_line_2,
                    `${a.city}, ${a.state} - ${a.pincode}`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </Sans>
                <Sans style={styles.line}>{a.phone}</Sans>
              </View>
              {on ? <Check size={16} color={colors.primary} /> : null}
            </Touch>
          );
        })}
        <Button
          label="Add a new address"
          variant={addresses.length ? 'outline' : 'primary'}
          onPress={() => open('add')}
          style={styles.gapTop}
        />
      </Sheet>

      <AddressSheet
        editing={sheet === 'add' ? 'new' : null}
        onClose={() => open(null)}
        onSave={async form => {
          // The first address becomes the default, as on the website.
          const err = await save(
            {
              ...form,
              is_default: form.is_default || addresses.length === 0,
            },
            undefined,
            // The address just added is the one this order goes to.
            pick,
          );
          if (!err) toast('Address saved');
          return err;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { backgroundColor: colors.ivory, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  to: { fontFamily: fonts.sans, fontSize: 13, color: colors.foreground },
  strong: { fontFamily: fonts.sansSemi, color: colors.foreground },
  line: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  selectText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.primary,
  },
  none: { color: colors.mutedForeground, paddingVertical: 12 },
  option: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionOn: { backgroundColor: colors.accent },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.mutedForeground,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  gapTop: { marginTop: 16 },
});
