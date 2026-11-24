import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useSession } from './auth';
import type { CustomisationChoice } from './customisation';
import type { SoldOutTerms } from './soldOutMadeToOrder';
import { supabase } from './supabase';

// Bag and wishlist, kept on the phone. The bag line has exactly the website's
// CartItem shape (src/stores/cartStore.ts) so phase 2's checkout can send it
// to the same create-razorpay-order function.

export interface CartItem {
  productId: string;
  productName: string;
  productImage: string | null;
  vendorId: string | null;
  variantId: string;
  variantTitle: string;
  price: { amount: string; currencyCode: string };
  quantity: number;
  selectedOptions: { name: string; value: string }[];
  // The boutique's own product code, shown on the bag line (as the
  // website's cart). Optional: the bag also looks it up.
  sku?: string | null;
  // A customised piece is its own bag line (never merged with the same
  // variant): lineId identifies it, price.amount already includes the
  // customisation, basePrice is the piece's own price (as the website).
  lineId?: string;
  customisation?: CustomisationChoice | null;
  basePrice?: string;
  // A sold-out size the boutique makes to order: its extra charge (already
  // in price.amount; basePrice is the piece's own price) and extra days.
  // The server works them out again when the order is placed. Lines saved
  // before it was kept have none.
  soldOutTerms?: SoldOutTerms | null;
}

// The id the bag's actions use for a line.
export const cartLineKey = (item: Pick<CartItem, 'lineId' | 'variantId'>) =>
  item.lineId ?? item.variantId;

// A new customised line's id.
export const newLineId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// What changes when a line moves to another size of the same piece.
export type VariantChange = Pick<
  CartItem,
  | 'variantId'
  | 'variantTitle'
  | 'selectedOptions'
  | 'price'
  | 'productImage'
  | 'basePrice'
  | 'customisation'
  | 'soldOutTerms'
>;
// A line's new price; a % customisation charge moves with it (see
// rechargeAt). soldOutTerms: set = now made to order, null = from stock
// again, left out = unchanged.
export type LinePrice = {
  amount: string;
  basePrice?: string;
  customisation?: CustomisationChoice | null;
  soldOutTerms?: SoldOutTerms | null;
};

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  setQuantity: (lineKey: string, quantity: number) => void;
  // Another size of the same piece (maxQuantity: what it has in stock).
  changeVariant: (
    lineKey: string,
    next: VariantChange,
    maxQuantity?: number,
  ) => void;
  // Today's prices / stock terms for some lines, by line key (the
  // website's setPrices - see syncCartPrices.ts).
  setPrices: (updates: Record<string, LinePrice>) => void;
  removeItem: (lineKey: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      // A plain piece joins the same one already in the bag; a customised
      // one is always its own line.
      addItem: item => {
        const existing = item.lineId
          ? undefined
          : get().items.find(i => !i.lineId && i.variantId === item.variantId);
        set({
          items: existing
            ? get().items.map(i =>
                i === existing
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i,
              )
            : [...get().items, item],
        });
      },
      setQuantity: (lineKey, quantity) =>
        set({
          items:
            quantity <= 0
              ? get().items.filter(i => cartLineKey(i) !== lineKey)
              : get().items.map(i =>
                  cartLineKey(i) === lineKey ? { ...i, quantity } : i,
                ),
        }),
      // From the bag (website 64af7e4): the line takes the new variant's id,
      // size, price and photo, keeping its place. If that size is already
      // in the bag, the two lines become one (a customised line stays its
      // own). Quantity cut to the stock.
      changeVariant: (lineKey, next, maxQuantity) => {
        const items = get().items;
        const line = items.find(i => cartLineKey(i) === lineKey);
        if (!line) return;
        const cap = (q: number) =>
          maxQuantity != null ? Math.max(1, Math.min(q, maxQuantity)) : q;
        const twin = line.lineId
          ? undefined
          : items.find(
              i => i !== line && !i.lineId && i.variantId === next.variantId,
            );
        set({
          items: twin
            ? items
                .filter(i => i !== line)
                .map(i =>
                  i === twin
                    ? { ...i, quantity: cap(i.quantity + line.quantity) }
                    : i,
                )
            : items.map(i =>
                i === line
                  ? { ...line, ...next, quantity: cap(line.quantity) }
                  : i,
              ),
        });
      },
      setPrices: updates =>
        set({
          items: get().items.map(item => {
            const p = updates[cartLineKey(item)];
            if (!p) return item;
            return {
              ...item,
              price: { ...item.price, amount: p.amount },
              ...(p.basePrice ? { basePrice: p.basePrice } : {}),
              ...(p.customisation ? { customisation: p.customisation } : {}),
              ...(p.soldOutTerms !== undefined
                ? { soldOutTerms: p.soldOutTerms }
                : {}),
            };
          }),
        }),
      removeItem: lineKey =>
        set({ items: get().items.filter(i => cartLineKey(i) !== lineKey) }),
      clear: () => set({ items: [] }),
    }),
    { name: 'allboutiqs-cart', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const cartCount = (items: CartItem[]) =>
  items.reduce((n, i) => n + i.quantity, 0);
export const cartTotal = (items: CartItem[]) =>
  items.reduce((n, i) => n + Number(i.price.amount) * i.quantity, 0);

interface WishlistState {
  ids: string[];
  toggle: (productId: string) => void;
  replace: (ids: string[]) => void;
}

// Saved pieces. Signed out: on this phone. Signed in: also in the account's
// wishlists table (same as the website) - see syncWishlist below.
export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: id => {
        const adding = !get().ids.includes(id);
        set({
          ids: adding ? [id, ...get().ids] : get().ids.filter(x => x !== id),
        });
        const user = useSession.getState().user;
        if (!user) return;
        // Best effort: the heart stays as tapped; the next sign-in re-syncs.
        const q = adding
          ? supabase
              .from('wishlists')
              .upsert(
                { user_id: user.id, product_id: id },
                { onConflict: 'user_id,product_id' },
              )
          : supabase
              .from('wishlists')
              .delete()
              .eq('user_id', user.id)
              .eq('product_id', id);
        q.then(() => undefined);
      },
      replace: ids => set({ ids }),
    }),
    {
      name: 'allboutiqs-wishlist',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: st => ({ ids: st.ids }),
    },
  ),
);

// On sign-in: the account's wishlist plus anything saved on the phone before
// signing in (sent up to the account). On sign-out: cleared from the phone,
// so the next person doesn't see it.
let lastUserId: string | null = null;
export function syncWishlist() {
  useSession.subscribe(async st => {
    const userId = st.user?.id ?? null;
    if (userId === lastUserId) return;
    const wasSignedIn = lastUserId !== null;
    lastUserId = userId;
    if (!userId) {
      if (wasSignedIn) useWishlist.getState().replace([]);
      return;
    }
    const { data } = await supabase
      .from('wishlists')
      .select('product_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    const server = (data ?? []).map(r => r.product_id as string);
    const local = useWishlist.getState().ids;
    const onlyLocal = local.filter(id => !server.includes(id));
    if (onlyLocal.length) {
      await supabase.from('wishlists').upsert(
        onlyLocal.map(product_id => ({ user_id: userId, product_id })),
        { onConflict: 'user_id,product_id' },
      );
    }
    useWishlist.getState().replace([...onlyLocal, ...server]);
  });
}
