import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
// The value read for each key, kept so that a render gets the same object until the key changes.
const cache = new Map<string, { raw: string | null; value: unknown }>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the value.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * A value kept in the browser between visits. `read` checks what was stored and returns null for
 * anything this app did not write. The server and the first render use `fallback`.
 */
export function useStoredState<Value>(
  key: string,
  fallback: Value,
  read: (stored: unknown) => Value | null,
): [Value, (value: Value) => void] {
  const getSnapshot = () => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      // A browser that keeps nothing: the fallback applies.
    }
    const cached = cache.get(key);
    if (cached?.raw === raw) return cached.value as Value;

    let value = fallback;
    try {
      if (raw !== null) value = read(JSON.parse(raw)) ?? fallback;
    } catch {
      // Not JSON: the fallback applies.
    }
    cache.set(key, { raw, value });
    return value;
  };

  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const setValue = useCallback(
    (next: Value) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // The choice then lasts until the page is closed.
        cache.set(key, { raw: null, value: next });
      }
      for (const listener of listeners) listener();
    },
    [key],
  );

  return [value, setValue];
}
