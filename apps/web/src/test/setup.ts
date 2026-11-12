import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "@/i18n";

// antd's responsive helpers ask for matchMedia, which jsdom does not provide.
if (!window.matchMedia)
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;

// Numbers and dates format in Vietnamese, as in the product.
await i18n.changeLanguage("vi");

afterEach(() => cleanup());
