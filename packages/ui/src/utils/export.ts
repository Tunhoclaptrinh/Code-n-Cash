import Papa from "papaparse";
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename = "export.csv",
) {
  downloadBlob(
    new Blob(["\uFEFF", Papa.unparse(data, { escapeFormulae: true })], {
      type: "text/csv;charset=utf-8",
    }),
    filename.endsWith(".csv") ? filename : filename + ".csv",
  );
}
export function exportToJSON<T>(data: T, filename = "export.json") {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    filename.endsWith(".json") ? filename : filename + ".json",
  );
}
export function downloadExcelTemplate(
  columns: {
    key: string;
    label: string;
    sample?: string;
  }[],
  filename = "template.csv",
) {
  exportToCSV(
    [Object.fromEntries(columns.map((c) => [c.key, c.sample ?? ""]))],
    filename,
  );
}
export async function parseImportFile(
  file: File,
): Promise<Record<string, unknown>[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error("FILE_TOO_LARGE");
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".json")) {
    const value = JSON.parse(text);
    if (
      !Array.isArray(value) ||
      value.some((x) => !x || typeof x !== "object" || Array.isArray(x))
    )
      throw new Error("INVALID_IMPORT");
    return value;
  }
  if (!file.name.toLowerCase().endsWith(".csv"))
    throw new Error("UNSUPPORTED_FILE");
  const parsed = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    { header: true, skipEmptyLines: "greedy" },
  );
  if (parsed.errors.length) throw new Error("INVALID_CSV");
  return parsed.data;
}
