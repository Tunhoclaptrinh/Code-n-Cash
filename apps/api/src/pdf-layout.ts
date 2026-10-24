import { BadRequestException } from "@nestjs/common";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { repoRoot } from "./common/paths";
import type { PdfPagePreview } from "./domain/types";

const execute = promisify(execFile);
async function temporary<T>(
  pdf: Buffer,
  fn: (folder: string, path: string) => Promise<T>,
) {
  const folder = await mkdtemp(join(tmpdir(), "codecash-pdf-"));
  const path = join(folder, "source.pdf");
  try {
    await writeFile(path, pdf);
    return await fn(folder, path);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export async function inspectPdf(pdf: Buffer): Promise<PdfPagePreview[]> {
  try {
    return await temporary(pdf, async (folder, path) => {
      const bbox = join(folder, "pages.xhtml");
      await execute(
        "pdftotext",
        ["-bbox-layout", "-enc", "UTF-8", path, bbox],
        { timeout: 20000, maxBuffer: 1024 * 1024 },
      );
      const { stdout } = await execute(
        process.env.PYTHON ?? "python3",
        [join(repoRoot(), "apps/engine/pdf_geometry.py"), bbox],
        { timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
      );
      return JSON.parse(stdout).map((page: PdfPagePreview) => ({
        ...page,
        heading: "ARTICLE_14",
        textLineCount: 0,
        hasSignatureBlock: !!page.anchors?.length,
        blocks: [],
      }));
    });
  } catch {
    throw new BadRequestException("INVALID_DOCUMENT");
  }
}

export async function renderPdfPage(
  pdf: Buffer,
  page: number,
): Promise<Buffer> {
  return temporary(pdf, async (folder, path) => {
    const output = join(folder, "page");
    await execute(
      "pdftoppm",
      [
        "-f",
        String(page),
        "-l",
        String(page),
        "-singlefile",
        "-png",
        "-scale-to-x",
        "1040",
        "-scale-to-y",
        "-1",
        path,
        output,
      ],
      { timeout: 20000, maxBuffer: 1024 * 1024 },
    );
    return readFile(output + ".png");
  });
}
