import {
  Injectable,
  Inject,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { mergeMap } from "rxjs";
import { Repository } from "./repository";
import { BaseService } from "./services/base.service";

/** Audit deliberate document/record inspection, excluding list refreshes and signing polls. */
@Injectable()
export class AuditReadsInterceptor implements NestInterceptor {
  constructor(
    @Inject(Repository) private repo: Repository,
    @Inject(BaseService) private base: BaseService,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        if (!request.user) return result;
        const path = String(request.path);
        const workflow =
          path.includes("/workflow/") &&
          [
            "getContractOverview",
            "getMilestoneDetail",
            "getMilestoneTimeline",
            "getVerification",
            "verifyIntegrity",
          ].includes(request.params.action);
        const download =
          request.method === "GET" &&
          /\/(documents\/[^/]+\/download|engine\/datasets\/[^/]+\/files\/[^/]+)$/.test(
            path,
          );
        const record =
          request.method === "GET" &&
          /^\/api\/v1\/resources\/[^/]+\/[^/]+$/.test(path) &&
          !/\/(export|template)$/.test(path);
        if (workflow || download || record) {
          const entry = this.base.auditRecord(
            download ? "DOWNLOAD" : "VIEW",
            request.params.resource ??
              request.params.module ??
              (path.includes("/documents/") ? "documents" : "datasets"),
            request.params.id ?? String(request.body?.args?.[0] ?? ""),
            request.user,
          );
          if (workflow && request.params.module === "contracts")
            entry.contractId = request.body?.args?.[0];
          await this.repo.mutate("audit", (entries) => entries.push(entry));
        }
        return result;
      }),
    );
  }
}
