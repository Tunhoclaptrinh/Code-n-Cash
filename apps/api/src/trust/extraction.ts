import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { exactDecimal, validIsoDate } from "../common/field-validation";
import type { ExtractionField } from "./types";

const execute = promisify(execFile);
export interface TermExtractor {
  readonly kind: "TEXT_RULES";
  readonly version: string;
  extract(text: string): ExtractionField[];
}

/** Bounded local parsers. The filename is a server UUID, never a user-supplied shell command. */
export async function documentText(
  path: string,
  kind: "PDF" | "DOCX",
): Promise<string> {
  if (kind === "PDF") {
    const { stdout } = await execute(
      "pdftotext",
      ["-layout", "-enc", "UTF-8", path, "-"],
      { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 },
    );
    return stdout;
  }
  const code =
    "import zipfile,sys,xml.etree.ElementTree as E\nwith zipfile.ZipFile(sys.argv[1]) as z:\n i=z.getinfo('word/document.xml')\n if i.file_size>2000000: raise ValueError('DOCUMENT_TOO_LARGE')\n r=E.fromstring(z.read(i))\n print('\\n'.join(''.join(p.itertext()) for p in r.iter() if p.tag.endswith('}p')))";
  const { stdout } = await execute(
    process.env.PYTHON ?? "python3",
    ["-c", code, path],
    { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 },
  );
  return stdout;
}

const amount = (value: string): string | null => {
  let text = value.replace(/\s/g, "");
  if (text.includes(",") && text.includes(".")) {
    const decimal = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
    text =
      text.slice(0, decimal).replace(/[.,]/g, "") +
      "." +
      text.slice(decimal + 1);
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(text))
    text = text.replace(/[.,]/g, "");
  else text = text.replace(",", ".");
  return exactDecimal(text, "1000000", true) ? text : null;
};
const date = (text: string) => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const value = match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : text;
  return validIsoDate(value) ? value : null;
};

/** Suggestions require an exact source line. Missing or contradictory values stay null. */
export class LocalTermExtractor implements TermExtractor {
  readonly kind = "TEXT_RULES" as const;
  readonly version = "1.0.0";
  extract(text: string): ExtractionField[] {
    const rules: Array<{
      path: string;
      expression: RegExp;
      normalize: (text: string) => string | null;
    }> = [
      {
        path: "valueMillion",
        expression:
          /(?:tổng (?:giá trị|giá)|giá trị hợp đồng|contract value|total value)\s*[:=]?\s*([\d][\d., ]*)\s*(?:triệu|million)/iu,
        normalize: amount,
      },
      {
        path: "graceDays",
        expression:
          /(?:ân hạn|grace(?: period)?)\s*[:=]?\s*(\d{1,2})\s*(?:ngày|days?)/iu,
        normalize: (s) => (Number(s) <= 60 ? String(Number(s)) : null),
      },
      {
        path: "penaltyRatePct",
        expression:
          /(?:phạt(?: trễ(?: hạn)?)?|penalty(?: rate)?)\s*[:=]?\s*([\d.,]+)\s*%\s*(?:\/|mỗi|per)\s*(?:ngày|day)/iu,
        normalize: (s) => (exactDecimal(s, "5") ? s.replace(",", ".") : null),
      },
      {
        path: "maxPenaltyPct",
        expression:
          /(?:trần phạt|mức phạt tối đa|không vượt quá|penalty cap)\s*[:=]?\s*([\d.,]+)\s*%/iu,
        normalize: (s) => (exactDecimal(s, "100") ? s.replace(",", ".") : null),
      },
      {
        path: "startDate",
        expression:
          /(?:ngày bắt đầu|start date)\s*[:=]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/iu,
        normalize: date,
      },
      {
        path: "endDate",
        expression:
          /(?:ngày kết thúc|end date)\s*[:=]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/iu,
        normalize: date,
      },
    ];
    return rules.map(({ path, expression, normalize }) => {
      const candidates: Array<{ value: string; page: number; quote: string }> =
        [];
      text.split("\f").forEach((page, index) =>
        page.split(/\r?\n/).forEach((line) => {
          for (const match of line.matchAll(
            new RegExp(expression.source, expression.flags + "g"),
          )) {
            const value = normalize(match[1]);
            if (value)
              candidates.push({
                value,
                page: index + 1,
                quote:
                  line.length <= 1000 ? line.trim() : match[0].slice(0, 1000),
              });
          }
        }),
      );
      const values = new Set(candidates.map((entry) => entry.value));
      const selected = values.size === 1 ? candidates[0] : undefined;
      return {
        path,
        value: selected?.value ?? null,
        evidence: selected
          ? { page: selected.page, quote: selected.quote }
          : null,
        state: selected ? "SUGGESTED" : "NEEDS_REVIEW",
      };
    });
  }
}
