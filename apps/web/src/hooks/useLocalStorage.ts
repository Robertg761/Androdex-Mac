import * as Schema from "effect/Schema";
import * as Record from "effect/Record";
import { useCallback, useEffect, useRef, useState } from "react";

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (_) => store.get(_) ?? null,
    key: (_) => Record.keys(store).at(_) ?? null,
    get length() {
      return store.size;
    },
    removeItem: (_) => store.delete(_),
    setItem: (_, value) => store.set(_, value),
  };
};

export const hasUsableLocalStorage = (value: unknown): value is Storage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Storage).getItem === "function" &&
  typeof (value as Storage).setItem === "function" &&
  typeof (value as Storage).removeItem === "function";

const memoryStorage = createMemoryStorage();

export const getIsomorphicLocalStorage = (): Storage =>
  typeof window !== "undefined" && hasUsableLocalStorage(window.localStorage)
    ? window.localStorage
    : memoryStorage;

const isomorphicLocalStorage = getIsomorphicLocalStorage();

const decode = <T, E>(schema: Schema.Codec<T, E>, value: string) =>
  Schema.decodeSync(Schema.fromJsonString(schema))(value);

const encode = <T, E>(schema: Schema.Codec<T, E>, value: T) =>
  Schema.encodeSync(Schema.fromJsonString(schema))(value);

export const promoteLegacyLocalStorageItem = (
  key: string,
  legacyKeys: ReadonlyArray<string> = [],
): string | null => {
  const currentValue = isomorphicLocalStorage.getItem(key);
  if (currentValue !== null) {
    return currentValue;
  }

  for (const legacyKey of legacyKeys) {
    const legacyValue = isomorphicLocalStorage.getItem(legacyKey);
    if (legacyValue === null) {
      continue;
    }

    isomorphicLocalStorage.setItem(key, legacyValue);
    isomorphicLocalStorage.removeItem(legacyKey);
    return legacyValue;
  }

  return null;
};

export const getLocalStorageItem = <T, E>(
  key: string,
  schema: Schema.Codec<T, E>,
  legacyKeys: ReadonlyArray<string> = [],
): T | null => {
  const item = promoteLegacyLocalStorageItem(key, legacyKeys);
  return item ? decode(schema, item) : null;
};

export const setLocalStorageItem = <T, E>(
  key: string,
  value: T,
  schema: Schema.Codec<T, E>,
  legacyKeys: ReadonlyArray<string> = [],
) => {
  const valueToSet = encode(schema, value);
  isomorphicLocalStorage.setItem(key, valueToSet);
  for (const legacyKey of legacyKeys) {
    isomorphicLocalStorage.removeItem(legacyKey);
  }
};

export const removeLocalStorageItem = (key: string, legacyKeys: ReadonlyArray<string> = []) => {
  isomorphicLocalStorage.removeItem(key);
  for (const legacyKey of legacyKeys) {
    isomorphicLocalStorage.removeItem(legacyKey);
  }
};

const LOCAL_STORAGE_CHANGE_EVENT = "androdex:local_storage_change";

interface LocalStorageChangeDetail {
  key: string;
}

function dispatchLocalStorageChange(key: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LocalStorageChangeDetail>(LOCAL_STORAGE_CHANGE_EVENT, {
      detail: { key },
    }),
  );
}

export function useLocalStorage<T, E>(
  key: string,
  initialValue: T,
  schema: Schema.Codec<T, E>,
  legacyKeys: ReadonlyArray<string> = [],
): [T, (value: T | ((val: T) => T)) => void] {
  // Get the initial value from localStorage or use the provided initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = getLocalStorageItem(key, schema, legacyKeys);
      return item ?? initialValue;
    } catch (error) {
      console.error("[LOCALSTORAGE] Error:", error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that persists the new value to localStorage
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        setStoredValue((prev) => {
          const valueToStore = typeof value === "function" ? (value as (val: T) => T)(prev) : value;
          if (valueToStore === null) {
            removeLocalStorageItem(key, legacyKeys);
          } else {
            setLocalStorageItem(key, valueToStore, schema, legacyKeys);
          }
          // Dispatch event after state update completes to avoid nested state updates
          queueMicrotask(() => dispatchLocalStorageChange(key));
          return valueToStore;
        });
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    },
    [key, legacyKeys, schema],
  );

  const prevKeyRef = useRef(key);

  // Re-sync from localStorage when key changes
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      try {
        const newValue = getLocalStorageItem(key, schema, legacyKeys);
        setStoredValue(newValue ?? initialValue);
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    }
  }, [key, initialValue, legacyKeys, schema]);

  // Listen for storage events from other tabs AND custom events from the same tab
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const newValue = getLocalStorageItem(key, schema, legacyKeys);
        setStoredValue(newValue ?? initialValue);
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key) {
        syncFromStorage();
      }
    };

    const handleLocalChange = (event: CustomEvent<LocalStorageChangeDetail>) => {
      if (event.detail.key === key) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange as EventListener);
    };
  }, [key, initialValue, legacyKeys, schema]);

  return [storedValue, setValue];
}
