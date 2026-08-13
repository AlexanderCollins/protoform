import { useState, useCallback } from "react";
import { save, load } from "../lib/persistence";

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValueRaw] = useState<T>(() => {
    const stored = load<T>(key);
    return stored !== undefined ? stored : defaultValue;
  });

  const setValue = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValueRaw((prev) => {
        const next = typeof v === "function" ? (v as (prev: T) => T)(prev) : v;
        save(key, next);
        return next;
      });
    },
    [key],
  );

  return [value, setValue];
}
