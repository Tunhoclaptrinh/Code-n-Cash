import { uiText } from "../i18n";
export const storage = {
  get<T = any>(key: string, defaultValue?: T): T | null {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : (defaultValue ?? null);
    } catch (err) {
      console.warn(uiText("sa8c718d0ef", { v0: key }), err);
      return defaultValue ?? null;
    }
  },
  set<T = any>(key: string, value: T): boolean {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(uiText("s4466e1cc85", { v0: key }), err);
      return false;
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn(uiText("s26e2f6b102", { v0: key }), err);
    }
  },
  clear(): void {
    try {
      window.localStorage.clear();
    } catch (err) {
      console.warn(uiText("sa21a51b53b"), err);
    }
  },
  session: {
    get<T = any>(key: string, defaultValue?: T): T | null {
      try {
        const item = window.sessionStorage.getItem(key);
        return item ? JSON.parse(item) : (defaultValue ?? null);
      } catch (err) {
        console.warn(uiText("s33b761387f", { v0: key }), err);
        return defaultValue ?? null;
      }
    },
    set<T = any>(key: string, value: T): boolean {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn(uiText("sddaa8af72b", { v0: key }), err);
        return false;
      }
    },
    remove(key: string): void {
      try {
        window.sessionStorage.removeItem(key);
      } catch (err) {
        console.warn(uiText("sb9e9231645", { v0: key }), err);
      }
    },
  },
};
