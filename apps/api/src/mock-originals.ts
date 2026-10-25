import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonical } from "./common/audit-chain";
import { repoRoot } from "./common/paths";
import { previewPdf } from "./document-preview";
import type { Ctx } from "./domain/context";
import type { PdfPagePreview } from "./domain/types";
import { inspectPdf } from "./pdf-layout";
import { generateSampleDocx } from "./sample-documents";

/**
 * The organiser's contracts ship as data without a document. Each one gets a simulated original:
 * a Vietnamese contract rebuilt from its own terms, milestones and signers. The DOCX bytes are
 * deterministic, so a regenerated original keeps its SHA-256; the PDF rendering and page geometry
 * are cached next to it. Signatures stay bound to the terms snapshot they were made on.
 */
export const MOCK_ORIGINAL_ID = "original";

export interface MockOriginal {
  name: string;
  sha256: string;
  docx: Buffer;
}

export interface MockRendering extends MockOriginal {
  pdf: Buffer;
  pages: PdfPagePreview[];
}

const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** Changes whenever the generator or its wording changes, so stale cached files are not reused. */
const generatorVersion = (() => {
  let version: string | undefined;
  return () =>
    (version ??= hash(
      [
        "apps/engine/sample_contract.py",
        "apps/engine/pdf_geometry.py",
        "apps/engine/templates/sample-vi.json",
      ]
        .map((path) => readFileSync(resolve(repoRoot(), path), "utf8"))
        .join("\n"),
    ));
})();

/** Contracts that need a simulated original: any contract without an uploaded document. */
export function needsMockOriginal(ctx: Ctx, code: string) {
  ctx.contract(code);
  return !ctx.draft(code)?.file?.documentId;
}

/** Generator input for one contract, read inside the actor's scope. */
export function mockInput(ctx: Ctx, code: string) {
  const contract = ctx.contract(code);
  const draft = ctx.draft(code);
  const steps = ctx.signing(code)?.steps ?? [];
  const signers = steps.length
    ? steps.map((step) => ({ party: step.party, name: step.signerName }))
    : (draft?.signers ?? []).map((signer) => ({
        party: signer.party,
        name: String(ctx.user(signer.userId)?.displayName ?? ""),
      }));
  const fallback = [
    ["SUPPLIER", ctx.personOf(contract.supplier_id, "SUPPLIER")],
    [
      "BUYER",
      ctx
        .users()
        .find(
          (u) =>
            u.organizationId === contract.buyer_id &&
            u.role === "CONTRACT_OWNER",
        ),
    ],
  ] as const;
  return {
    mode: "original",
    language: "vi",
    documentBody: "",
    title: contract.contract_title,
    code,
    buyer: ctx.partyName(contract.buyer_id),
    supplier: ctx.partyName(contract.supplier_id),
    valueMillion: contract.contract_value_vnd_mn,
    startDate: contract.start_date,
    endDate: contract.end_date,
    graceDays: contract.grace_period_days,
    penaltyRatePct: contract.penalty_rate_pct_per_day,
    maxPenaltyPct: contract.max_penalty_pct,
    approvalPolicy: contract.approval_policy,
    signers: (signers.length
      ? signers
      : fallback
          .filter(([, user]) => user)
          .map(([party, user]) => ({
            party,
            name: String(user!.displayName),
          }))
    ).slice(0, 4),
    stages: ctx.milestonesOf(code).map((m) => ({
      type: m.milestone_type,
      name: m.milestone_name,
      paymentPercent: m.payment_percent,
      dueDate: m.due_date,
      requiredEvents: String(m.required_event_types ?? "")
        .split(";")
        .filter(Boolean)
        .join(", "),
    })),
  };
}

type Input = ReturnType<typeof mockInput>;

const folder = () =>
  resolve(repoRoot(), process.env.DATA_DIR ?? ".data", "mock-originals");
const keyOf = (input: Input) =>
  hash(canonical({ input, generator: generatorVersion() }));

async function cached(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}
async function store(path: string, bytes: Buffer | string) {
  await mkdir(folder(), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

/** LibreOffice conversions run one at a time; viewers and the warm-up share the queue. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}
const pending = new Map<string, Promise<MockRendering>>();

export async function mockOriginal(input: Input): Promise<MockOriginal> {
  const path = resolve(folder(), `${keyOf(input)}.docx`);
  let docx: Buffer | undefined = await cached(path);
  if (!docx) {
    docx = await generateSampleDocx(input);
    await store(path, docx);
  }
  return { name: `HopDong_${input.code}.docx`, sha256: hash(docx), docx };
}

export function mockRendering(input: Input): Promise<MockRendering> {
  const key = keyOf(input);
  const running = pending.get(key);
  if (running) return running;
  const work = (async () => {
    const original = await mockOriginal(input);
    const pdfPath = resolve(folder(), `${key}.pdf`);
    const pagesPath = resolve(folder(), `${key}.json`);
    const [pdf, pages] = await Promise.all([
      cached(pdfPath),
      cached(pagesPath),
    ]);
    if (pdf && pages)
      return { ...original, pdf, pages: JSON.parse(pages.toString()) };
    return serial(async () => {
      const rendered = await previewPdf(original.docx, "DOCX");
      const geometry = await inspectPdf(rendered);
      await store(pdfPath, rendered);
      await store(pagesPath, JSON.stringify(geometry));
      return { ...original, pdf: rendered, pages: geometry };
    });
  })().finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}

/**
 * Renders every simulated original in the background after start-up, so the first viewer does not
 * wait for LibreOffice. On by default in production; MOCK_ORIGINALS_WARMUP=false turns it off.
 */
export async function warmMockOriginals(
  domain: import("./domain/service").DomainService,
) {
  const enabled =
    process.env.MOCK_ORIGINALS_WARMUP ??
    (process.env.NODE_ENV === "production" ? "true" : "false");
  if (enabled !== "true") return;
  // An internal read-only reviewer: AUDITOR sees every contract and changes nothing.
  const reviewer = {
    id: "system-warmup",
    email: "",
    displayName: "system",
    role: "AUDITOR" as const,
    organizationId: "OPS",
    roleChipOrganization: "",
    partyId: null,
    title: "",
    permissions: [],
  };
  const inputs = await domain.read(reviewer, (ctx) =>
    ctx.contracts
      .map((contract) => contract.contract_id)
      .filter((code) => needsMockOriginal(ctx, code))
      .map((code) => mockInput(ctx, code)),
  );
  for (const input of inputs) await mockRendering(input).catch(() => undefined);
}
