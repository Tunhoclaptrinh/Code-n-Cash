import {
  Controller,
  Get,
  Inject,
  Param,
  Req,
  Res,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Response } from "express";
import { RequirePermission } from "./common/permissions";
import type { SessionRequest } from "./common/types";
import { Repository } from "./common/repository";
import { DomainService } from "./domain/service";
import { repoRoot } from "./common/paths";
import { previewPdf } from "./document-preview";
/** Contract participants may view their own files without global document-library privileges. */
@Controller("contract-files")
export class ContractFilesController {
  constructor(
    @Inject(DomainService) private domain: DomainService,
    @Inject(Repository) private repo: Repository,
  ) {}
  private async files(code: string, req: SessionRequest) {
    const draft = await this.domain.read(req.user, (ctx) => {
      ctx.contract(code);
      return ctx.draft(code);
    });
    return (await this.repo.list("documents"))
      .filter(
        (file) =>
          file.contractId === code || (draft && file.contractId === draft.id),
      )
      .sort(
        (a, b) =>
          Number(b.id === draft?.file.documentId) -
            Number(a.id === draft?.file.documentId) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  }
  @Get(":code")
  @RequirePermission("contracts:read")
  async list(@Param("code") code: string, @Req() req: SessionRequest) {
    return (await this.files(code, req)).map((file) => ({
      id: file.id,
      name: file.name,
      sha256: file.sha256,
    }));
  }
  private async original(code: string, id: string, req: SessionRequest) {
    const file = (await this.files(code, req)).find((file) => file.id === id);
    if (!file || !/^[a-f0-9-]{36}$/.test(id))
      throw new NotFoundException("RECORD_NOT_FOUND");
    const bytes = await readFile(
      resolve(repoRoot(), process.env.DATA_DIR ?? ".data", "uploads", id),
    );
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new BadRequestException("DOCUMENT_CHANGED");
    return { file, bytes };
  }
  @Get(":code/:id/download")
  @RequirePermission("contracts:read")
  async download(
    @Param("code") code: string,
    @Param("id") id: string,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    const { file, bytes } = await this.original(code, id, req);
    res.type(
      file.kind === "PDF"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(String(file.name))}`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(bytes);
  }
  @Get(":code/:id/preview")
  @RequirePermission("contracts:read")
  async preview(
    @Param("code") code: string,
    @Param("id") id: string,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    const { file, bytes } = await this.original(code, id, req);
    res.type("application/pdf").setHeader("Cache-Control", "no-store");
    res.send(await previewPdf(bytes, String(file.kind)));
  }
}
