import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  Inject,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { Response } from "express";
import { previewPdf } from "./document-preview";
import { Repository } from "./common/repository";
import { BaseService } from "./common/services/base.service";
import { RequirePermission } from "./common/permissions";
import type { SessionRequest, RecordEntity } from "./common/types";
import { repoRoot } from "./common/paths";
@Controller("documents")
export class DocumentsController {
  constructor(
    @Inject(Repository) private repo: Repository,
    @Inject(BaseService) private base: BaseService,
  ) {}
  private folder() {
    return resolve(repoRoot(), process.env.DATA_DIR ?? ".data", "uploads");
  }
  @Post("preview")
  @RequirePermission("documents:upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  async previewLocal(
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number },
    @Res() res: Response,
  ) {
    if (!file?.size) throw new BadRequestException("PDF_REQUIRED");
    const pdf = file.buffer.subarray(0, 5).toString() === "%PDF-";
    const docx =
      file.originalname.toLowerCase().endsWith(".docx") &&
      file.buffer.subarray(0, 2).toString() === "PK";
    if (!pdf && !docx) throw new BadRequestException("PDF_REQUIRED");
    res.type("application/pdf").setHeader("Cache-Control", "no-store");
    res.send(await previewPdf(file.buffer, pdf ? "PDF" : "DOCX"));
  }
  @Get(":id/preview")
  @RequirePermission("documents:download")
  async previewSaved(
    @Param("id") id: string,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    const record = await this.base.get("documents", id, req.user);
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new BadRequestException("INVALID_DOCUMENT");
    const bytes = await readFile(resolve(this.folder(), id));
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256)
      throw new BadRequestException("DOCUMENT_CHANGED");
    res.type("application/pdf").setHeader("Cache-Control", "no-store");
    res.send(await previewPdf(bytes, String(record.kind)));
  }
  @Post(":draftId/appendices")
  @RequirePermission("documents:upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  async appendix(
    @Param("draftId") draftId: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number },
    @Req() req: SessionRequest,
  ) {
    return this.upload(draftId, file, req, true);
  }
  @RequirePermission("documents:upload")
  @Post(":draftId")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Param("draftId") draftId: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number },
    @Req() req: SessionRequest,
    appendix = false,
  ) {
    const candidate = (await this.repo.list("contract-drafts")).find(
      (entry) => entry.id === draftId || entry.code === draftId,
    );
    const draft = await this.base.get(
      "contract-drafts",
      candidate?.id ?? draftId,
      req.user,
    );
    if (draft.state && draft.state !== "DRAFT")
      throw new BadRequestException("DRAFT_LOCKED");
    const pdf = file?.buffer.subarray(0, 5).toString() === "%PDF-";
    const docx =
      file?.originalname.toLowerCase().endsWith(".docx") &&
      file.buffer.subarray(0, 2).toString() === "PK";
    if (!file || !file.size || (!pdf && !docx))
      throw new BadRequestException("PDF_REQUIRED");
    if (file.size > 20 * 1024 * 1024)
      throw new BadRequestException("FILE_TOO_LARGE");
    const fileHash = createHash("sha256").update(file.buffer).digest("hex");
    const prior = appendix
      ? (
          draft.appendixDocuments as
            Array<{ id: string; name: string; sha256: string }> | undefined
        )?.find(
          (document) =>
            document.name === file.originalname && document.sha256 === fileHash,
        )
      : undefined;
    if (prior) return this.base.get("documents", prior.id, req.user);
    const now = new Date().toISOString(),
      id = randomUUID();
    const record: RecordEntity = {
      id,
      name: file.originalname.slice(0, 255),
      contractId: draftId,
      organizationId: String(draft.organizationId),
      sha256: fileHash,
      purpose: appendix ? "APPENDIX" : "PRIMARY",
      size: file.size,
      kind: pdf ? "PDF" : "DOCX",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await mkdir(this.folder(), { recursive: true });
    const target = resolve(this.folder(), id);
    await writeFile(target, file.buffer, { flag: "wx" });
    try {
      await this.repo.transact(
        ["documents", "contract-drafts", "signing"],
        (tables) => {
          const current = tables["contract-drafts"].find(
            (entry) => entry.id === draft.id,
          )!;
          if (current.state && current.state !== "DRAFT")
            throw new BadRequestException("DRAFT_LOCKED");
          const appendices = (current.appendixDocuments ?? []) as Array<{
            id: string;
            name: string;
            sha256: string;
          }>;
          if (appendix && appendices.length >= 20)
            throw new BadRequestException("INVALID_DOCUMENT");
          if (
            appendix &&
            appendices.some((document) => document.name === record.name)
          )
            throw new BadRequestException("DUPLICATE_RECORD");
          tables.documents.push(record);
          if (appendix) {
            current.appendixDocuments = [
              ...appendices,
              { id, name: String(record.name), sha256: String(record.sha256) },
            ];
            current.appendixNames = [
              ...new Set([
                ...((current.appendixNames as string[]) ?? []),
                String(record.name),
              ]),
            ];
          } else
            current.file = {
              ...((current.file as object) ?? {}),
              name: record.name,
              sizeBytes: file.size,
              kind: record.kind,
              documentId: id,
              sha256: record.sha256,
            };
          current.digitization = null;
          current.version++;
          current.updatedAt = now;
          const signing = tables.signing.find(
            (entry) => entry.contractCode === current.code,
          );
          if (signing && !appendix) {
            signing.fileName = record.name;
            signing.version++;
            signing.updatedAt = now;
          }
        },
        [this.base.auditRecord("UPLOAD", "documents", id, req.user)],
      );
    } catch (error) {
      await unlink(target);
      throw error;
    }
    return record;
  }
  @RequirePermission("documents:download")
  @Get(":id/download")
  async download(
    @Param("id") id: string,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    const record = await this.base.get("documents", id, req.user);
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new BadRequestException("INVALID_DOCUMENT");
    const bytes = await readFile(resolve(this.folder(), id));
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256)
      throw new BadRequestException("DOCUMENT_CHANGED");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Type",
      record.kind === "DOCX"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(String(record.name))}`,
    );
    res.send(bytes);
  }
}
