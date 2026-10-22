import { createContext, useContext } from "react";
import type { NavKey } from "./navConfig";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/** What the current page tells the persistent layout: highlighted nav entry and breadcrumb trail. */
export interface PageChrome {
  active?: NavKey;
  breadcrumb: BreadcrumbItem[];
}

export const PageChromeContext = createContext<(chrome: PageChrome) => void>(
  () => {},
);

export const usePublishChrome = () => useContext(PageChromeContext);
