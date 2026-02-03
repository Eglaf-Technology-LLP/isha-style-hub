import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AbandonedCartStore {
  email: string | null;
  lastActivityAt: string | null;
  reminderSent: boolean;
  setEmail: (email: string) => void;
  updateActivity: () => void;
  markReminderSent: () => void;
  reset: () => void;
}

export const useAbandonedCartStore = create<AbandonedCartStore>()(
  persist(
    (set) => ({
      email: null,
      lastActivityAt: null,
      reminderSent: false,

      setEmail: (email: string) => {
        set({ email, lastActivityAt: new Date().toISOString() });
      },

      updateActivity: () => {
        set({ lastActivityAt: new Date().toISOString() });
      },

      markReminderSent: () => {
        set({ reminderSent: true });
      },

      reset: () => {
        set({ email: null, lastActivityAt: null, reminderSent: false });
      },
    }),
    {
      name: "abandoned-cart",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
