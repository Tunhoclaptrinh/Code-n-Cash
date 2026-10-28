import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { RequirePermission } from "./common/permissions";
import type { SessionRequest } from "./common/types";
import { DomainService } from "./domain/service";
import {
  EVIDENCE_MAX_BYTES,
  readEvidence,
  storeEvidence,
} from "./evidence-store";
import { WorkflowService } from "./workflow.controller";

/**
 * Evidence files of a milestone. The upload stores the bytes under their SHA-256 and attaches them
 * through the `attachEvidenceFile` workflow action, so scope, side and event-type checks and the audit
 * entry are the action's own; the download re-hashes the file before sending it.
 */
@Controller("evidence-documents")
export class EvidenceDocumentsController {
  constructor(
    @Inject(WorkflowService) private workflow: WorkflowService,
    @Inject(DomainService) private domain: DomainService,
  ) {}

  @Post()
  @RequirePermission("evidence:submit")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: EVIDENCE_MAX_BYTES, files: 1 },
    }),
  )
  async upload(
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Body()
    body: { contractId?: string; sequence?: string; eventType?: string },
    @Req() req: SessionRequest,
  ) {
    if (!file?.size) throw new BadRequestException("INVALID_FILE");
    // Multer reads names as latin1; browsers send UTF-8.
    const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");
    let stored;
    try {
      stored = await storeEvidence(file.buffer, fileName);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "INVALID_FILE",
      );
    }
    return this.workflow.call(
      "evidence",
      "attachEvidenceFile",
      {
        args: [
          {
            contractId: body.contractId,
            sequence: Number(body.sequence),
            eventType: body.eventType,
            fileName,
            sha256: stored.sha256,
            mediaType: stored.mediaType,
          },
        ],
      },
      req.user,
    );
  }

  /** The document behind an event the caller can see, checked against the hash the event carries. */
  @Get(":eventId/download")
  @RequirePermission("contracts:read")
  async download(
    @Param("eventId") eventId: string,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    const document = await this.domain.read(req.user, (ctx) => {
      const event = ctx.events.find((e) => e.event_id === eventId);
      if (!event?.document) throw new NotFoundException("RECORD_NOT_FOUND");
      ctx.contract(event.contract_id);
      return event.document;
    });
    let bytes: Buffer;
    try {
      bytes = await readEvidence(document.sha256);
    } catch {
      throw new BadRequestException("DOCUMENT_CHANGED");
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", document.mediaType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Content-SHA256", document.sha256);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    res.send(bytes);
  }
}
