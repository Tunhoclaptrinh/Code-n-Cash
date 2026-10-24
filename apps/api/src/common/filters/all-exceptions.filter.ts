import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
} from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { Repository } from "../repository";
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private repo: Repository) {}
  private log = new Logger("HTTP");
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
    if (status >= 400 && status !== 404) {
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
            errorCode:
              typeof message === "string" ? message : "VALIDATION_ERROR",
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
