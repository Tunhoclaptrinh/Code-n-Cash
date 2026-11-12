import { useCallback, useState } from "react";
import type { DataTableColumn } from "./types";

/** Stable identity of a column: its key, else its data index. */
export function columnId(column: DataTableColumn<any>): string {
  if (column.key !== undefined && column.key !== null)
    return String(column.key);
  const index = column.dataIndex as unknown;
  return Array.isArray(index) ? index.join(".") : String(index ?? "");
}

const storageKey = (key: string) => `cc.table.columns.${key}`;

function read(key: string | undefined): string[] {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(storageKey(key));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Columns the viewer chose to hide, remembered per table in this browser (a viewing preference
 * only). Without a key nothing is remembered and every column shows.
 */
export function useHiddenColumns(key: string | undefined) {
  const [hidden, setHidden] = useState<string[]>(() => read(key));
  const update = useCallback(
    (next: string[]) => {
      setHidden(next);
      if (!key) return;
      try {
        if (next.length)
          localStorage.setItem(storageKey(key), JSON.stringify(next));
        else localStorage.removeItem(storageKey(key));
      } catch {
        /* Storage blocked: the choice lasts for this page only. */
      }
    },
    [key],
  );
  return [hidden, update] as const;
}
