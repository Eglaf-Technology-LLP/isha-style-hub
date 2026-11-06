import { Check, MapPin, Plus } from 'lucide-react-native';
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
      {address ? (
        <View style={styles.row}>
          <MapPin size={18} color={colors.primary} strokeWidth={1.6} />
          <View style={styles.flex}>
            <Text style={styles.to} numberOfLines={1}>
              Deliver to:{' '}
              <Text style={styles.strong}>
                {address.full_name}, {address.pincode}
              </Text>
            </Text>
            <Sans style={styles.line} numberOfLines={1}>
              {[address.address_line1, address.address_line2, address.city]
                .filter(Boolean)
                .join(', ')}
            </Sans>
          </View>
          <Touch hitSlop={8} style={styles.change} onPress={() => open('pick')}>
            <Text style={styles.changeText}>Change</Text>
          </Touch>
        </View>
      ) : loading ? null : (
        <Touch style={styles.add} onPress={() => open('add')}>
          <Plus size={18} color={colors.primary} />
          <Text style={styles.addText}>Add delivery address</Text>
        </Touch>
      )}

      <Sheet
        visible={sheet === 'pick'}
        title="Deliver to"
        onClose={() => open(null)}
        scroll
      >
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
                    a.address_line1,
                    a.address_line2,
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
          variant="outline"
          onPress={() => open('add')}
          style={styles.gapTop}
        />
      </Sheet>

      <AddressSheet
        editing={sheet === 'add' ? 'new' : null}
        onClose={() => open(null)}
        onSave={async form => {
          // The first address becomes the default, as on the website.
          const err = await save({
            ...form,
            is_default: form.is_default || addresses.length === 0,
          });
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
  change: {
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  add: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  addText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.primary,
  },
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
