import { templatePresets, templateSnapshot } from "./contract-templates";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { RecordEntity } from "../common/types";
import { outcome, type Outcome } from "./actions";
import { today, type Ctx } from "./context";
import { entity, milestonesFor, nextId } from "./factory";
import {
  APPROVAL_ROLES_BY_POLICY,
  TABLE,
  type ContractRecord,
  type DraftRecord,
  type HistoryRecord,
  type SigningRecord,
  type StageTemplate,
} from "./records";
import { MAX_SIGNERS, previewPagesFor, assertSlots } from "./signing-layout";
import {
  addDays,
  daysBetween,
  fromCents,
  scheduleDueDates,
  shareOf,
  toCents,
} from "./templates";
import type {
  ApprovalPolicy,
  ContractDraft,
  ContractType,
  Digitization,
  DigitizedMilestone,
  MilestoneType,
  PersonOption,
  SourceClauseKind,
  UploadFormOptions,
} from "./types";
import { AUTHORITY, CONTRACT_TYPES, WORKFLOW_BY_TYPE } from "./vocabulary";
import { draftProblems, validIsoDate } from "../common/field-validation";
import { pinnedVersion, versionRuleSet } from "./rule-versions";

const POLICIES = Object.keys(APPROVAL_ROLES_BY_POLICY) as ApprovalPolicy[];
const BUYER_SIGNER_ROLES = [
  "CONTRACT_OWNER",
  "FINANCE_APPROVER",
  "SECONDARY_APPROVER",
  "LEGAL_REVIEWER",
];
const EDITORS = ["LEGAL_REVIEWER", "CONTRACT_OWNER"];

function assertEditor(ctx: Ctx) {
  if (!EDITORS.includes(ctx.actor.role) || ctx.side() !== "BUYER")
    throw new ForbiddenException("BUYER_EDITORS_ONLY");
}

/**
 * The workflow a draft of `type` uses: the organiser workflow of the type, or one of the pinned
 * version's own `APP_` workflows for that type (§6.3). Its code is also its rule set.
 */
export function workflowFor(
  ctx: Ctx,
  type: ContractType,
  versionId?: string,
  requested?: string,
): { template: string; ruleSetId: string; name: string | null } {
  const organiser = WORKFLOW_BY_TYPE[type];
  if (!requested || requested === organiser.template)
    return { ...organiser, name: null };
  const version = versionId ? pinnedVersion(ctx.t, versionId) : undefined;
  const stage = (
    (version?.templates ?? []) as Array<Record<string, unknown>>
  ).find(
    (row) =>
      row.workflowTemplate === requested &&
      String(requested).startsWith("APP_") &&
      row.contractType === type,
  );
  if (!stage) throw new BadRequestException("INVALID_WORKFLOW");
  return {
    template: requested,
    ruleSetId: requested,
    name: String(stage.workflowName),
  };
}

/** Workflow stages, read from the pinned version or the Milestone templates table (Data Pack). */
export function stagesOf(
  ctx: Ctx,
  type: ContractType,
  versionId?: string,
  workflowTemplate?: string,
): StageTemplate[] {
  const template = workflowFor(ctx, type, versionId, workflowTemplate).template;
  const version = versionId ? pinnedVersion(ctx.t, versionId) : undefined;
  return (
    (version?.templates ?? ctx.t["milestone-templates"] ?? []) as RecordEntity[]
  )
    .filter((row) => row.workflowTemplate === template)
    .map((row) => ({
      sequence: Number(row.sequence),
      type: String(row.milestoneType),
      name: String(row.name),
      paymentPercent: String(row.paymentPercent),
      eventTypes: String(row.requiredEvents).split(
        ";",
      ) as StageTemplate["eventTypes"],
      latePenalty: row.latePenalty === true,
      offsetDays: Number(row.offsetDays),
      approval:
        row.approval === "NONE" ? ("NONE" as const) : ("CONTRACT" as const),
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

/** The version a new draft would pin, if any: the published one (a broken one pins none here). */
function publishedVersion(ctx: Ctx) {
  try {
    return pinnedVersion(ctx.t);
  } catch {
    return undefined;
  }
}

const person = (ctx: Ctx, user: RecordEntity): PersonOption => ({
  userId: user.id,
  name: String(user.displayName),
  title: String(user.title ?? ""),
  role: user.role as PersonOption["role"],
  organizationId: String(user.organizationId),
  organizationName: ctx.partyName(String(user.organizationId)),
});

export function uploadFormOptions(ctx: Ctx): UploadFormOptions {
  assertEditor(ctx);
  const buyer = ctx.actor.organizationId;
  const users = ctx.users().filter((u) => u.active !== false);
  const suppliers = ctx.t[TABLE.parties].filter(
    (p) => p.party_type === "SUPPLIER",
  );
  const buyerSigners = users
    .filter(
      (u) =>
        u.organizationId === buyer &&
        BUYER_SIGNER_ROLES.includes(String(u.role)),
    )
    .map((u) => person(ctx, u));
  const supplierSigners: Record<string, PersonOption[]> = {};
  for (const s of suppliers)
    supplierSigners[String(s.party_id)] = users
      .filter((u) => u.organizationId === s.party_id && u.role === "SUPPLIER")
      .map((u) => person(ctx, u));
  // The version a new draft pins decides the stages shown here, not the Data Pack table.
  const version = publishedVersion(ctx);
  const appStages = ((version?.templates ?? []) as RecordEntity[]).filter(
    (row) => String(row.workflowTemplate).startsWith("APP_"),
  );
  const workflows = Object.fromEntries(
    CONTRACT_TYPES.map((type) => [
      type,
      {
        template: WORKFLOW_BY_TYPE[type].template,
        stages: stagesOf(ctx, type, version?.id).map(
          (s) => s.type as MilestoneType,
        ),
        alternatives: [
          ...new Set(
            appStages
              .filter((row) => row.contractType === type)
              .map((row) => String(row.workflowTemplate)),
          ),
        ].map((template) => ({
          template,
          name: String(
            appStages.find((row) => row.workflowTemplate === template)
              ?.workflowName,
          ),
          stages: stagesOf(ctx, type, version?.id, template).map(
            (s) => s.type as MilestoneType,
          ),
        })),
      },
    ]),
  ) as UploadFormOptions["workflows"];
  return {
    types: CONTRACT_TYPES,
    policies: POLICIES,
    suppliers: suppliers.map((s) => ({
      id: String(s.party_id),
      name: String(s.party_name),
    })),
    reviewers: buyerSigners.filter((p) => p.role === "LEGAL_REVIEWER"),
    buyerSigners,
    supplierSigners,
    presets: templatePresets(ctx, buyerSigners),
    workflows,
  };
}

const toDraft = (d: DraftRecord): ContractDraft => ({
  templateId: d.templateId,
  templateVersion: d.templateSnapshot?.version,
  templateSnapshot: d.templateSnapshot,
  documentBody: d.documentBody,
  code: d.code,
  state: d.state,
  origin: d.origin,
  type: d.contractType,
  workflowTemplate: d.workflowTemplate,
  title: d.title,
  supplierId: d.supplierId,
  reviewerId: d.reviewerId,
  valueMillion: d.valueMillion,
  startDate: d.startDate,
  endDate: d.endDate,
  approvalPolicy: d.approvalPolicy,
  graceDays: d.graceDays,
  penaltyRatePct: d.penaltyRatePct,
  maxPenaltyPct: d.maxPenaltyPct,
  signers: d.signers,
  file: d.file,
  appendixNames: d.appendixNames,
  appendixDocuments: d.appendixDocuments,
  ruleVersion: d.ruleVersionId
    ? { id: String(d.ruleVersionId), hash: String(d.ruleVersionHash) }
    : undefined,
});

/** The organisation's open draft, or a new one with the next contract code (not saved yet). */
export function currentDraft(
  ctx: Ctx,
  code?: string,
  fresh = false,
): ContractDraft {
  assertEditor(ctx);
  const drafts = ctx
    .drafts()
    .filter((d) => d.organizationId === ctx.actor.organizationId);
  if (code) {
    const found = drafts.find((d) => d.code === code);
    if (!found) throw new NotFoundException("DRAFT_NOT_FOUND");
    return toDraft(found);
  }
  const open = drafts
    .filter((d) => d.state === "DRAFT")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (open && !fresh) return toDraft(open);
  const options = uploadFormOptions(ctx);
  const supplier = options.suppliers[0];
  const owner = options.buyerSigners.find((p) => p.role === "CONTRACT_OWNER");
  const representative = options.supplierSigners[supplier.id]?.[0];
  return {
    code: nextId(
      "CT",
      ctx.contracts.map((c) => c.contract_id),
    ),
    state: "DRAFT",
    origin: "APP",
    type: "GOODS_SUPPLY",
    title: "",
    supplierId: supplier.id,
    reviewerId: options.reviewers[0]?.userId ?? "",
    valueMillion: "1000.00",
    startDate: addDays(today(), 14),
    endDate: addDays(today(), 194),
    approvalPolicy: "SINGLE_BUYER_APPROVAL",
    graceDays: 5,
    penaltyRatePct: "0.10",
    maxPenaltyPct: "8.00",
    signers: [
      ...(owner ? [{ party: "BUYER" as const, userId: owner.userId }] : []),
      ...(representative
        ? [{ party: "SUPPLIER" as const, userId: representative.userId }]
        : []),
    ],
    file: { name: "", sizeBytes: 0, kind: "PDF" },
    appendixNames: [],
  };
}

const decimal = (value: unknown, max: number) => {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const normalized = fromCents(toCents(text));
  return toCents(normalized) > toCents(String(max)) ? null : normalized;
};
const isoDate = (value: unknown) => (validIsoDate(value) ? value : null);

/**
 * Shared by draft saving and document generation; never trust client signer names or parties.
 * `partial` serves live previews of an unfinished draft: the supplier may be unset, signer count
 * and both-sides rules are not enforced, but every provided signer is still checked for this actor.
 */
export function validateDraftSigners(
  ctx: Ctx,
  input: ContractDraft,
  options: { partial?: boolean } = {},
) {
  const partial = options.partial === true;
  const buyer = ctx.actor.organizationId;
  const supplier = ctx.party(String(input.supplierId));
  if ((!partial || input.supplierId) && supplier?.party_type !== "SUPPLIER")
    throw new BadRequestException("INVALID_SUPPLIER");
  const signers = Array.isArray(input.signers) ? input.signers : [];
  if (signers.length > MAX_SIGNERS || (!partial && signers.length < 1))
    throw new BadRequestException("SIGNER_COUNT");
  const seen = new Set<string>();
  for (const signer of signers) {
    if (
      !signer ||
      typeof signer.userId !== "string" ||
      !["BUYER", "SUPPLIER"].includes(signer.party)
    )
      throw new BadRequestException("INVALID_SIGNER");
    const user = ctx.user(String(signer.userId));
    const ok =
      user &&
      user.active !== false &&
      !seen.has(user.id) &&
      (signer.party === "BUYER"
        ? user.organizationId === buyer &&
          BUYER_SIGNER_ROLES.includes(String(user.role))
        : signer.party === "SUPPLIER" &&
          supplier?.party_type === "SUPPLIER" &&
          user.organizationId === supplier.party_id &&
          user.role === "SUPPLIER");
    if (!ok) throw new BadRequestException("INVALID_SIGNER");
    seen.add(user.id);
  }
  if (
    !partial &&
    signers.length > 1 &&
    (!signers.some((s) => s.party === "BUYER") ||
      !signers.some((s) => s.party === "SUPPLIER"))
  )
    throw new BadRequestException("SIGNERS_BOTH_SIDES");
  return signers;
}

/** Validates and stores step 1 of the upload wizard: draft, contract row and signing order. */
export function saveDraft(
  ctx: Ctx,
  input: ContractDraft,
): Outcome<ContractDraft> {
  assertEditor(ctx);
  const problems = draftProblems(input ?? ({} as ContractDraft));
  if (Object.keys(problems).length)
    throw new BadRequestException(Object.values(problems)[0]);
  const buyer = ctx.actor.organizationId;
  const existing = ctx.contracts.find((c) => c.contract_id === input?.code);
  if (
    existing &&
    (existing.buyer_id !== buyer || existing.lifecycle !== "DRAFT")
  )
    throw new BadRequestException("DRAFT_LOCKED");
  const expectedCode = existing
    ? existing.contract_id
    : nextId(
        "CT",
        ctx.contracts.map((c) => c.contract_id),
      );
  if (input?.code !== expectedCode)
    throw new BadRequestException("INVALID_CODE");
  const title = String(input.title ?? "")
    .trim()
    .slice(0, 250);
  const value = decimal(input.valueMillion, 1_000_000);
  const start = isoDate(input.startDate);
  const end = isoDate(input.endDate);
  const rate = decimal(input.penaltyRatePct, 5);
  const cap = decimal(input.maxPenaltyPct, 100);
  const grace = Number(input.graceDays);
  if (!title) throw new BadRequestException("TITLE_REQUIRED");
  if (!CONTRACT_TYPES.includes(input.type))
    throw new BadRequestException("INVALID_TYPE");
  if (!POLICIES.includes(input.approvalPolicy))
    throw new BadRequestException("INVALID_POLICY");
  if (!value || toCents(value) <= 0n)
    throw new BadRequestException("INVALID_VALUE");
  if (!start || !end || start >= end)
    throw new BadRequestException("INVALID_DATES");
  if (!rate || !cap || !Number.isInteger(grace) || grace < 0 || grace > 60)
    throw new BadRequestException("INVALID_PENALTY");
  const supplier = ctx.party(String(input.supplierId))!;
  const signers = validateDraftSigners(ctx, input);
  const reviewer = ctx.user(String(input.reviewerId));
  if (
    !reviewer ||
    reviewer.active === false ||
    reviewer.organizationId !== buyer ||
    reviewer.role !== "LEGAL_REVIEWER"
  )
    throw new BadRequestException("INVALID_REVIEWER");
  const file = input.file;
  if (
    !file ||
    typeof file.name !== "string" ||
    !file.name ||
    !["PDF", "DOCX"].includes(file.kind)
  )
    throw new BadRequestException("FILE_REQUIRED");

  const version = pinnedVersion(
    ctx.t,
    existing?.ruleVersionId as string | undefined,
  );
  const workflow = workflowFor(
    ctx,
    input.type,
    version?.id,
    input.workflowTemplate,
  );
  const roles = APPROVAL_ROLES_BY_POLICY[input.approvalPolicy];
  const fields = {
    contract_id: expectedCode,
    contract_title: title,
    contract_type: input.type,
    buyer_id: buyer,
    supplier_id: supplier.party_id,
    contract_value_vnd_mn: value,
    currency: "VND",
    signing_date: "",
    start_date: start,
    end_date: end,
    workflow_template: workflow.template,
    rule_set_id: version
      ? versionRuleSet(workflow.ruleSetId, version.id)
      : workflow.ruleSetId,
    ruleVersionId: version?.id,
    ruleVersionHash: version?.hash,
    approval_policy: input.approvalPolicy,
    approval_quorum: String(roles.length),
    auto_release_allowed: roles.length ? "FALSE" : "TRUE",
    grace_period_days: String(grace),
    penalty_rate_pct_per_day: rate,
    max_penalty_pct: cap,
    initial_contract_status: "DRAFT",
    data_is_synthetic: "TRUE",
  };
  if (existing)
    Object.assign(existing, fields, {
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    });
  else
    ctx.contracts.push(
      entity(expectedCode, {
        ...fields,
        origin: "APP" as const,
        lifecycle: "DRAFT" as const,
      }) as ContractRecord,
    );

  if (
    input.documentBody !== undefined &&
    (typeof input.documentBody !== "string" ||
      input.documentBody.length > 20000)
  )
    throw new BadRequestException("CONTRACT_TEMPLATE_INVALID");
  const selectedTemplate = templateSnapshot(ctx, input);
  const draftFields = {
    templateId: selectedTemplate?.id,
    templateVersion: selectedTemplate?.version,
    templateSnapshot: selectedTemplate,
    documentBody: input.documentBody ?? selectedTemplate?.documentBody ?? "",
    ruleVersionId: version?.id,
    ruleVersionHash: version?.hash,
    code: expectedCode,
    title,
    supplierId: supplier.party_id,
    contractType: input.type,
    workflowTemplate: workflow.template,
    state: "DRAFT" as const,
    reviewerId: reviewer.id,
    valueMillion: value,
    startDate: start,
    endDate: end,
    approvalPolicy: input.approvalPolicy,
    graceDays: grace,
    penaltyRatePct: rate,
    maxPenaltyPct: cap,
    signers: signers.map((s) => ({ party: s.party, userId: String(s.userId) })),
    file: {
      name: file.name.slice(0, 255),
      sizeBytes: Number(file.sizeBytes) || 0,
      kind: file.kind,
      pages:
        ctx.draft(expectedCode)?.file.documentId &&
        ctx.draft(expectedCode)?.file.name === file.name
          ? ctx.draft(expectedCode)?.file.pages
          : file.pages,
      documentId:
        ctx.draft(expectedCode)?.file.name === file.name
          ? ctx.draft(expectedCode)?.file.documentId
          : undefined,
      sha256:
        ctx.draft(expectedCode)?.file.name === file.name
          ? ctx.draft(expectedCode)?.file.sha256
          : undefined,
    },
    appendixDocuments: ctx
      .draft(expectedCode)
      ?.appendixDocuments?.filter((document) =>
        input.appendixNames?.includes(document.name),
      ),
    appendixNames: (input.appendixNames ?? [])
      .map((name) => String(name).slice(0, 255))
      .slice(0, 20),
    digitization: null,
    organizationId: buyer,
  };
  const drafts = ctx.t[TABLE.drafts] as DraftRecord[];
  const draft = drafts.find((d) => d.code === expectedCode);
  // A row added through the generic CRUD under this code is taken over by the workflow.
  if (draft)
    Object.assign(draft, draftFields, {
      origin: draft.origin ?? "APP",
      version: draft.version + 1,
      updatedAt: new Date().toISOString(),
    });
  else
    drafts.push(
      entity(`draft-${expectedCode}`, {
        ...draftFields,
        origin: "APP" as const,
      }) as DraftRecord,
    );

  // The signing order is set now so signature positions can be placed before digitisation.
  const steps = signers.map((s, i) => {
    const user = ctx.user(String(s.userId))!;
    return {
      stepNo: i + 1,
      party: s.party,
      signerUserId: user.id,
      signerName: String(user.displayName),
      signerTitle: String(user.title ?? ""),
      signerRole: user.role as SigningRecord["steps"][number]["signerRole"],
      organizationId: String(user.organizationId),
      isFinal: i === signers.length - 1,
      status: "WAITING" as const,
      signedAt: null,
      method: null,
    };
  });
  const signingTable = ctx.t[TABLE.signing] as SigningRecord[];
  const signing = signingTable.find((s) => s.contractCode === expectedCode);
  if (signing) {
    if (signing.steps.length !== steps.length) {
      signing.slots = Object.fromEntries(
        steps.map((step) => [step.stepNo, null]),
      );
      if (!signing.layoutDocumentId)
        signing.previewPages = previewPagesFor(steps.length);
    }
    Object.assign(signing, {
      steps,
      fileName: draftFields.file.name,
      pageCount: file.pages ?? signing.pageCount,
      version: signing.version + 1,
    });
  } else
    signingTable.push(
      entity(expectedCode, {
        contractCode: expectedCode,
        fileName: draftFields.file.name,
        pageCount: file.pages ?? 14,
        digitalSignatureRequired: true,
        steps,
        slots: Object.fromEntries(steps.map((step) => [step.stepNo, null])),
        previewPages: previewPagesFor(steps.length),
        origin: "APP" as const,
        organizationId: buyer,
      }) as SigningRecord,
    );
  return outcome(ctx, currentDraft(ctx, expectedCode));
}

const CLAUSE_OF: Record<string, SourceClauseKind | null> = {
  SIGNING: "TOTAL_VALUE",
  KICKOFF: "TOTAL_VALUE",
  ACTIVATION: "TOTAL_VALUE",
  DELIVERY: "DELIVERY",
  INTERIM_DELIVERY: "DELIVERY",
  REQUIREMENTS_APPROVAL: "DELIVERY",
  SERVICE_COMPLETION: "DELIVERY",
  UAT_PASS: "DELIVERY",
  ACCEPTANCE: "LATE_PENALTY",
  FINAL_ACCEPTANCE: "LATE_PENALTY",
  GO_LIVE_ACCEPTANCE: "LATE_PENALTY",
  WARRANTY: null,
  WARRANTY_CLOSE: null,
};

/**
 * The articles of the system's contract template (apps/engine/templates/sample-*.json): 3 value,
 * 4 schedule and milestones, 6 approvals, 8 late penalty. A page and quote are given only when
 * the reviewed extraction of the uploaded file found the value there; nothing is made up.
 */
function sourceClauses(
  ctx: Ctx,
  code: string,
  draft: DraftRecord,
): Digitization["clauses"] {
  const proposal = [...(ctx.t["extraction-proposals"] ?? [])]
    .reverse()
    .find(
      (row) =>
        row.contractCode === code &&
        row.confirmedBy &&
        row.documentSha256 === draft.file.sha256,
    ) as
    | {
        fields?: {
          path: string;
          evidence: { page: number; quote: string } | null;
        }[];
      }
    | undefined;
  const found = (path: string) =>
    proposal?.fields?.find((field) => field.path === path)?.evidence ?? null;
  const clause = (
    kind: SourceClauseKind,
    article: number,
    path?: string,
  ): Digitization["clauses"][number] => {
    const evidence = path ? found(path) : null;
    return {
      kind,
      article,
      page: evidence?.page ?? null,
      quote: evidence?.quote ?? null,
    };
  };
  return [
    clause("TOTAL_VALUE", 3, "valueMillion"),
    clause("DELIVERY", 4),
    clause("APPROVALS", 6),
    clause("LATE_PENALTY", 8, "penaltyRatePct"),
  ];
}

/**
 * Simulated extraction of the contract terms: milestones are cut from the workflow of the
 * contract type; the warranty term is relative in the text, so its date needs confirmation.
 */
export function digitization(ctx: Ctx, code: string): Digitization {
  const contract = ctx.contract(code);
  const draft = ctx.draft(code);
  if (!draft) throw new NotFoundException("DRAFT_NOT_FOUND");
  if (draft.digitization) return draft.digitization;
  const stages = stagesOf(
    ctx,
    draft.contractType,
    draft.ruleVersionId as string | undefined,
    draft.workflowTemplate,
  );
  const schedule = scheduleDueDates(draft.startDate, draft.endDate, stages);
  let allocated = 0n;
  const milestones: DigitizedMilestone[] = stages.map((stage, i) => {
    const last = i === stages.length - 1;
    const previous = i ? schedule[stages[i - 1].sequence] : draft.startDate;
    const value = last
      ? fromCents(toCents(draft.valueMillion) - allocated)
      : shareOf(draft.valueMillion, stage.paymentPercent);
    allocated += toCents(value);
    const warranty = stage.type.startsWith("WARRANTY");
    return {
      sequence: stage.sequence,
      type: stage.type as MilestoneType,
      valueMillion: value,
      paymentPercent: stage.paymentPercent,
      dueDate: warranty ? null : schedule[stage.sequence],
      eventTypes: stage.eventTypes,
      documents: stage.eventTypes.map((eventType) => ({
        eventType,
        side: AUTHORITY[eventType],
      })),
      approvalRoles:
        stage.approval === "NONE"
          ? []
          : APPROVAL_ROLES_BY_POLICY[draft.approvalPolicy],
      penalty: stage.latePenalty
        ? {
            ratePct: draft.penaltyRatePct,
            capPct: draft.maxPenaltyPct,
            graceDays: draft.graceDays,
          }
        : null,
      source: warranty ? "NEEDS_CONFIRMATION" : "MATCH",
      sourceClause: CLAUSE_OF[stage.type] ?? null,
      // The text states the warranty as a term after the previous stage, not as a date.
      relativeTermMonths: warranty
        ? Math.max(
            1,
            Math.round(daysBetween(previous, schedule[stage.sequence]) / 30),
          )
        : null,
    };
  });
  const warrantyStage = stages.find((s) => s.type.startsWith("WARRANTY"));
  return {
    contractCode: code,
    contractValueMillion: contract.contract_value_vnd_mn,
    clauses: sourceClauses(ctx, code, draft),
    milestones,
    approvers: APPROVAL_ROLES_BY_POLICY[draft.approvalPolicy],
    requiredApprovals: APPROVAL_ROLES_BY_POLICY[draft.approvalPolicy].length,
    suggestedDueDate: warrantyStage ? schedule[warrantyStage.sequence] : null,
    locked: draft.state !== "DRAFT",
  };
}

/**
 * Locks the digitised terms: the milestones are created, the first signer's turn starts and the
 * engine evaluates the new milestones like any other. A missing due date is kept as a structural
 * gap, so the engine holds that milestone under rule 80 (BR-15) until a new version fixes it.
 */
export function confirmDigitization(
  ctx: Ctx,
  code: string,
  input: { dueDate: string | null },
): Outcome<Digitization> {
  assertEditor(ctx);
  const contract = ctx.contract(code);
  const draft = ctx.draft(code);
  if (!draft || contract.lifecycle !== "DRAFT" || draft.state !== "DRAFT")
    throw new BadRequestException("DRAFT_LOCKED");
  if (
    draft.origin === "APP" &&
    (!draft.file.documentId ||
      draft.appendixNames.some(
        (name) =>
          !draft.appendixDocuments?.some((document) => document.name === name),
      ))
  )
    throw new BadRequestException("DOCUMENT_REQUIRED");
  if (
    draft.file.documentId &&
    !ctx.t["extraction-proposals"].some(
      (proposal) =>
        proposal.contractCode === code &&
        proposal.documentSha256 === draft.file.sha256 &&
        proposal.confirmedDraftVersion === draft.version &&
        proposal.confirmedBy,
    )
  )
    throw new BadRequestException("EXTRACTION_REVIEW_REQUIRED");
  const layout = ctx.signing(code);
  if (layout?.layoutDocumentId) {
    if (
      layout.layoutDocumentSha256 !== draft.file.sha256 ||
      layout.layoutDocumentId !== draft.file.documentId
    )
      throw new BadRequestException("DOCUMENT_CHANGED");
    assertSlots(
      layout.slots,
      layout.previewPages,
      layout.steps.length,
      true,
      layout.steps,
    );
  }
  const result = digitization(ctx, code);
  // The whole value must be a date; trailing text is refused rather than cut off.
  const dueDate = input?.dueDate ? isoDate(String(input.dueDate)) : null;
  if (input?.dueDate && !dueDate)
    throw new BadRequestException("INVALID_DATES");
  result.milestones.forEach((m, i) => {
    if (m.source !== "NEEDS_CONFIRMATION") return;
    // Stages stay in order inside the contract period: not before the previous stage's due date,
    // not after the next one's or the end date.
    const before = result.milestones
      .slice(0, i)
      .map((other) => other.dueDate)
      .filter((date): date is string => !!date);
    const after = result.milestones
      .slice(i + 1)
      .map((other) => other.dueDate)
      .filter((date): date is string => !!date);
    const earliest = before.at(-1) ?? draft.startDate;
    const latest = after[0] ?? draft.endDate;
    if (dueDate && (dueDate < earliest || dueDate > latest))
      throw new BadRequestException("DUE_DATE_OUT_OF_RANGE");
    m.dueDate = dueDate;
    m.source = "CONFIRMED";
  });
  result.locked = true;
  // Ids of milestones removed with a cancelled signing sequence live on in the status history,
  // so they are never handed out again.
  const usedIds = [
    ...ctx.milestones.map((m) => m.milestone_id),
    ...(ctx.t[TABLE.history] as HistoryRecord[]).map((h) => h.milestoneId),
  ];
  const first =
    Math.max(0, ...usedIds.map((id) => Number(id.replace(/\D/g, "")) || 0)) + 1;
  const created = milestonesFor(
    contract,
    stagesOf(
      ctx,
      draft.contractType,
      draft.ruleVersionId as string | undefined,
      draft.workflowTemplate,
    ),
    first,
    Object.fromEntries(
      result.milestones.map((m) => [m.sequence, m.dueDate ?? ""]),
    ),
  );
  ctx.milestones.push(...created);
  contract.lifecycle = "SIGNING";
  contract.version += 1;
  Object.assign(draft, {
    state: "SIGNING",
    digitization: result,
    version: draft.version + 1,
  });
  const signing = ctx.signing(code);
  if (!signing) throw new NotFoundException("SIGNING_NOT_FOUND");
  signing.steps.forEach(
    (step, i) => (step.status = i === 0 ? "CURRENT" : "WAITING"),
  );
  signing.version += 1;
  return outcome(ctx, result, {
    evaluate: true,
    trigger: { kind: "CONTRACT", actorName: ctx.actor.displayName },
    audit: [
      {
        category: "SYSTEM",
        contractId: code,
        milestoneId: null,
        detail: {
          kind: "DIGITIZATION_CONFIRMED",
          milestoneCount: created.length,
        },
      },
    ],
  });
}
