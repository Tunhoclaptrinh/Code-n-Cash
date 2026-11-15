import { BadRequestException } from "@nestjs/common";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
const execute = promisify(execFile);
/** LibreOffice on a desktop can take tens of seconds per document; the server image is faster. */
const timeoutMs = () => {
  const value = Number(process.env.LIBREOFFICE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 120_000;
};
/** Render the actual bytes in an isolated office profile; never invoke a shell. */
export async function previewPdf(bytes: Buffer, kind: string): Promise<Buffer> {
  if (kind === "PDF") return bytes;
  const folder = await mkdtemp(join(tmpdir(), "codecash-preview-"));
  try {
    await writeFile(join(folder, "document.docx"), bytes);
    await execute(
      process.env.LIBREOFFICE_BIN || "libreoffice",
      [
        `-env:UserInstallation=${pathToFileURL(join(folder, "profile")).href}`,
        "--headless",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        folder,
        join(folder, "document.docx"),
      ],
      { timeout: timeoutMs(), maxBuffer: 1024 * 1024 },
    );
    const path = join(folder, "document.pdf");
    if ((await stat(path)).size > 40 * 1024 * 1024)
      throw new Error("PREVIEW_TOO_LARGE");
    return await readFile(path);
  } catch {
    throw new BadRequestException("DOCUMENT_PREVIEW_UNAVAILABLE");
  } finally {
    // On Windows a timed-out office process can still hold the folder; a leftover
    // temporary folder must not turn the preview error into a 500.
    await rm(folder, { recursive: true, force: true }).catch(() => undefined);
  }
}
