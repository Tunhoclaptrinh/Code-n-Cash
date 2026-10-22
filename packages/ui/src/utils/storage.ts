import { uiText } from "../i18n";
export const storage = {
  get<T = any>(key: string, defaultValue?: T): T | null {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : (defaultValue ?? null);
    } catch (err) {
      console.warn(uiText("storage.readLocal", { key: key }), err);
      return defaultValue ?? null;
    }
  },
  set<T = any>(key: string, value: T): boolean {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(uiText("storage.writeLocal", { key: key }), err);
      return false;
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn(uiText("storage.removeLocal", { key: key }), err);
    }
  },
  clear(): void {
    try {
      window.localStorage.clear();
    } catch (err) {
      console.warn(uiText("storage.clearLocal"), err);
    }
  },
  session: {
    get<T = any>(key: string, defaultValue?: T): T | null {
      try {
        const item = window.sessionStorage.getItem(key);
        return item ? JSON.parse(item) : (defaultValue ?? null);
      } catch (err) {
        console.warn(uiText("storage.readSession", { key: key }), err);
        return defaultValue ?? null;
      }
    },
    set<T = any>(key: string, value: T): boolean {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn(uiText("storage.writeSession", { key: key }), err);
        return false;
      }
    },
    remove(key: string): void {
      try {
        window.sessionStorage.removeItem(key);
      } catch (err) {
        console.warn(uiText("storage.removeSession", { key: key }), err);
      }
    },
  },
};
