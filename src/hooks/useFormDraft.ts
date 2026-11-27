import { useEffect, useRef, useState } from "react";

// Keeps an unfinished form in this browser tab, so nothing typed or uploaded
// is lost when the page reloads or the tab goes to another page and comes
// back - e.g. a phone's in-app browser (WhatsApp, Instagram) that opens a
// "new tab" link in the same view, or a background tab the phone reloads
// (client, 27 Nov 2026: the seller form came back empty after reading the
// Terms).
//
// Saved in IndexedDB, which also holds File objects (uploaded documents).
// Each record belongs to one tab (an id in sessionStorage) and one signed-in
// user, is dropped after MAX_AGE_MS, and the form clears it once submitted.

const DB_NAME = "allboutiqs-form-drafts";
const STORE = "drafts";
const TAB_ID_KEY = "allboutiqs-draft-tab";
const MAX_AGE_MS = 24 * 3_600_000;
const SAVE_DELAY_MS = 400;

interface DraftRecord<T> {
  key: string;
  owner: string;
  savedAt: number;
  data: T;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<R>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<R> | void): Promise<R | undefined> {
  const db = await openDb();
  try {
    return await new Promise<R | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function draftKey(name: string): string | null {
  try {
    let tab = sessionStorage.getItem(TAB_ID_KEY);
    if (!tab) {
      tab = crypto.randomUUID();
      sessionStorage.setItem(TAB_ID_KEY, tab);
    }
    return `${name}:${tab}`;
  } catch {
    return null;
  }
}

// Old drafts (tabs closed without submitting) go after MAX_AGE_MS.
async function purgeOld(): Promise<void> {
  const all = (await withStore<DraftRecord<unknown>[]>("readonly", (s) => s.getAll())) ?? [];
  const old = all.filter((r) => Date.now() - r.savedAt > MAX_AGE_MS);
  if (old.length) await withStore("readwrite", (s) => void old.forEach((r) => s.delete(r.key)));
}

/**
 * `snapshot`: everything to keep (memoise it, so it changes only when the
 * form does). `restore` puts a saved draft back. Nothing is saved until the
 * saved draft has been read, so the empty form never overwrites it.
 * Returns `restored` (a draft was put back) and `clear` (call on submit).
 */
export function useFormDraft<T>(
  name: string,
  owner: string | null | undefined,
  snapshot: T,
  restore: (draft: T) => void,
): { restored: boolean; clear: () => Promise<void> } {
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const latest = useRef<{ snapshot: T; dirty: boolean }>({ snapshot, dirty: false });
  const cleared = useRef(false);

  useEffect(() => {
    setReady(false);
    if (!owner) return;
    let cancelled = false;
    const key = draftKey(name);
    (async () => {
      try {
        if (!key || typeof indexedDB === "undefined") return;
        await purgeOld();
        const draft = await withStore<DraftRecord<T> | undefined>("readonly", (s) => s.get(key));
        if (!cancelled && draft && draft.owner === owner) {
          restoreRef.current(draft.data);
          setRestored(true);
        }
      } catch (e) {
        console.warn("useFormDraft: couldn't read the saved draft", e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, owner]);

  const save = async () => {
    const key = draftKey(name);
    if (!key || !owner || cleared.current || !latest.current.dirty) return;
    latest.current.dirty = false;
    const record: DraftRecord<T> = { key, owner, savedAt: Date.now(), data: latest.current.snapshot };
    try {
      await withStore("readwrite", (s) => s.put(record));
    } catch (e) {
      console.warn("useFormDraft: couldn't save the draft", e);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Saved shortly after each change...
  useEffect(() => {
    if (!ready) return;
    latest.current = { snapshot, dirty: true };
    const t = window.setTimeout(() => saveRef.current(), SAVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [snapshot, ready]);

  // ...and at once when the page is left or hidden.
  useEffect(() => {
    const flush = () => void saveRef.current();
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  const clear = async () => {
    cleared.current = true;
    const key = draftKey(name);
    if (!key) return;
    try {
      await withStore("readwrite", (s) => s.delete(key));
    } catch (e) {
      console.warn("useFormDraft: couldn't clear the draft", e);
    }
  };

  return { restored, clear };
}
