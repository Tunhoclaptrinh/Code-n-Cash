import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared components take their colours from the design tokens, so the dark theme and a later
 * rebrand reach them. A raw hex may appear only as the fallback of a token (`var(--x, #hex)`) or
 * in the few places listed here, each with its reason.
 */
const ALLOWED = [
  // antd derives a Tag's border and text from this value, so it must be a real colour.
  ["StatisticCard.tsx", 'color={tag.color || "#10B981"}'],
  ["StatisticCard.tsx", 'color={trend.isIncrease ? "#10B981" : "#EF4444"}'],
  // Text on solid status fills: white on red and green, near-black on the gold fill.
  ["BaseButton.tsx", 'color: "#FFFFFF",'],
  ["BaseButton.tsx", 'color: "#111827",'],
  // The light branch of the secondary button; the dark branch is a translucent white.
  ["BaseButton.tsx", 'background: isLight ? "#FFFFFF"'],
];

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

test("shared components use colour tokens, not raw hex values", async () => {
  const offenders = [];
  for (const file of await files("packages/ui/src/components")) {
    const name = file.split("/").pop();
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      const bare = line.replace(
        /var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/g,
        "",
      );
      if (!/#[0-9a-fA-F]{6}\b/.test(bare)) return;
      if (ALLOWED.some(([f, text]) => f === name && line.includes(text)))
        return;
      offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
