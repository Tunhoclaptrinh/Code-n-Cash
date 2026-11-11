import { useState, type ReactNode } from "react";
import { Splitter } from "antd";
import styles from "./SplitView.module.css";

const PREFIX = "codecash.split.";

function readSize(key: string): number | undefined {
  try {
    const value = Number(localStorage.getItem(PREFIX + key));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeSize(key: string, value: number) {
  try {
    localStorage.setItem(PREFIX + key, String(Math.round(value)));
  } catch {
    // Storage may be blocked; the split then starts from its default each visit.
  }
}

/**
 * Two resizable columns (Ant Design Splitter) that grow with their content, so the page keeps one
 * scroll and a `sticky` child stays in view. The start column can be collapsed, and its width is
 * remembered per screen in this browser. Below 1200px the columns stack through CSS only: the
 * element tree never changes with the viewport, so forms inside keep what the user typed.
 */
export function SplitView({
  start,
  end,
  storageKey,
  defaultStart = "45%",
  minStart = 320,
  maxStart = "70%",
  minEnd = 380,
  collapsible = true,
  stackEndFirst = false,
  testId,
}: {
  /** Null hides the start column (narrow screens that show it elsewhere). */
  start: ReactNode;
  end: ReactNode;
  /** Remembers the start column's width under this name. */
  storageKey: string;
  defaultStart?: number | string;
  minStart?: number | string;
  maxStart?: number | string;
  minEnd?: number | string;
  collapsible?: boolean;
  /** On narrow screens, show the end column above the start column. */
  stackEndFirst?: boolean;
  testId?: string;
}) {
  const [initial] = useState(() => readSize(storageKey) ?? defaultStart);
  return (
    <div
      className={[
        styles.root,
        stackEndFirst ? styles.endFirst : "",
        start == null ? styles.noStart : "",
      ].join(" ")}
      data-testid={testId}
    >
      <Splitter
        className={styles.split}
        onResizeEnd={(sizes) => {
          if (sizes[0] > 0) writeSize(storageKey, sizes[0]);
        }}
      >
        <Splitter.Panel
          className={styles.panel}
          defaultSize={initial}
          min={minStart}
          max={maxStart}
          collapsible={collapsible}
        >
          {start}
        </Splitter.Panel>
        <Splitter.Panel className={styles.panel} min={minEnd}>
          {end}
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}
