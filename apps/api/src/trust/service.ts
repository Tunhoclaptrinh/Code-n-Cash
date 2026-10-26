import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Repository } from "../common/repository";
import { BaseService } from "../common/services/base.service";
import {
  canonical,
  chainHead,
  sha256,
  verifyChain,
} from "../common/audit-chain";
import type { Actor, RecordEntity } from "../common/types";
import { READ_TABLES } from "../domain/context";
import { LocalWitnessProvider, type AnchorProvider } from "./anchor-provider";
import { localKey, verifyLocalProof } from "./crypto";
import type { AnchorJob, AnchorPayload, LocalProof } from "./types";
import { DomainService } from "../domain/service";

const hashPattern = /^[0-9a-f]{64}$/;
/** The scheduler that anchors on its own; never a signed-in user, never granted a permission. */
const SCHEDULER: Actor = {
  id: "system",
  email: "",
  displayName: "System",
  role: "AUDITOR",
  organizationId: "OPS",
  roleChipOrganization: "",
  partyId: null,
  title: "",
  permissions: [],
};
const jobView = (job: RecordEntity) =>
  ({
    id: job.id,
    status: job.status,
    payload: job.payload,
    receipt: job.receipt,
    error: job.error,
    attempts: job.attempts,
  }) as AnchorJob;
const manifestOf = (tables: Record<string, RecordEntity[]>) =>
  Object.fromEntries(
    Object.entries(tables)
      .filter(([name]) => !["audit", "anchor-jobs"].includes(name))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, rows]) => [
        name,
        {
          count: rows.length,
          sha256: sha256(
            canonical([...rows].sort((a, b) => a.id.localeCompare(b.id))),
          ),
        },
      ]),
  );

/** Audit actions of anchoring itself: they do not make the chain worth anchoring again. */
const ANCHOR_ACTIONS = new Set([
  "ANCHOR_REQUEST",
  "ANCHOR_CONFIRMED",
  "ANCHOR_FAILED",
]);

@Injectable()
export class TrustService implements OnModuleInit, OnModuleDestroy {
  private provider: AnchorProvider = new LocalWitnessProvider();
  private processing = new Map<string, Promise<AnchorJob>>();
  private timer?: NodeJS.Timeout;
  constructor(
    @Inject(Repository) private repo: Repository,
    @Inject(BaseService) private base: BaseService,
    @Inject(DomainService) private domain: DomainService,
  ) {}
  /** Anchors the head every ANCHOR_INTERVAL_MINUTES (default 15; 0 turns it off) when it moved. */
  onModuleInit() {
    const minutes = Number(process.env.ANCHOR_INTERVAL_MINUTES ?? 15);
    if (!(minutes > 0)) return;
    this.timer = setInterval(
      () => void this.anchorIfChanged(null).catch(() => undefined),
      minutes * 60_000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /**
   * Anchors the current head when the chain has grown since the last confirmed anchor (entries of
   * anchoring itself excluded). ``actor`` null is the scheduler. Returns the job, or null.
   */
  async anchorIfChanged(actor: Actor | null) {
    const [audit, jobs] = await Promise.all([
      this.repo.list("audit"),
      this.repo.list("anchor-jobs"),
    ]);
    const anchored = Math.max(
      0,
      ...jobs
        .filter((job) => job.status === "CONFIRMED")
        .map((job) => (job.payload as AnchorPayload).sequence),
    );
    const grown = audit.some(
      (entry) =>
        Number(entry.seq) > anchored &&
        !ANCHOR_ACTIONS.has(String(entry.action)),
    );
    return grown ? this.request(randomUUID(), actor) : null;
  }

  /** An audit entry for the signed-in actor, or for the scheduler when there is none. */
  private record(action: string, id: string, actor: Actor | null) {
    const entry = this.base.auditRecord(
      action,
      "anchors",
      id,
      actor ?? SCHEDULER,
    );
    return actor ? entry : { ...entry, actorRole: "SYSTEM" };
  }

  async signatureBundle(code: string, actor: Actor) {
    const result = await this.domain.read(actor, (ctx) => {
      ctx.contract(code);
      const signing = ctx.signing(code);
      return {
        schemaVersion: 1,
        contractCode: code,
        provider: "LOCAL_ED25519",
        certificateTrusted: false,
        proofs:
          signing?.steps.flatMap((step) =>
            step.localProof ? [step.localProof] : [],
          ) ?? [],
      };
    });
    await this.base.audit("SIGNATURE_EXPORT", "signing", code, actor);
    return result;
  }
  status() {
    return {
      provider: this.provider.kind,
      witnessKeyFingerprint: localKey("audit-witness").keyFingerprint,
      timestampTrusted: false,
      blockchainConnected: false,
    };
  }
  async list() {
    return (await this.repo.list("anchor-jobs")).map(jobView).reverse();
  }

  async request(idempotencyKey: unknown, actor: Actor | null) {
    if (
      typeof idempotencyKey !== "string" ||
      !/^[0-9a-f-]{36}$/.test(idempotencyKey)
    )
      throw new BadRequestException("INVALID_INPUT");
    let created = false;
    const job = await this.repo.transact(
      [...READ_TABLES, "settings", "audit", "anchor-jobs"],
      (tables) => {
        const existing = tables["anchor-jobs"].find(
          (entry) => entry.id === idempotencyKey,
        );
        if (existing) return existing;
        const head = chainHead(tables.audit);
        if (!head || !verifyChain(tables.audit).ok)
          throw new BadRequestException("AUDIT_CHAIN_BROKEN");
        const manifest = manifestOf(tables);
        const now = new Date().toISOString();
        const payload: AnchorPayload = {
          schemaVersion: 1,
          systemId: String(tables.audit.find((entry) => entry.seq === 1)?.hash),
          sequence: Number(head.seq),
          headHash: String(head.hash),
          snapshotHash: sha256(canonical(manifest)),
          createdAt: now,
          algorithm: "SHA-256",
          manifest,
        };
        const next: RecordEntity = {
          id: idempotencyKey,
          version: 1,
          createdAt: now,
          updatedAt: now,
          organizationId: "OPS",
          status: "PENDING",
          payload,
          receipt: null,
          error: null,
          attempts: 0,
        };
        tables["anchor-jobs"].push(next);
        created = true;
        return next;
      },
      (result) =>
        created ? [this.record("ANCHOR_REQUEST", result.id, actor)] : [],
    );
    return job.status === "CONFIRMED"
      ? jobView(job)
      : this.process(job.id, actor);
  }

  async retry(id: string, actor: Actor | null) {
    await this.job(id);
    return this.process(id, actor);
  }
  private async job(id: string) {
    const job = (await this.repo.list("anchor-jobs")).find(
      (entry) => entry.id === id,
    );
    if (!job) throw new NotFoundException("RECORD_NOT_FOUND");
    return job;
  }
  private process(id: string, actor: Actor | null): Promise<AnchorJob> {
    const current = this.processing.get(id);
    if (current) return current;
    const pending = this.runJob(id, actor).finally(() =>
      this.processing.delete(id),
    );
    this.processing.set(id, pending);
    return pending;
  }
  private async runJob(id: string, actor: Actor | null) {
    const job = await this.job(id);
    if (job.status === "CONFIRMED") return jobView(job);
    let receipt: LocalProof | null = null;
    let error: string | null = null;
    try {
      receipt = await this.provider.submit(job.payload as AnchorPayload);
      if (!(await this.provider.verify(job.payload as AnchorPayload, receipt)))
        throw new Error("INVALID_RECEIPT");
    } catch {
      error = "WITNESS_UNAVAILABLE";
    }
    return this.repo.transact(
      ["anchor-jobs"],
      (tables) => {
        const saved = tables["anchor-jobs"].find((entry) => entry.id === id)!;
        if (saved.status === "CONFIRMED") return jobView(saved);
        Object.assign(saved, {
          status: error ? "FAILED" : "CONFIRMED",
          receipt: error ? null : receipt,
          error,
          attempts: Number(saved.attempts) + 1,
          version: saved.version + 1,
          updatedAt: new Date().toISOString(),
        });
        return jobView(saved);
      },
      () => [
        this.record(error ? "ANCHOR_FAILED" : "ANCHOR_CONFIRMED", id, actor),
      ],
    );
  }
  async bundle(id: string, actor: Actor) {
    const job = await this.job(id);
    await this.base.audit("ANCHOR_EXPORT", "anchors", id, actor);
    return {
      schemaVersion: 1,
      payload: job.payload,
      receipt: job.receipt,
      provider: this.provider.kind,
    };
  }
  async check(bundle: { payload?: AnchorPayload; receipt?: LocalProof }) {
    const payload = bundle?.payload;
    if (
      !payload ||
      payload.schemaVersion !== 1 ||
      !Number.isSafeInteger(payload.sequence) ||
      payload.sequence < 1 ||
      !hashPattern.test(payload.headHash) ||
      !hashPattern.test(payload.systemId) ||
      !hashPattern.test(payload.snapshotHash) ||
      !payload.manifest ||
      sha256(canonical(payload.manifest)) !== payload.snapshotHash
    )
      throw new BadRequestException("INVALID_ANCHOR");
    const receipt = bundle.receipt;
    const cryptoValid =
      !!receipt &&
      verifyLocalProof(receipt) &&
      canonical(receipt.payload.payload) === canonical(payload);
    let witnessMatched = false;
    try {
      witnessMatched =
        !!receipt && (await this.provider.verify(payload, receipt));
    } catch {
      /* independent receipt unavailable */
    }
    const report = await this.repo.transact(
      [...READ_TABLES, "settings", "audit"],
      (tables) => {
        const chain = verifyChain(tables.audit, {
          seq: payload.sequence,
          hash: payload.headHash,
        });
        return {
          chainMatched: chain.ok && chain.anchor === "MATCH",
          systemMatched:
            tables.audit.find((entry) => entry.seq === 1)?.hash ===
            payload.systemId,
          snapshotMatched:
            sha256(canonical(manifestOf(tables))) === payload.snapshotHash,
        };
      },
    );
    return {
      ...report,
      cryptoValid,
      witnessMatched,
      timestampTrusted: false,
      result:
        cryptoValid &&
        witnessMatched &&
        report.chainMatched &&
        report.systemMatched
          ? "MATCH"
          : "MISMATCH",
    };
  }
}
