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
import {
  daysBetween,
  fromCents,
  scheduleDueDates,
  shareOf,
  toCents,
} from "./domain/templates";
import type { StageTemplate } from "./domain/records";
import type { MilestoneEdit } from "./domain/types";
import { AUTHORITY } from "./domain/vocabulary";

/**
 * The document's milestone table, from the same data the digitisation uses: the scheduled due
 * dates, each milestone's amount (the last takes the remainder), every required document with the
 * side that provides it, the penalty flag and the approval exemption, with a person's corrections
 * when the saved draft has them. The warranty is written as a relative term, as the digitisation
 * then asks for its date.
 */
const scheduled = (
  base: StageTemplate[],
  period: { startDate: string; endDate: string } | null,
  valueMillion: string | null,
  edits: MilestoneEdit[] | null,
) => {
  const dates = period
    ? scheduleDueDates(period.startDate, period.endDate, base)
    : {};
  let allocated = 0n;
  return base.map((original, index) => {
    const edit = edits?.find((row) => row.sequence === original.sequence);
    const stage = edit
      ? {
          ...original,
          paymentPercent: edit.paymentPercent,
          eventTypes: edit.eventTypes,
          latePenalty: edit.latePenalty,
          approval: edit.approval,
        }
      : original;
    let amountMillion: string | null = null;
    if (valueMillion) {
      amountMillion =
        index === base.length - 1
          ? fromCents(toCents(valueMillion) - allocated)
          : shareOf(valueMillion, stage.paymentPercent);
      allocated += toCents(amountMillion);
    }
    const warranty = stage.type.startsWith("WARRANTY");
    const scheduledDate = dates[stage.sequence];
    const previousDate = index
      ? dates[base[index - 1].sequence]
      : period?.startDate;
    const relativeTermMonths =
      warranty && !edit?.dueDate && scheduledDate && previousDate
        ? Math.max(1, Math.round(daysBetween(previousDate, scheduledDate) / 30))
        : null;
    return {
      type: stage.type,
      name: stage.name,
      paymentPercent: stage.paymentPercent,
      amountMillion,
      dueDate: edit
        ? (edit.dueDate ?? "")
        : relativeTermMonths
          ? ""
          : (scheduledDate ?? SAMPLE_PLACEHOLDER),
      relativeTermMonths,
      requiredEvents: stage.eventTypes.join(", "),
      documents: stage.eventTypes.map((eventType) => ({
        eventType,
        side: AUTHORITY[eventType],
      })),
      latePenalty: stage.latePenalty,
      approval: stage.approval ?? "CONTRACT",
    };
  });
};
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

/** Shown in place of any display field a partial (live preview) draft has not completed yet. */
export const SAMPLE_PLACEHOLDER = "……";

const provided = (value: unknown) =>
  value !== undefined && value !== null && value !== "";

@Controller("contract-samples")
export class SampleDocumentsController {
  constructor(@Inject(DomainService) private domain: DomainService) {}
  /**
   * `partial: true` renders an unfinished draft for the live preview: missing or invalid display
   * fields become placeholders and signers without a userId are skipped. Everything that IS provided
   * is still checked against this actor (type, policy, supplier, signers).
   */
  @Post()
  @RequirePermission("documents:upload")
  async create(
    @Body()
    body: { draft?: ContractDraft; language?: string; partial?: boolean },
    @Req() req: SessionRequest,
  ) {
    if (!body?.draft || !["vi", "en"].includes(body.language ?? "vi"))
      throw new BadRequestException("INVALID_INPUT");
    const partial = body.partial === true;
    const input = await this.domain.read(req.user, (ctx) => {
      const options = uploadFormOptions(ctx); // Buyer editor and organisation checks.
      const draft = body.draft!;
      if (
        (!partial || provided(draft.type)) &&
        !options.types.includes(draft.type)
      )
        throw new BadRequestException("INVALID_TYPE");
      if (
        (!partial || provided(draft.approvalPolicy)) &&
        !options.policies.includes(draft.approvalPolicy)
      )
        throw new BadRequestException("INVALID_POLICY");
      if (
        draft.documentBody !== undefined &&
        (typeof draft.documentBody !== "string" ||
          draft.documentBody.length > 20000)
      )
        throw new BadRequestException("CONTRACT_TEMPLATE_INVALID");
      if (
        partial &&
        provided(draft.supplierId) &&
        !options.suppliers.some((supplier) => supplier.id === draft.supplierId)
      )
        throw new BadRequestException("INVALID_SUPPLIER");
      const selected = templateSnapshot(ctx, draft);
      const problems = draftProblems({
        ...draft,
        graceDays: typeof draft.graceDays === "number" ? draft.graceDays : NaN,
      });
      if (!partial && Object.keys(problems).length)
        throw new BadRequestException(Object.values(problems)[0]);
      const signers = validateDraftSigners(
        ctx,
        partial
          ? {
              ...draft,
              signers: Array.isArray(draft.signers)
                ? draft.signers.filter(
                    (signer) => signer && provided(signer.userId),
                  )
                : [],
            }
          : draft,
        { partial },
      );
      // Only complete, valid fields reach the document; the engine never sees unvalidated values.
      const shown = <K extends keyof ContractDraft>(key: K) =>
        partial && problems[key] ? SAMPLE_PLACEHOLDER : draft[key];
      const validPeriod = !problems.startDate && !problems.endDate;
      return {
        ...(partial ? { partial } : {}),
        documentBody: draft.documentBody ?? selected?.documentBody ?? "",
        language: body.language ?? "vi",
        title: shown("title"),
        code: draft.code,
        buyer: ctx.partyName(ctx.actor.organizationId),
        supplier: provided(draft.supplierId)
          ? ctx.partyName(draft.supplierId)
          : SAMPLE_PLACEHOLDER,
        // Legal identity of each party, when the organisation record has it.
        parties: {
          BUYER: {
            taxCode: ctx.organizationTaxCode(ctx.actor.organizationId),
            address: ctx.organizationAddress(ctx.actor.organizationId),
          },
          SUPPLIER: provided(draft.supplierId)
            ? {
                taxCode: ctx.organizationTaxCode(String(draft.supplierId)),
                address: ctx.organizationAddress(String(draft.supplierId)),
              }
            : { taxCode: null, address: null },
        },
        valueMillion: shown("valueMillion"),
        startDate: shown("startDate"),
        endDate: shown("endDate"),
        graceDays: shown("graceDays"),
        penaltyRatePct: shown("penaltyRatePct"),
        maxPenaltyPct: shown("maxPenaltyPct"),
        approvalPolicy: draft.approvalPolicy,
        signers: signers.map((signer) => ({
          party: signer.party,
          name: String(ctx.user(signer.userId)!.displayName),
        })),
        stages: options.types.includes(draft.type)
          ? scheduled(
              stagesOf(
                ctx,
                draft.type,
                // The draft's own pinned version, or the one a new draft would pin.
                (ctx.draft(draft.code)?.ruleVersionId as string | undefined) ??
                  (ctx.t["rule-versions"] ?? []).find(
                    (row) => row.status === "PUBLISHED",
                  )?.id,
                draft.workflowTemplate,
              ),
              validPeriod ? draft : null,
              shown("valueMillion") === SAMPLE_PLACEHOLDER
                ? null
                : String(draft.valueMillion),
              // A person's corrections apply while the type and workflow are the saved ones.
              ctx.draft(draft.code)?.contractType === draft.type &&
                (ctx.draft(draft.code)?.workflowTemplate ?? "") ===
                  (draft.workflowTemplate ??
                    ctx.draft(draft.code)?.workflowTemplate ??
                    "")
                ? (ctx.draft(draft.code)?.milestoneEdits?.milestones ?? null)
                : null,
            )
          : [],
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
