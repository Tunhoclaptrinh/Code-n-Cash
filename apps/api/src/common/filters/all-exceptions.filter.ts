import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
} from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { Repository } from "../repository";

/** Identical failures (same actor, client address, status and code) within this window share one entry. */
export const FAILURE_WINDOW_MS = 60_000;

/**
 * Decides which failed requests reach the audit chain. The first failure of a kind in a window is
 * written; repeats are counted and the count is written with the next one after the window. An
 * anonymous client can then no longer grow the chain by one entry per request.
 */
export class FailureFolder {
  private windows = new Map<string, { start: number; folded: number }>();
  constructor(private windowMs = FAILURE_WINDOW_MS) {}
  /** null: fold this one; otherwise write it, with how many were folded before it. */
  admit(key: string, now = Date.now()): { foldedBefore: number } | null {
    const window = this.windows.get(key);
    if (window && now - window.start < this.windowMs) {
      window.folded++;
      return null;
    }
    this.windows.set(key, { start: now, folded: 0 });
    if (this.windows.size > 10_000)
      for (const [k, w] of this.windows)
        if (now - w.start >= this.windowMs) this.windows.delete(k);
    return { foldedBefore: window?.folded ?? 0 };
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private repo: Repository) {}
  private log = new Logger("HTTP");
  private failures = new FailureFolder();
  async catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      res = ctx.getResponse(),
      req = ctx.getRequest();
    const parserType = (error as { type?: string } | null)?.type;
    const parserStatus =
      parserType === "entity.too.large"
        ? 413
        : parserType === "entity.parse.failed"
          ? 400
          : null;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : (parserStatus ?? 500);
    const detail = error instanceof HttpException ? error.getResponse() : null;
    const message =
      typeof detail === "string"
        ? detail
        : ((detail as { message?: unknown })?.message ??
          (parserStatus === 413
            ? "PAYLOAD_TOO_LARGE"
            : parserStatus === 400
              ? "INVALID_JSON"
              : "INTERNAL_ERROR"));
    if (status === 500) this.log.error(error);
    const errorCode =
      typeof message === "string" ? message : "VALIDATION_ERROR";
    const admitted =
      status >= 400 && status !== 404
        ? this.failures.admit(
            [req.user?.id ?? "anonymous", req.ip ?? "", status, errorCode].join(
              "|",
            ),
          )
        : null;
    if (admitted) {
      try {
        const now = new Date().toISOString();
        await this.repo.mutate("audit", (entries) =>
          entries.push({
            id: randomUUID(),
            version: 1,
            createdAt: now,
            updatedAt: now,
            organizationId: req.user?.organizationId ?? "OPS",
            actorId: req.user?.id ?? "anonymous",
            actorName: req.user?.displayName ?? "anonymous",
            actorRole: req.user?.role ?? "SYSTEM",
            action: "REQUEST_FAILED",
            resource: req.params?.resource ?? req.params?.module ?? "auth",
            recordId: req.params?.id ?? "",
            outcome: "FAILED",
            statusCode: status,
            errorCode,
            ...(admitted.foldedBefore
              ? { foldedBefore: admitted.foldedBefore }
              : {}),
            ...(req.body?.email && typeof req.body.email === "string"
              ? {
                  subjectHash: createHash("sha256")
                    .update(req.body.email.trim().toLowerCase())
                    .digest("hex"),
                }
              : {}),
          }),
        );
      } catch (auditError) {
        this.log.error("Could not record failed request", auditError);
      }
    }
    res.status(status).json({
      statusCode: status,
      code: typeof message === "string" ? message : "VALIDATION_ERROR",
      message,
      requestId: req.requestId,
    });
  }
}
