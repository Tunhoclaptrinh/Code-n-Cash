import { uiText } from "../i18n";
import { useState, useEffect } from "react";
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(uiText("sa8c718d0ef", { v0: key }), error);
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(uiText("s4466e1cc85", { v0: key }), error);
    }
  }, [key, storedValue]);
  return [storedValue, setStoredValue];
}
