import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { RequirePermission, can } from "./permissions";
import { BaseService } from "./services/base.service";
import { Repository } from "./repository";
import type { SessionRequest } from "./types";

const sources: Record<string, string> = {
  contracts: "contracts:read",
  tasks: "tasks:read",
  activity: "activity:read",
  exceptions: "exceptions:read",
  permissions: "permissions:read",
  engine: "engine:read",
};

/** Client exports record the user's download request; they cannot attest that a file was saved. */
@Controller("exports")
export class AuditExportController {
  constructor(
    @Inject(Repository) private repo: Repository,
    @Inject(BaseService) private base: BaseService,
  ) {}
  @Post()
  @RequirePermission("tasks:read")
  async record(
    @Body()
    body: {
      source?: unknown;
      count?: unknown;
      format?: unknown;
      scope?: unknown;
      columns?: unknown;
    },
    @Req() req: SessionRequest,
  ) {
    const permission = sources[String(body?.source)];
    if (!permission || !can(req.user.role, permission))
      throw new ForbiddenException("PERMISSION_DENIED");
    if (
      !Number.isSafeInteger(body.count) ||
      Number(body.count) < 0 ||
      !["csv", "json", "xlsx"].includes(String(body.format)) ||
      !["page", "all", "custom"].includes(String(body.scope)) ||
      !Array.isArray(body.columns) ||
      body.columns.length > 100 ||
      body.columns.some(
        (value) => typeof value !== "string" || value.length > 100,
      )
    )
      throw new BadRequestException("INVALID_INPUT");
    const entry = this.base.auditRecord(
      "EXPORT_REQUEST",
      String(body.source),
      "",
      req.user,
    );
    entry.exportRequest = {
      countReported: body.count,
      format: body.format === "xlsx" ? "csv" : body.format,
      scope: body.scope,
      columns: body.columns,
    };
    await this.repo.mutate("audit", (rows) => rows.push(entry));
    return { recorded: true };
  }
}
