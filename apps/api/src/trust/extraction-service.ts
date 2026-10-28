import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Repository } from "../common/repository";
import { DomainService } from "../domain/service";
import type { Actor, RecordEntity } from "../common/types";
import * as drafts from "../domain/drafts";
import { outcome } from "../domain/actions";
import { repoRoot } from "../common/paths";
import { digestBytes } from "./crypto";
import { documentText } from "./extraction";
import { configuredTermProvider } from "./term-provider";
import { can } from "../common/permissions";
import { ForbiddenException } from "@nestjs/common";
import type { ExtractionProposal } from "./types";

@Injectable()
export class ExtractionService {
  constructor(
    @Inject(Repository) private repo: Repository,
    @Inject(DomainService) private domain: DomainService,
  ) {}
  async latest(code: string, actor: Actor) {
    return this.domain.read(actor, (ctx) => {
      ctx.contract(code);
      const proposal = [...ctx.t["extraction-proposals"]]
        .reverse()
        .find((item) => item.contractCode === code) as unknown as
        ExtractionProposal | undefined;
      if (!proposal) return null;
      // Proposals confirmed before the name was stored still show who confirmed them.
      return {
        ...proposal,
        confirmedByName:
          proposal.confirmedByName ??
          (proposal.confirmedBy
            ? String(ctx.user(proposal.confirmedBy)?.displayName ?? "") || null
            : null),
      };
    });
  }
  async extract(code: string, actor: Actor) {
    if (!can(actor.role, "contracts:digitize"))
      throw new ForbiddenException("PERMISSION_DENIED");
    const provider = configuredTermProvider();
    const snapshot = await this.domain.read(actor, (ctx) => {
      ctx.contract(code);
      drafts.currentDraft(ctx, code); // Check buyer editor/organisation before any external request.
      return ctx.draft(code);
    });
    if (!snapshot || snapshot.state !== "DRAFT")
      throw new BadRequestException("DRAFT_LOCKED");
    const identity = provider.identity;
    const existing = (await this.repo.list("extraction-proposals")).find(
      (row) =>
        row.contractCode === code &&
        row.draftVersion === snapshot.version &&
        row.documentSha256 === (snapshot.file.sha256 ?? null) &&
        (row.extractor as typeof identity)?.kind === identity.kind &&
        (row.extractor as typeof identity)?.version === identity.version &&
        (row.extractor as typeof identity)?.model === identity.model,
    );
    let text = "",
      pdf: Buffer | undefined,
      pageCount = 1;
    const warnings: string[] = [];
    if (snapshot.file.documentId) {
      if (!/^[a-f0-9-]{36}$/.test(snapshot.file.documentId))
        throw new BadRequestException("INVALID_DOCUMENT");
      const path = resolve(
        repoRoot(),
        process.env.DATA_DIR ?? ".data",
        "uploads",
        snapshot.file.documentId,
      );
      if (digestBytes(await readFile(path)) !== snapshot.file.sha256)
        throw new BadRequestException("DOCUMENT_CHANGED");
      const document = (await this.repo.list("documents")).find(
        (row) => row.id === snapshot.file.documentId,
      );
      if (document?.pdfSha256) {
        pdf = await readFile(path + ".preview.pdf");
        if (digestBytes(pdf) !== document.pdfSha256)
          throw new BadRequestException("DOCUMENT_CHANGED");
        pageCount = (document.pdfPages as unknown[]).length;
        text = await documentText(path + ".preview.pdf", "PDF");
      } else {
        try {
          text = await documentText(path, snapshot.file.kind);
        } catch {
          warnings.push("EXTRACTION_UNAVAILABLE");
        }
      }
    } else warnings.push("TEMPLATE_FALLBACK");
    if (!text.trim()) warnings.push("NO_TEXT");
    if (existing) return existing;
    const extracted = await provider.extract({
      pdf,
      text,
      pageCount,
      jobKey: [
        actor.organizationId,
        code,
        snapshot.file.sha256,
        snapshot.version,
        identity.model ?? identity.kind,
        identity.version,
      ].join(":"),
    });
    const fields = extracted.fields;
    warnings.push(...extracted.warnings);
    for (const field of fields)
      if (field.value === null) warnings.push(`NEEDS_REVIEW:${field.path}`);
    return this.domain.write(actor, "EXTRACT_TERMS", (ctx) => {
      ctx.contract(code);
      drafts.currentDraft(ctx, code);
      const current = ctx.draft(code)!;
      if (
        current.version !== snapshot.version ||
        current.file.sha256 !== snapshot.file.sha256
      )
        throw new BadRequestException("DOCUMENT_CHANGED");
      const old = [...ctx.t["extraction-proposals"]]
        .reverse()
        .find(
          (proposal) =>
            proposal.contractCode === code &&
            proposal.draftVersion === current.version &&
            proposal.documentSha256 === (current.file.sha256 ?? null) &&
            (proposal.extractor as typeof identity)?.kind === identity.kind &&
            (proposal.extractor as typeof identity)?.version ===
              identity.version &&
            (proposal.extractor as typeof identity)?.model === identity.model,
        );
      if (old) return outcome(ctx, old);
      const now = new Date().toISOString();
      const proposal = {
        id: randomUUID(),
        contractCode: code,
        documentId: current.file.documentId ?? null,
        documentSha256: current.file.sha256 ?? null,
        draftVersion: current.version,
        extractor: {
          ...identity,
          kind:
            identity.kind === "GEMINI"
              ? "GEMINI"
              : text.trim()
                ? "TEXT_RULES"
                : "TEMPLATE",
        },
        ...(extracted.usage ? { usage: extracted.usage } : {}),
        fields,
        warnings,
        confirmedBy: null,
        confirmedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        organizationId: actor.organizationId,
      } as RecordEntity;
      ctx.t["extraction-proposals"].push(proposal);
      return outcome(ctx, proposal, {
        audit: [
          {
            category: "SYSTEM",
            contractId: code,
            milestoneId: null,
            detail: { kind: "WORKFLOW_ACTION", code: "EXTRACT_TERMS" },
          },
        ],
      });
    });
  }
  async confirm(code: string, id: string, values: unknown, actor: Actor) {
    if (!values || typeof values !== "object" || Array.isArray(values))
      throw new BadRequestException("INVALID_INPUT");
    const allowed = [
      "valueMillion",
      "graceDays",
      "penaltyRatePct",
      "maxPenaltyPct",
      "startDate",
      "endDate",
    ];
    if (Object.keys(values).some((key) => !allowed.includes(key)))
      throw new BadRequestException("INVALID_INPUT");
    const input = values as Record<string, string>;
    if (
      Object.values(input).some(
        (value) => typeof value !== "string" || value.length > 30,
      )
    )
      throw new BadRequestException("INVALID_INPUT");
    return this.domain.write(actor, "CONFIRM_EXTRACTION", (ctx) => {
      const current = drafts.currentDraft(ctx, code);
      const draft = ctx.draft(code)!;
      const proposal = ctx.t["extraction-proposals"].find(
        (item) => item.id === id && item.contractCode === code,
      );
      if (!proposal) throw new NotFoundException("RECORD_NOT_FOUND");
      if (proposal.confirmedBy)
        throw new BadRequestException("EXTRACTION_ALREADY_CONFIRMED");
      if (
        proposal.draftVersion !== draft.version ||
        proposal.documentSha256 !== (draft.file.sha256 ?? null)
      )
        throw new BadRequestException("DOCUMENT_CHANGED");
      drafts.saveDraft(ctx, {
        ...current,
        ...input,
        graceDays:
          input.graceDays === undefined
            ? current.graceDays
            : Number(input.graceDays),
      });
      Object.assign(proposal, {
        confirmedBy: actor.id,
        confirmedByName: actor.displayName,
        confirmedAt: new Date().toISOString(),
        confirmedValues: input,
        confirmedDraftVersion: ctx.draft(code)!.version,
        version: proposal.version + 1,
      });
      return outcome(ctx, proposal, {
        audit: [
          {
            category: "SYSTEM",
            contractId: code,
            milestoneId: null,
            detail: { kind: "WORKFLOW_ACTION", code: "CONFIRM_EXTRACTION" },
          },
        ],
      });
    });
  }
}
