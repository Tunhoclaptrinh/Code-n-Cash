/**
 * RFC 4180 CSV with a UTF-8 byte order mark so spreadsheet apps read Vietnamese text.
 * Cells starting with = + - @ are prefixed with ' to stop formula injection.
 */
export function toCsv(
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map(cell).join(","),
    ...rows.map((row) => columns.map((c) => cell(row[c])).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
