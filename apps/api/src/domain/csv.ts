/** RFC 4180 CSV for the Data Pack: quoted fields, embedded commas and newlines, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell !== ""));
}

/** Rows keyed by header, every value kept as the exact string of the file. */
export function readRecords(text: string): {
  columns: string[];
  rows: Record<string, string>[];
} {
  const [columns = [], ...body] = parseCsv(text);
  return {
    columns,
    rows: body.map((cells) =>
      Object.fromEntries(columns.map((key, i) => [key, cells[i] ?? ""])),
    ),
  };
}

const needsQuotes = /[",\r\n]/;

/** Plain CSV for the engine: no BOM and no formula escaping, so values reach Python unchanged. */
export function writeCsv(
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string {
  const cell = (value: unknown) => {
    const text = value === undefined || value === null ? "" : String(value);
    return needsQuotes.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return (
    [
      columns.join(","),
      ...rows.map((row) => columns.map((key) => cell(row[key])).join(",")),
    ].join("\n") + "\n"
  );
}
