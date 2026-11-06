import { Check, MapPin, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Field, StatePicker } from '@/components/Form';
import { Sheet } from '@/components/Listing';
import { Button, Sans, Serif, Touch } from '@/components/ui';
import {
  Address,
  AddressForm,
  emptyAddress,
  lookupPincode,
  useAddressActions,
  useAddresses,
  validateAddress,
} from '@/lib/account';
import { toast } from '@/lib/toast';
import { colors, fonts } from '@/theme';

// Saved addresses: add, edit, delete, one default (saved_addresses).
export default function AddressesScreen() {
  const { data: addresses = [], isLoading } = useAddresses();
  const { save, remove, makeDefault } = useAddressActions();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  const confirmDelete = (a: Address) =>
    Alert.alert(
      'Delete this address?',
      `${a.label || a.full_name}, ${a.city}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const err = await remove(a.id);
            toast(err ?? 'Address deleted', { important: !!err });
          },
        },
      ],
    );

  return (
    <View style={styles.flex}>
      <AppHeader back title="Saved addresses" />
      <FlatList
        data={addresses}
        keyExtractor={a => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Touch style={styles.add} onPress={() => setEditing('new')}>
            <Plus size={18} color={colors.primary} />
            <Text style={styles.addText}>Add a new address</Text>
          </Touch>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.gap} />
          ) : (
            <View style={styles.empty}>
              <MapPin size={30} color={colors.gold} strokeWidth={1.4} />
              <Serif style={styles.emptyTitle}>No saved addresses yet</Serif>
            </View>
          )
        }
        renderItem={({ item: a }) => (
          <View style={[styles.card, a.is_default && styles.cardDefault]}>
            <View style={styles.cardHead}>
              <View style={styles.tags}>
                {a.label ? <Text style={styles.tag}>{a.label}</Text> : null}
                {a.is_default ? (
                  <Text style={[styles.tag, styles.tagDefault]}>Default</Text>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Touch
                  hitSlop={8}
                  onPress={() => setEditing(a)}
                  accessibilityLabel="Edit address"
                >
                  <Pencil size={17} color={colors.mutedForeground} />
                </Touch>
                <Touch
                  hitSlop={8}
                  onPress={() => confirmDelete(a)}
                  accessibilityLabel="Delete address"
                >
                  <Trash2 size={17} color={colors.mutedForeground} />
                </Touch>
              </View>
            </View>
            <Text style={styles.name}>{a.full_name}</Text>
            <Sans style={styles.lines}>
              {[
                a.address_line1,
                a.address_line2,
                `${a.city}, ${a.state} - ${a.pincode}`,
              ]
                .filter(Boolean)
                .join('\n')}
            </Sans>
            <Sans style={styles.phone}>{a.phone}</Sans>
            {!a.is_default ? (
              <Touch
                hitSlop={8}
                onPress={() => makeDefault(a)}
                style={styles.makeDefault}
              >
                <Text style={styles.link}>Set as default</Text>
              </Touch>
            ) : null}
          </View>
        )}
      />
      <AddressSheet
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={async (form, id) => {
          const err = await save(form, id);
          if (!err) toast(id ? 'Address updated' : 'Address saved');
          return err;
        }}
      />
    </View>
  );
}

// Add / edit form. A full PIN code fills city and state (India Post), never
// overwriting what the customer typed themselves.
export function AddressSheet({
  editing,
  onClose,
  onSave,
}: {
  editing: Address | 'new' | null;
  onClose: () => void;
  onSave: (form: AddressForm, id?: string) => Promise<string | null>;
}) {
  const [f, setF] = useState<AddressForm>(emptyAddress());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filled = useRef({ city: '', state: '' });

  useEffect(() => {
    if (!editing) return;
    setError(null);
    filled.current = { city: '', state: '' };
    if (editing === 'new') setF(emptyAddress());
    else {
      setF({
        label: editing.label ?? '',
        full_name: editing.full_name,
        phone: editing.phone,
        address_line1: editing.address_line1,
        address_line2: editing.address_line2 ?? '',
        city: editing.city,
        state: editing.state,
        pincode: editing.pincode,
        is_default: editing.is_default,
      });
    }
  }, [editing]);

  const set = (patch: Partial<AddressForm>) =>
    setF(cur => ({ ...cur, ...patch }));

  const onPin = (t: string) => {
    const pin = t.replace(/\D/g, '').slice(0, 6);
    set({ pincode: pin });
    lookupPincode(pin).then(found => {
      if (!found) return;
      setF(cur => {
        const patch: Partial<AddressForm> = {};
        if (!cur.city.trim() || cur.city === filled.current.city)
          patch.city = found.city;
        if (!cur.state || cur.state === filled.current.state)
          patch.state = found.state;
        filled.current = {
          city: patch.city ?? filled.current.city,
          state: patch.state ?? filled.current.state,
        };
        return { ...cur, ...patch };
      });
    });
  };

  const submit = async () => {
    const invalid = validateAddress(f);
    if (invalid) return setError(invalid);
    setBusy(true);
    const err = await onSave(
      f,
      editing && editing !== 'new' ? editing.id : undefined,
    );
    setBusy(false);
    if (err) return setError(err);
    onClose();
  };

  return (
    <Sheet
      visible={editing !== null}
      title={editing === 'new' ? 'Add address' : 'Edit address'}
      onClose={onClose}
      scroll
      footer={
        <View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={busy ? 'Saving...' : 'Save address'}
            onPress={submit}
            disabled={busy}
            style={styles.gapSm}
          />
        </View>
      }
    >
      <Field
        label="Address label (e.g. Home, Office)"
        value={f.label}
        onChangeText={t => set({ label: t })}
        placeholder="Home"
      />
      <Field
        label="Full name"
        required
        value={f.full_name}
        onChangeText={t => set({ full_name: t })}
        autoComplete="name"
      />
      <Field
        label="Phone number"
        required
        value={f.phone}
        onChangeText={t => set({ phone: t })}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="98765 43210"
      />
      <Field
        label="Pincode"
        required
        value={f.pincode}
        onChangeText={onPin}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="postal-code"
        hint="City and state fill in from the pincode."
      />
      <Field
        label="Address line 1"
        required
        value={f.address_line1}
        onChangeText={t => set({ address_line1: t })}
        placeholder="House/Flat No., Building Name"
        autoComplete="address-line1"
      />
      <Field
        label="Address line 2"
        value={f.address_line2 ?? ''}
        onChangeText={t => set({ address_line2: t })}
        placeholder="Street, Area, Landmark"
        autoComplete="address-line2"
      />
      <Field
        label="City"
        required
        value={f.city}
        onChangeText={t => set({ city: t })}
      />
      <StatePicker value={f.state} onChange={s => set({ state: s })} />
      <Touch
        style={styles.defaultRow}
        onPress={() => set({ is_default: !f.is_default })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: f.is_default }}
      >
        <View style={[styles.box, f.is_default && styles.boxOn]}>
          {f.is_default ? (
            <Check size={13} color={colors.primaryForeground} strokeWidth={3} />
          ) : null}
        </View>
        <Text style={styles.defaultText}>Set as default address</Text>
      </Touch>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: 12, gap: 10, flexGrow: 1 },
  gap: { marginTop: 40 },
  gapSm: { marginTop: 10 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.ivory,
    marginBottom: 2,
  },
  addText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.primary,
  },
  empty: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyTitle: { fontSize: 20 },
  card: {
    backgroundColor: colors.ivory,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardDefault: { borderColor: colors.foreground },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tags: { flexDirection: 'row', gap: 6 },
  tag: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagDefault: { color: colors.primary, borderColor: colors.primary },
  actions: { flexDirection: 'row', gap: 18 },
  name: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.foreground },
  lines: { lineHeight: 21, marginTop: 4 },
  phone: { marginTop: 4, color: colors.mutedForeground },
  makeDefault: { marginTop: 10, alignSelf: 'flex-start' },
  link: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primary },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 10,
  },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  box: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  defaultText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
  },
});
