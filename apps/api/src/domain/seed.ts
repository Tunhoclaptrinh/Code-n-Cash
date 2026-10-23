import type { RecordEntity } from "../common/types";
import { buildDirectory, type AccountSpec } from "./accounts";
import { loadDataPack, type DataPack } from "./datapack";
import { entity, eventRecord, milestonesFor } from "./factory";
import {
  APPROVAL_ROLES_BY_POLICY,
  TABLE,
  type ContractRecord,
  type DraftRecord,
  type EventRecord,
  type MilestoneRecord,
  type PartyRecord,
  type ProfileRecord,
  type SigningRecord,
  type StageTemplate,
  type Tables,
} from "./records";
import { defaultSlots, previewPagesFor } from "./signing-layout";
import { deriveStages, stagesFor } from "./templates";
import type {
  ContractType,
  EventStatus,
  EventType,
  SignMethod,
  SignStep,
  WorkflowTemplate,
} from "./types";
import { INTERNAL_ROLES, WORKFLOW_BY_TYPE } from "./vocabulary";

/** Buyer and supplier of the demo screens: Nova An (B010) and Phú Minh (S015) are Data Pack parties. */
export const DEMO_BUYER = "B010";
export const DEMO_SUPPLIER = "S015";

export interface SeedResult {
  tables: Tables;
  accounts: AccountSpec[];
  organizations: RecordEntity[];
  templates: RecordEntity[];
  settings: RecordEntity[];
}

const SIGNERS_BY_POLICY: Record<
  string,
  Array<
    "SUPPLIER" | "FINANCE_APPROVER" | "SECONDARY_APPROVER" | "CONTRACT_OWNER"
  >
> = {
  AUTO_IF_ALL_CONDITIONS: ["SUPPLIER", "CONTRACT_OWNER"],
  SINGLE_BUYER_APPROVAL: ["SUPPLIER", "CONTRACT_OWNER"],
  FINANCE_PLUS_OWNER: ["SUPPLIER", "FINANCE_APPROVER", "CONTRACT_OWNER"],
  DUAL_APPROVAL: ["SUPPLIER", "SECONDARY_APPROVER", "CONTRACT_OWNER"],
};

const METHOD: Record<string, SignMethod> = {
  SUPPLIER: "VIETTEL_MYSIGN",
  CONTRACT_OWNER: "VNPT_SMARTCA",
  FINANCE_APPROVER: "USB_TOKEN",
  SECONDARY_APPROVER: "USB_TOKEN",
};

function minusMinutes(at: string, minutes: number) {
  const date = new Date(`${at}Z`);
  date.setUTCMinutes(date.getUTCMinutes() - minutes);
  return date.toISOString().slice(0, 19);
}

/**
 * Builds the first state of the workflow database: the Data Pack tables as they are, the people
 * and signing details the Data Pack does not have (origin SEED), and four demo contracts that
 * cover the steps the Data Pack history has already passed (upload, signing, live approvals).
 */
export async function buildSeed(pack?: DataPack): Promise<SeedResult> {
  const data = pack ?? (await loadDataPack());
  const wrap = <T extends Record<string, string>>(id: string, row: T) =>
    entity(id, { ...row, origin: "DATA_PACK" as const });
  const parties = data.parties.map((p) => wrap(p.party_id, p)) as PartyRecord[];
  const contracts = data.contracts.map((c) =>
    entity(c.contract_id, {
      ...c,
      origin: "DATA_PACK" as const,
      lifecycle: "ACTIVE" as const,
    }),
  ) as ContractRecord[];
  const milestones = data.milestones.map((m) =>
    wrap(m.milestone_id, m),
  ) as MilestoneRecord[];
  const events = data.events.map((e) => wrap(e.event_id, e)) as EventRecord[];
  const rules = data.payment_rules.map((r) => wrap(r.rule_id, r));
  const stages = deriveStages(data.contracts, data.milestones);
  const { organizations, accounts } = buildDirectory(data.parties);
  const party = (id: string) => parties.find((p) => p.party_id === id)!;
  const approverOf = (buyerId: string, role: string) =>
    parties.find(
      (p) =>
        p.party_type === "APPROVER" &&
        p.parent_party_id === buyerId &&
        p.approval_role === role,
    )!;
  const accountOf = (partyId: string) =>
    accounts.find((a) => a.partyId === partyId && a.role !== "LEGAL_REVIEWER")!;
  const orgName = (id: string) =>
    organizations.find((o) => o.id === id)?.name ?? id;

  const signingStep = (
    contract: ContractRecord,
    who: string,
    stepNo: number,
    total: number,
    signedAt: string | null,
    status: SignStep["status"],
  ): SignStep => {
    const account =
      who === "SUPPLIER"
        ? accountOf(contract.supplier_id)
        : accountOf(approverOf(contract.buyer_id, who).party_id);
    return {
      stepNo,
      party: who === "SUPPLIER" ? "SUPPLIER" : "BUYER",
      signerUserId: account.id,
      signerName: account.displayName,
      signerTitle: account.title,
      signerRole: account.role,
      organizationId: account.organizationId,
      isFinal: stepNo === total,
      status,
      signedAt,
      method: signedAt ? METHOD[who] : null,
    };
  };

  // Signing details of the Data Pack contracts are not in the Data Pack: the order depends on the
  // approval policy and the buyer signs last, at the time of its CONTRACT_SIGNED event.
  const signing: SigningRecord[] = [];
  for (const contract of contracts) {
    const signed = events.find(
      (e) =>
        e.contract_id === contract.contract_id &&
        e.event_type === "CONTRACT_SIGNED",
    );
    if (!signed) continue;
    const order =
      SIGNERS_BY_POLICY[contract.approval_policy] ??
      SIGNERS_BY_POLICY.SINGLE_BUYER_APPROVAL;
    signing.push(
      signingRecord(
        contract,
        order.map((who, i) =>
          signingStep(
            contract,
            who,
            i + 1,
            order.length,
            minusMinutes(signed.event_timestamp, (order.length - 1 - i) * 35),
            "SIGNED",
          ),
        ),
        "SEED",
      ),
    );
  }

  // Demo contracts between Nova An and Phú Minh, cut into milestones by the same workflows.
  const nextMilestone = { value: data.milestones.length + 1 };
  const demo = (
    id: string,
    type: ContractType,
    title: string,
    value: string,
    policy: string,
    dates: { signing: string; start: string; end: string },
    penalty: { grace: string; rate: string; cap: string },
    lifecycle: ContractRecord["lifecycle"],
  ) => {
    const workflow = WORKFLOW_BY_TYPE[type];
    const contract = entity(id, {
      contract_id: id,
      contract_title: title,
      contract_type: type,
      buyer_id: DEMO_BUYER,
      supplier_id: DEMO_SUPPLIER,
      contract_value_vnd_mn: value,
      currency: "VND",
      signing_date: dates.signing,
      start_date: dates.start,
      end_date: dates.end,
      workflow_template: workflow.template,
      rule_set_id: workflow.ruleSetId,
      approval_policy: policy,
      approval_quorum: String(APPROVAL_ROLES_BY_POLICY[policy].length),
      auto_release_allowed:
        policy === "AUTO_IF_ALL_CONDITIONS" ? "TRUE" : "FALSE",
      grace_period_days: penalty.grace,
      penalty_rate_pct_per_day: penalty.rate,
      max_penalty_pct: penalty.cap,
      initial_contract_status: lifecycle === "ACTIVE" ? "ACTIVE" : "DRAFT",
      data_is_synthetic: "TRUE",
      origin: "SEED" as const,
      lifecycle,
    }) as ContractRecord;
    contracts.push(contract);
    if (lifecycle === "DRAFT")
      return { contract, milestones: [] as MilestoneRecord[] };
    const created = milestonesFor(
      contract,
      stagesFor(stages, type),
      nextMilestone.value,
      {},
      "SEED",
    );
    nextMilestone.value += created.length;
    milestones.push(...created);
    return { contract, milestones: created };
  };

  let seq = 0;
  const seedEvent = (
    ms: MilestoneRecord,
    type: EventType,
    status: EventStatus,
    actorId: string,
    at: string,
    document: string,
    opts: { amount?: string; note?: string; by?: string } = {},
  ) => {
    seq += 1;
    const contractEvents = events.filter(
      (e) => e.contract_id === ms.contract_id,
    ).length;
    const account = opts.by
      ? accounts.find((a) => a.id === opts.by)
      : accounts.find((a) => a.partyId === actorId);
    const record = eventRecord({
      id: `SD-EV${String(seq).padStart(4, "0")}`,
      milestone: ms,
      type,
      status,
      actor: party(actorId),
      at,
      sequence: contractEvents + 1,
      documentId: document,
      amount: opts.amount,
      note: opts.note ?? "Demo seed event.",
      origin: "SEED",
      recordedBy: account?.displayName ?? null,
      recordedByUserId: account?.id ?? null,
    });
    events.push(record);
    return record;
  };

  // CT0101: uploaded, not digitised yet (the upload wizard continues from here).
  const ct0101 = demo(
    "CT0101",
    "GOODS_SUPPLY",
    "Mua sắm thiết bị phòng thực hành",
    "2400.00",
    "SINGLE_BUYER_APPROVAL",
    { signing: "", start: "2026-11-02", end: "2027-05-31" },
    { grace: "3", rate: "0.10", cap: "8.00" },
    "DRAFT",
  );

  // The draft already has its signing order: the owner signs first, the supplier last.
  signing.push(
    signingRecord(
      ct0101.contract,
      [
        signingStep(ct0101.contract, "CONTRACT_OWNER", 1, 2, null, "WAITING"),
        signingStep(ct0101.contract, "SUPPLIER", 2, 2, null, "WAITING"),
      ],
      "SEED",
    ),
  );

  // CT0102: three signers; the buyer's owner signed, the supplier is next, the secondary approver last.
  const ct0102 = demo(
    "CT0102",
    "SOFTWARE_IMPLEMENTATION",
    "Triển khai phần mềm quản lý đào tạo",
    "3200.00",
    "DUAL_APPROVAL",
    { signing: "", start: "2026-11-09", end: "2027-06-30" },
    { grace: "5", rate: "0.10", cap: "8.00" },
    "SIGNING",
  );
  signing.push(
    signingRecord(
      ct0102.contract,
      [
        signingStep(
          ct0102.contract,
          "CONTRACT_OWNER",
          1,
          3,
          "2026-10-20T09:15:00",
          "SIGNED",
        ),
        signingStep(ct0102.contract, "SUPPLIER", 2, 3, null, "CURRENT"),
        signingStep(
          ct0102.contract,
          "SECONDARY_APPROVER",
          3,
          3,
          null,
          "WAITING",
        ),
      ],
      "SEED",
    ),
  );

  // CT0103: signed; delivery came two days after the grace period and is waiting for finance.
  const ct0103 = demo(
    "CT0103",
    "GOODS_SUPPLY",
    "Cung cấp thiết bị mạng cho phòng lab",
    "1850.00",
    "FINANCE_PLUS_OWNER",
    { signing: "2026-08-26", start: "2026-08-28", end: "2027-01-31" },
    { grace: "2", rate: "0.15", cap: "8.00" },
    "ACTIVE",
  );
  {
    const [sign, delivery] = ct0103.milestones;
    const owner = approverOf(DEMO_BUYER, "CONTRACT_OWNER").party_id;
    const finance = approverOf(DEMO_BUYER, "FINANCE_APPROVER").party_id;
    seedEvent(
      sign,
      "CONTRACT_SIGNED",
      "CONFIRMED",
      DEMO_BUYER,
      "2026-08-26T10:00:00",
      "CTR-CT0103-01",
      { by: "u-owner" },
    );
    seedEvent(
      sign,
      "APPROVAL",
      "APPROVED",
      owner,
      "2026-08-27T09:00:00",
      `APR-CT0103-01-${owner}`,
      { amount: sign.planned_payment_vnd_mn },
    );
    seedEvent(
      sign,
      "APPROVAL",
      "APPROVED",
      finance,
      "2026-08-27T14:30:00",
      `APR-CT0103-01-${finance}`,
      { amount: sign.planned_payment_vnd_mn },
    );
    seedEvent(
      delivery,
      "DELIVERY",
      "CONFIRMED",
      DEMO_SUPPLIER,
      "2026-10-16T09:20:00",
      "DN-CT0103-02",
    );
    seedEvent(
      delivery,
      "INVOICE",
      "CONFIRMED",
      DEMO_SUPPLIER,
      "2026-10-16T15:10:00",
      "INV-CT0103-02",
      { amount: delivery.planned_payment_vnd_mn },
    );
    seedEvent(
      delivery,
      "APPROVAL",
      "APPROVED",
      owner,
      "2026-10-19T08:45:00",
      `APR-CT0103-02-${owner}`,
      { amount: delivery.planned_payment_vnd_mn },
    );
    signing.push(
      signingRecord(
        ct0103.contract,
        [
          signingStep(
            ct0103.contract,
            "SUPPLIER",
            1,
            3,
            "2026-08-26T09:10:00",
            "SIGNED",
          ),
          signingStep(
            ct0103.contract,
            "FINANCE_APPROVER",
            2,
            3,
            "2026-08-26T09:40:00",
            "SIGNED",
          ),
          signingStep(
            ct0103.contract,
            "CONTRACT_OWNER",
            3,
            3,
            "2026-08-26T10:00:00",
            "SIGNED",
          ),
        ],
        "SEED",
      ),
    );
  }

  // CT0104: maintenance; activation paid, service completion overdue with nothing submitted.
  const ct0104 = demo(
    "CT0104",
    "MAINTENANCE",
    "Bảo trì hạ tầng máy chủ năm 2026",
    "960.00",
    "SINGLE_BUYER_APPROVAL",
    { signing: "2026-04-12", start: "2026-04-15", end: "2026-12-31" },
    { grace: "7", rate: "0.10", cap: "8.00" },
    "ACTIVE",
  );
  {
    const [activation] = ct0104.milestones;
    const owner = approverOf(DEMO_BUYER, "CONTRACT_OWNER").party_id;
    seedEvent(
      activation,
      "CONTRACT_SIGNED",
      "CONFIRMED",
      DEMO_BUYER,
      "2026-04-12T10:30:00",
      "CTR-CT0104-01",
      { by: "u-supplier" },
    );
    seedEvent(
      activation,
      "SERVICE_ACTIVATED",
      "CONFIRMED",
      DEMO_SUPPLIER,
      "2026-04-24T09:00:00",
      "ACT-CT0104-01",
    );
    seedEvent(
      activation,
      "APPROVAL",
      "APPROVED",
      owner,
      "2026-04-27T10:00:00",
      `APR-CT0104-01-${owner}`,
      { amount: activation.planned_payment_vnd_mn },
    );
    signing.push(
      signingRecord(
        ct0104.contract,
        [
          signingStep(
            ct0104.contract,
            "CONTRACT_OWNER",
            1,
            2,
            "2026-04-12T10:05:00",
            "SIGNED",
          ),
          signingStep(
            ct0104.contract,
            "SUPPLIER",
            2,
            2,
            "2026-04-12T10:30:00",
            "SIGNED",
          ),
        ],
        "SEED",
      ),
    );
  }

  const legal = accounts.find((a) => a.id === "u-legal")!;
  const owner = accounts.find((a) => a.id === "u-owner")!;
  const supplier = accounts.find((a) => a.id === "u-supplier")!;
  const drafts: DraftRecord[] = [
    draftOf(
      ct0101.contract,
      "DRAFT",
      legal.id,
      [
        { party: "BUYER", userId: owner.id },
        { party: "SUPPLIER", userId: supplier.id },
      ],
      {
        name: "HopDong_ThietBi_PhongTH.pdf",
        sizeBytes: 1_887_437,
        kind: "PDF",
        pages: 14,
      },
    ),
    draftOf(
      ct0102.contract,
      "SIGNING",
      legal.id,
      signing
        .find((s) => s.contractCode === "CT0102")!
        .steps.map((s) => ({ party: s.party, userId: s.signerUserId })),
      {
        name: "HopDong_PhanMem_DaoTao.pdf",
        sizeBytes: 2_412_903,
        kind: "PDF",
        pages: 18,
      },
    ),
  ];

  const profiles: ProfileRecord[] = accounts
    .filter((a) => !INTERNAL_ROLES.includes(a.role))
    .map((a) =>
      entity(a.id, {
        lastMethod: a.role === "SUPPLIER" ? "VIETTEL_MYSIGN" : "VNPT_SMARTCA",
        certificates: {
          [a.role === "SUPPLIER" ? "VIETTEL_MYSIGN" : "VNPT_SMARTCA"]: {
            holder: a.displayName,
            expiryMonth: 12,
            expiryYear: 2027,
          },
        },
        organizationId: a.organizationId,
      }),
    ) as ProfileRecord[];

  const now = new Date().toISOString();
  const organizationRecords = organizations.map((o) =>
    entity(o.id, { ...o, organizationId: o.id, createdAt: now }),
  );
  return {
    tables: {
      [TABLE.parties]: parties,
      [TABLE.contracts]: contracts,
      [TABLE.milestones]: milestones,
      [TABLE.events]: events,
      [TABLE.rules]: rules,
      [TABLE.evaluations]: [],
      [TABLE.history]: [],
      [TABLE.runs]: [],
      [TABLE.signing]: signing,
      [TABLE.requests]: [],
      [TABLE.profiles]: profiles,
      [TABLE.drafts]: drafts.map((d) => ({ ...d, organizationId: DEMO_BUYER })),
      [TABLE.attachments]: [],
      [TABLE.notes]: [],
      [TABLE.exceptions]: [],
      [TABLE.payments]: [],
    },
    accounts,
    organizations: organizationRecords,
    templates: templateRecords(stages),
    settings: [
      ["SPEC_VERSION", "1.0", "DATA_PACK"],
      ["DATA_PACK_SNAPSHOT", "2026-10-18", "DATA_PACK"],
      ["EVALUATION_MODE", "offline_full_history", "SEED"],
      ["DEMO_BUYER", `${DEMO_BUYER} · ${orgName(DEMO_BUYER)}`, "SEED"],
      ["DEMO_SUPPLIER", `${DEMO_SUPPLIER} · ${orgName(DEMO_SUPPLIER)}`, "SEED"],
    ].map(([name, value, origin]) =>
      entity(`setting-${name.toLowerCase()}`, {
        name,
        value,
        origin,
        organizationId: "OPS",
      }),
    ),
  };
}

function signingRecord(
  contract: ContractRecord,
  steps: SignStep[],
  origin: SigningRecord["origin"],
): SigningRecord {
  return entity(contract.contract_id, {
    contractCode: contract.contract_id,
    fileName: `HopDong_${contract.contract_id}.pdf`,
    pageCount: 14,
    digitalSignatureRequired: true,
    steps,
    slots: defaultSlots(steps.length),
    previewPages: previewPagesFor(steps.length),
    origin,
    organizationId: contract.buyer_id,
  }) as SigningRecord;
}

function draftOf(
  contract: ContractRecord,
  state: DraftRecord["state"],
  reviewerId: string,
  signers: DraftRecord["signers"],
  file: DraftRecord["file"],
): DraftRecord {
  return entity(`draft-${contract.contract_id}`, {
    code: contract.contract_id,
    title: contract.contract_title,
    supplierId: contract.supplier_id,
    contractType: contract.contract_type as ContractType,
    state,
    origin: "SEED" as const,
    reviewerId,
    valueMillion: contract.contract_value_vnd_mn,
    startDate: contract.start_date,
    endDate: contract.end_date,
    approvalPolicy: contract.approval_policy as DraftRecord["approvalPolicy"],
    graceDays: Number(contract.grace_period_days),
    penaltyRatePct: contract.penalty_rate_pct_per_day,
    maxPenaltyPct: contract.max_penalty_pct,
    signers,
    file,
    appendixNames: [],
    digitization: null,
  }) as DraftRecord;
}

/** Workflow stages as rows of the Milestone templates resource. */
function templateRecords(stages: Record<WorkflowTemplate, StageTemplate[]>) {
  return Object.entries(stages).flatMap(([workflow, list]) =>
    list.map((stage) =>
      entity(`tpl-${workflow}-${stage.sequence}`, {
        name: stage.name,
        workflowTemplate: workflow,
        sequence: stage.sequence,
        milestoneType: stage.type,
        requiredEvents: stage.eventTypes.join(";"),
        paymentPercent: stage.paymentPercent,
        latePenalty: stage.latePenalty,
        offsetDays: stage.offsetDays,
        origin: "DATA_PACK",
        organizationId: "OPS",
      }),
    ),
  );
}
