import { templateSnapshot } from "./domain/contract-templates";
import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { spawn } from "node:child_process";
import { RequirePermission } from "./common/permissions";
import type { SessionRequest } from "./common/types";
import { repoRoot } from "./common/paths";
import { draftProblems } from "./common/field-validation";
import { DomainService } from "./domain/service";
import {
  stagesOf,
  uploadFormOptions,
  validateDraftSigners,
} from "./domain/drafts";
import { addDays } from "./domain/templates";
import type { ContractDraft } from "./domain/types";

export const generateSampleDocx = (input: unknown): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON ?? "python3",
      ["apps/engine/sample_contract.py"],
      { cwd: repoRoot(), stdio: ["pipe", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    const fail = () =>
      reject(new BadRequestException("SAMPLE_GENERATION_FAILED"));
    const timer = setTimeout(() => {
      child.kill();
      fail();
    }, 5000);
    child.on("error", () => {
      clearTimeout(timer);
      fail();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2_000_000) {
        child.kill();
        fail();
      } else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(Buffer.concat(chunks)) : fail();
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });

@Controller("contract-samples")
export class SampleDocumentsController {
  constructor(@Inject(DomainService) private domain: DomainService) {}
  @Post()
  @RequirePermission("documents:upload")
  async create(
    @Body() body: { draft?: ContractDraft; language?: string },
    @Req() req: SessionRequest,
  ) {
    if (!body?.draft || !["vi", "en"].includes(body.language ?? "vi"))
      throw new BadRequestException("INVALID_INPUT");
    const input = await this.domain.read(req.user, (ctx) => {
      const options = uploadFormOptions(ctx); // Buyer editor and organisation checks.
      const draft = body.draft!;
      if (!options.types.includes(draft.type))
        throw new BadRequestException("INVALID_TYPE");
      if (!options.policies.includes(draft.approvalPolicy))
        throw new BadRequestException("INVALID_POLICY");
      if (
        draft.documentBody !== undefined &&
        (typeof draft.documentBody !== "string" ||
          draft.documentBody.length > 20000)
      )
        throw new BadRequestException("CONTRACT_TEMPLATE_INVALID");
      const selected = templateSnapshot(ctx, draft);
      const problems = draftProblems(draft);
      if (Object.keys(problems).length)
        throw new BadRequestException(Object.values(problems)[0]);
      const signers = validateDraftSigners(ctx, draft);
      return {
        documentBody: draft.documentBody ?? selected?.documentBody ?? "",
        language: body.language ?? "vi",
        title: draft.title,
        code: draft.code,
        buyer: ctx.partyName(ctx.actor.organizationId),
        supplier: ctx.partyName(draft.supplierId),
        valueMillion: draft.valueMillion,
        startDate: draft.startDate,
        endDate: draft.endDate,
        graceDays: draft.graceDays,
        penaltyRatePct: draft.penaltyRatePct,
        maxPenaltyPct: draft.maxPenaltyPct,
        approvalPolicy: draft.approvalPolicy,
        signers: signers.map((signer) => ({
          party: signer.party,
          name: String(ctx.user(signer.userId)!.displayName),
        })),
        stages: stagesOf(ctx, draft.type).map((stage) => ({
          type: stage.type,
          name: stage.name,
          paymentPercent: stage.paymentPercent,
          dueDate: addDays(draft.startDate, stage.offsetDays),
          requiredEvents: stage.eventTypes.join(", "),
        })),
      };
    });
    const bytes = await generateSampleDocx(input);
    return {
      fileName: `CodeCash-${input.signers.length}-signers.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64: bytes.toString("base64"),
    };
  }
}
