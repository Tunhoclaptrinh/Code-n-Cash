import { BadRequestException } from "@nestjs/common";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
const execute = promisify(execFile);
/** Render the actual bytes in an isolated office profile; never invoke a shell. */
export async function previewPdf(bytes: Buffer, kind: string): Promise<Buffer> {
  if (kind === "PDF") return bytes;
  const folder = await mkdtemp(join(tmpdir(), "codecash-preview-"));
  try {
    await writeFile(join(folder, "document.docx"), bytes);
    await execute(
      process.env.LIBREOFFICE_BIN ?? "libreoffice",
      [
        `-env:UserInstallation=file://${folder}/profile`,
        "--headless",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        folder,
        join(folder, "document.docx"),
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    const path = join(folder, "document.pdf");
    if ((await stat(path)).size > 40 * 1024 * 1024)
      throw new Error("PREVIEW_TOO_LARGE");
    return await readFile(path);
  } catch {
    throw new BadRequestException("DOCUMENT_PREVIEW_UNAVAILABLE");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
