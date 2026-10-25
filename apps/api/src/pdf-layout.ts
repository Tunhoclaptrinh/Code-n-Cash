import { BadRequestException } from "@nestjs/common";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

/** Enrich existing real uploads; retain slots and proofs so mismatches can be reviewed explicitly. */
export async function refreshPdfLayouts(
  repo: import("./common/repository").Repository,
) {
  const { createHash, randomUUID } = await import("node:crypto");
  const documents = (await repo.list("documents")).filter(
    (document) => document.pdfSha256 && document.pdfLayoutVersion !== 2,
  );
  for (const document of documents) {
    if (!/^[a-f0-9-]{36}$/.test(document.id)) continue;
    const path = resolve(
      repoRoot(),
      process.env.DATA_DIR ?? ".data",
      "uploads",
      document.id,
    );
    let pages: PdfPagePreview[];
    try {
      const [original, pdf] = await Promise.all([
        readFile(path),
        readFile(path + ".preview.pdf"),
      ]);
      const hash = (bytes: Buffer) =>
        createHash("sha256").update(bytes).digest("hex");
      if (
        hash(original) !== document.sha256 ||
        hash(pdf) !== document.pdfSha256
      )
        continue;
      pages = await inspectPdf(pdf);
    } catch {
      continue;
    } // Missing ephemeral uploads remain missing; never invent replacement bytes.
    const now = new Date().toISOString();
    await repo.transact(
      ["documents", "signing"],
      (tables) => {
        const current = tables.documents.find((row) => row.id === document.id);
        if (
          !current ||
          current.pdfSha256 !== document.pdfSha256 ||
          current.pdfLayoutVersion === 2
        )
          return false;
        current.pdfPages = pages;
        current.pdfLayoutVersion = 2;
        current.version++;
        current.updatedAt = now;
        for (const signing of tables.signing.filter(
          (row) => row.layoutDocumentId === document.id,
        )) {
          signing.previewPages = pages;
          signing.layoutVersion = Number(signing.layoutVersion ?? 0) + 1;
          signing.version++;
          signing.updatedAt = now;
        }
        return true;
      },
      (updated) =>
        updated
          ? [
              {
                id: randomUUID(),
                version: 1,
                createdAt: now,
                updatedAt: now,
                organizationId: document.organizationId,
                actorId: "system",
                action: "REFRESH_PDF_LAYOUT",
                resource: "documents",
                recordId: document.id,
              },
            ]
          : [],
    );
  }
}
