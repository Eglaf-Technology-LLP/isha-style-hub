import { create } from 'zustand';

// A short message at the bottom of the screen that goes away by itself
// ("You're signed in", "Address saved"), the same on Android and iOS.
// Shown by <ToastHost /> in App.tsx.

interface ToastState {
  message: string | null;
  // Changes on every toast, so the same text twice still shows again.
  id: number;
  long: boolean;
  show: (message: string, long: boolean) => void;
  hide: () => void;
}

export const useToast = create<ToastState>(set => ({
  message: null,
  id: 0,
  long: false,
  show: (message, long) => set(st => ({ message, long, id: st.id + 1 })),
  hide: () => set({ message: null }),
}));

// `important` keeps it on screen a little longer (longer messages).
export function toast(
  message: string,
  { important = false }: { important?: boolean } = {},
) {
  useToast.getState().show(message, important || message.length > 60);
}
