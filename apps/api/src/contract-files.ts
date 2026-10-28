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
import { renderPdfPage } from "./pdf-layout";
import {
  MOCK_ORIGINAL_ID,
  mockInput,
  mockOriginal,
  mockRendering,
  needsMockOriginal,
} from "./mock-originals";
import type { PdfPagePreview, Rect, SlotMap } from "./domain/types";
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
  /** Generator input when the contract has no uploaded original, else undefined. */
  private mock(code: string, req: SessionRequest) {
    return this.domain.read(req.user, (ctx) =>
      needsMockOriginal(ctx, code) ? mockInput(ctx, code) : undefined,
    );
  }
  @Get(":code")
  @RequirePermission("contracts:read")
  async list(@Param("code") code: string, @Req() req: SessionRequest) {
    const files = (await this.files(code, req)).map((file) => ({
      id: file.id,
      name: file.name,
      sha256: file.sha256,
    }));
    const input = files.length ? undefined : await this.mock(code, req);
    if (!input) return files;
    const original = await mockOriginal(input);
    return [
      {
        id: MOCK_ORIGINAL_ID,
        name: original.name,
        sha256: original.sha256,
        simulated: true,
      },
    ];
  }
  /**
   * The document to read with its pages and, per signing step, where the signature sits and its
   * state, so screens can draw demo signatures and seals over the page images.
   */
  @Get(":code/view")
  @RequirePermission("contracts:read")
  async view(@Param("code") code: string, @Req() req: SessionRequest) {
    const files = await this.files(code, req);
    const input = files.length ? undefined : await this.mock(code, req);
    const steps = await this.domain.read(req.user, (ctx) => {
      const signing = ctx.signing(code);
      return {
        layoutDocumentId: signing?.layoutDocumentId
          ? String(signing.layoutDocumentId)
          : undefined,
        slots: (signing?.slots ?? {}) as SlotMap,
        steps: (signing?.steps ?? []).map((step) => ({
          stepNo: step.stepNo,
          party: step.party,
          signerName: step.signerName,
          organizationName: ctx.partyName(step.organizationId),
          status: step.status,
          signedAt: step.signedAt,
          method: step.method,
          // Lets the signer preview their own signature before signing; from the session only.
          mine: step.signerUserId === req.user.id,
        })),
      };
    });
    let document: { id: string; name: string; simulated: boolean };
    let pages: PdfPagePreview[];
    let placed: Array<{ stepNo: number; page: number } & Rect>;
    if (input) {
      const rendering = await mockRendering(input);
      document = {
        id: MOCK_ORIGINAL_ID,
        name: rendering.name,
        simulated: true,
      };
      pages = rendering.pages;
      placed = pages.flatMap((page) =>
        (page.anchors ?? []).map((anchor) => ({
          stepNo: anchor.stepNo,
          page: page.pageNo,
          x: anchor.x,
          y: anchor.y,
          w: anchor.w ?? 240,
          h: anchor.h ?? 92,
        })),
      );
    } else {
      const file =
        files.find((f) => f.id === steps.layoutDocumentId) ?? files[0];
      if (!file) throw new NotFoundException("RECORD_NOT_FOUND");
      document = { id: file.id, name: String(file.name), simulated: false };
      pages = (file.pdfPages as PdfPagePreview[] | undefined) ?? [];
      placed =
        file.id === steps.layoutDocumentId
          ? Object.entries(steps.slots).flatMap(([stepNo, slot]) =>
              slot ? [{ stepNo: Number(stepNo), ...slot }] : [],
            )
          : [];
    }
    return {
      document,
      pages: pages.map((page) => ({
        pageNo: page.pageNo,
        width: page.width ?? 520,
        height: page.height ?? 736,
      })),
      marks: steps.steps.flatMap((step) => {
        const slot = placed.find((p) => p.stepNo === step.stepNo);
        return slot
          ? [
              {
                ...step,
                page: slot.page,
                x: slot.x,
                y: slot.y,
                w: slot.w,
                h: slot.h,
              },
            ]
          : [];
      }),
    };
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
    if (id === MOCK_ORIGINAL_ID) {
      const input = await this.mock(code, req);
      if (!input) throw new NotFoundException("RECORD_NOT_FOUND");
      const original = await mockOriginal(input);
      res.type(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(original.name)}`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(original.docx);
      return;
    }
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
    if (id === MOCK_ORIGINAL_ID) {
      const input = await this.mock(code, req);
      if (!input) throw new NotFoundException("RECORD_NOT_FOUND");
      res.type("application/pdf").setHeader("Cache-Control", "no-store");
      res.send((await mockRendering(input)).pdf);
      return;
    }
    const { file, bytes } = await this.original(code, id, req);
    res.type("application/pdf").setHeader("Cache-Control", "no-store");
    if (file.pdfSha256) {
      const pdf = await readFile(
        resolve(
          repoRoot(),
          process.env.DATA_DIR ?? ".data",
          "uploads",
          id + ".preview.pdf",
        ),
      );
      if (createHash("sha256").update(pdf).digest("hex") !== file.pdfSha256)
        throw new BadRequestException("DOCUMENT_CHANGED");
      res.send(pdf);
    } else res.send(await previewPdf(bytes, String(file.kind)));
  }
  @Get(":code/:id/pages/:page/image")
  @RequirePermission("contracts:read")
  async pageImage(
    @Param("code") code: string,
    @Param("id") id: string,
    @Param("page") pageText: string,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    if (id === MOCK_ORIGINAL_ID) {
      const input = await this.mock(code, req);
      if (!input) throw new NotFoundException("RECORD_NOT_FOUND");
      const rendering = await mockRendering(input);
      if (
        !/^[1-9]\d{0,2}$/.test(pageText) ||
        !rendering.pages.some((p) => p.pageNo === Number(pageText))
      )
        throw new BadRequestException("INVALID_DOCUMENT");
      res.type("image/png").setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(await renderPdfPage(rendering.pdf, Number(pageText)));
      return;
    }
    const { file } = await this.original(code, id, req);
    if (
      !/^[1-9]\d{0,2}$/.test(pageText) ||
      !(file.pdfPages as Array<{ pageNo: number }> | undefined)?.some(
        (p) => p.pageNo === Number(pageText),
      )
    )
      throw new BadRequestException("INVALID_DOCUMENT");
    const pdf = await readFile(
      resolve(
        repoRoot(),
        process.env.DATA_DIR ?? ".data",
        "uploads",
        id + ".preview.pdf",
      ),
    );
    if (createHash("sha256").update(pdf).digest("hex") !== file.pdfSha256)
      throw new BadRequestException("DOCUMENT_CHANGED");
    res.type("image/png").setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(await renderPdfPage(pdf, Number(pageText)));
  }
}
