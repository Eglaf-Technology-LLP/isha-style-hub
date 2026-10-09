import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

// Notification deep links (see supabase/functions/_shared/notify.ts):
// ?tab= picks the page's tab, &sub= a nested tab, &focus= the order /
// return / payout to bring into view. Rows mark themselves with
// data-focus-id (space-separated when a row stands for several ids, e.g. a
// customer order and its boutique orders).

// A tab whose selection lives in the URL, so a link can open it. Switching
// tabs by hand drops the focus target - it belonged to the old tab.
export function useUrlTab(defaultTab: string, param: "tab" | "sub" = "tab") {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(param) || defaultTab;
  const setValue = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set(param, next);
          if (param === "tab") params.delete("sub");
          params.delete("focus");
          return params;
        },
        { replace: true },
      );
    },
    [param, setSearchParams],
  );
  return [value, setValue] as const;
}

// focusKey changes on every navigation, even when the same notification is
// clicked twice, so the item is brought back into view each time.
export function useFocusParam() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  return { focusId: searchParams.get("focus"), focusKey: location.key };
}

// Scrolls to the row marked with this id and flashes it. The row may not be
// rendered yet (data loading, tab switching), so it retries for a few seconds.
export function flashFocusedElement(id: string) {
  let tries = 0;
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-focus-id~="${CSS.escape(id)}"]`);
    if (el) {
      el.classList.remove("focus-flash");
      void el.offsetWidth; // restart the animation on a repeat click
      el.classList.add("focus-flash");
      // Give an item that opens on focus (a customer's order) time to expand;
      // a tall one is scrolled to its top so its heading stays in view.
      window.setTimeout(() => {
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.5;
        el.scrollIntoView({ behavior: "smooth", block: tall ? "start" : "center" });
      }, 250);
      return;
    }
    if (++tries < 50) window.setTimeout(tick, 100);
  };
  tick();
}

// For short lists that show every row: just scroll to and flash it.
export function useFlashFocus(enabled: boolean) {
  const { focusId, focusKey } = useFocusParam();
  useEffect(() => {
    if (enabled && focusId) flashFocusedElement(focusId);
  }, [enabled, focusId, focusKey]);
}

interface FocusTargetOptions<T> {
  // Everything the list can show, before its filters.
  items: T[];
  ready: boolean;
  getId: (item: T) => string;
  // Defaults to getId(item) === id; lets a row answer to more than one id.
  matches?: (item: T, id: string) => boolean;
  // Make the item visible: clear the search, pick its status tab, etc.
  reveal?: (item: T) => void;
  // For paginated lists: the filtered list, so the right page is opened.
  visibleItems?: T[];
  pageSize?: number;
  setPage?: (page: number) => void;
  onFocus?: (item: T) => void;
  onMissing?: (id: string) => void;
}

// Brings the ?focus= item of a client-side filtered/paginated list into
// view: reveal it, open its page, then scroll to and flash its row.
export function useFocusTarget<T>(options: FocusTargetOptions<T>) {
  const { focusId, focusKey } = useFocusParam();
  const latest = useRef(options);
  latest.current = options;
  const handled = useRef<string | null>(null);
  const [pending, setPending] = useState<T | null>(null);

  useEffect(() => {
    if (!focusId || !options.ready) return;
    const token = `${focusKey}:${focusId}`;
    if (handled.current === token) return;
    handled.current = token;
    const { items, getId, matches, reveal, onMissing } = latest.current;
    const item = items.find((i) => (matches ? matches(i, focusId) : getId(i) === focusId));
    if (!item) {
      onMissing?.(focusId);
      return;
    }
    reveal?.(item);
    setPending(item);
  }, [focusId, focusKey, options.ready]);

  // Runs after reveal's state changes have re-rendered the list.
  useEffect(() => {
    if (!pending) return;
    const { visibleItems, getId, pageSize, setPage, onFocus } = latest.current;
    const id = getId(pending);
    const index = visibleItems ? visibleItems.findIndex((i) => getId(i) === id) : -1;
    if (index >= 0 && pageSize && setPage) setPage(Math.floor(index / pageSize) + 1);
    setPending(null);
    onFocus?.(pending);
    flashFocusedElement(id);
  }, [pending]);

  return focusId;
}
