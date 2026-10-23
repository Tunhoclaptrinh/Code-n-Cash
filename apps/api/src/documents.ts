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
    const now = new Date().toISOString(),
      id = randomUUID();
    const record: RecordEntity = {
      id,
      name: file.originalname.slice(0, 255),
      contractId: draftId,
      organizationId: String(draft.organizationId),
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
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
          tables.documents.push(record);
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
          if (signing) {
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
