import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from './auth';
import { supabase } from './supabase';

// My account: profile, saved addresses and wallet - the same tables and
// rules as the website's Account page (Live-Vendor src/components/account).

// ---------- profile ----------

export interface Profile {
  full_name: string;
  phone: string;
}

export function useProfile() {
  const userId = useSession(st => st.user?.id ?? null);
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('user_id', userId!)
        .maybeSingle();
      return { full_name: data?.full_name ?? '', phone: data?.phone ?? '' };
    },
  });
}

export async function saveProfile(p: Profile): Promise<string | null> {
  const userId = useSession.getState().user?.id;
  if (!userId) return 'Please sign in again.';
  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: userId,
      full_name: p.full_name.trim() || null,
      phone: p.phone.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  return error ? error.message : null;
}

// ---------- saved addresses ----------

export interface Address {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export type AddressForm = Omit<Address, 'id'>;

export const emptyAddress = (): AddressForm => ({
  label: '',
  full_name: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
  is_default: false,
});

export function useAddresses() {
  const userId = useSession(st => st.user?.id ?? null);
  return useQuery({
    queryKey: ['addresses', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Address[]> => {
      const { data, error } = await supabase
        .from('saved_addresses')
        .select('*')
        .eq('user_id', userId!)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Address[];
    },
  });
}

export function useAddressActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['addresses'] });
  const userId = () => useSession.getState().user?.id;

  // One default address: setting one clears the others first (as on the website).
  const save = async (
    form: AddressForm,
    id?: string,
  ): Promise<string | null> => {
    const uid = userId();
    if (!uid) return 'Please sign in again.';
    if (form.is_default) {
      let q = supabase
        .from('saved_addresses')
        .update({ is_default: false })
        .eq('user_id', uid);
      if (id) q = q.neq('id', id);
      await q;
    }
    const row = { ...form, address_line2: form.address_line2?.trim() || null };
    const { error } = id
      ? await supabase
          .from('saved_addresses')
          .update(row)
          .eq('id', id)
          .eq('user_id', uid)
      : await supabase.from('saved_addresses').insert({ ...row, user_id: uid });
    if (error) return error.message;
    refresh();
    return null;
  };

  const remove = async (id: string): Promise<string | null> => {
    const uid = userId();
    if (!uid) return null;
    const { error } = await supabase
      .from('saved_addresses')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) return error.message;
    refresh();
    return null;
  };

  const makeDefault = (a: Address) => save({ ...a, is_default: true }, a.id);

  return { save, remove, makeDefault };
}

export function validateAddress(f: AddressForm): string | null {
  if (
    !f.full_name.trim() ||
    !f.phone.trim() ||
    !f.address_line1.trim() ||
    !f.city.trim() ||
    !f.state ||
    !f.pincode
  )
    return 'Please fill in all required fields.';
  if (!/^(\+?91)?[6-9]\d{9}$/.test(f.phone.replace(/[\s-]/g, '')))
    return 'Enter a 10-digit mobile number.';
  if (!/^[1-9]\d{5}$/.test(f.pincode)) return 'Enter a 6-digit pincode.';
  return null;
}

// ---------- states (the exact names invoices use for GST) ----------

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z]/g, '');
const ALIASES: Record<string, string> = {
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  newdelhi: 'Delhi',
  nctofdelhi: 'Delhi',
  uttaranchal: 'Uttarakhand',
  andamanandnicobar: 'Andaman and Nicobar Islands',
  dadraandnagarhaveli: 'Dadra and Nagar Haveli and Daman and Diu',
  damananddiu: 'Dadra and Nagar Haveli and Daman and Diu',
  jk: 'Jammu and Kashmir',
  jandk: 'Jammu and Kashmir',
};
export function normalizeState(raw: string | null | undefined): string {
  if (!raw) return '';
  const k = key(raw);
  return INDIAN_STATES.find(s => key(s) === k) ?? ALIASES[k] ?? '';
}

// City and state from a PIN code (India Post's public directory), as on the website.
const pinCache = new Map<
  string,
  Promise<{ city: string; state: string } | null>
>();
export function lookupPincode(
  pin: string,
): Promise<{ city: string; state: string } | null> {
  if (!/^[1-9]\d{5}$/.test(pin)) return Promise.resolve(null);
  if (!pinCache.has(pin)) {
    pinCache.set(
      pin,
      fetch(`https://api.postalpincode.in/pincode/${pin}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          const office =
            data?.[0]?.Status === 'Success' ? data[0].PostOffice?.[0] : null;
          if (!office?.District || !office?.State) return null;
          return {
            city: String(office.District),
            state: normalizeState(String(office.State)) || String(office.State),
          };
        })
        .catch(() => null),
    );
  }
  return pinCache.get(pin)!;
}

// ---------- wallet ----------

export const WALLET_KIND_LABEL: Record<string, string> = {
  return_refund: 'Refund for a return',
  cancellation_refund: 'Refund for a cancelled order',
  order_payment: 'Paid for an order',
  order_payment_released: 'Payment not completed - returned',
  adjustment: 'Adjustment by AllBoutiqs',
};

export interface WalletEntry {
  id: string;
  amount: number;
  kind: string;
  order_id: string | null;
  note: string | null;
  created_at: string;
}

export function useWallet() {
  const userId = useSession(st => st.user?.id ?? null);
  return useQuery({
    queryKey: ['wallet', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [bal, tx] = await Promise.all([
        supabase.rpc('my_wallet_balance'),
        supabase
          .from('wallet_transactions')
          .select('id, amount, kind, order_id, note, created_at')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      return {
        balance: Number(bal.data ?? 0),
        entries: (tx.data ?? []) as WalletEntry[],
      };
    },
  });
}
