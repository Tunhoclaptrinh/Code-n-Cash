import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { RequirePermission } from "../common/permissions";
import type { SessionRequest } from "../common/types";
import { TrustService } from "./service";
import type { AnchorPayload, LocalProof } from "./types";
import { ExtractionService } from "./extraction-service";
import { RulesService } from "./rules-service";

@Controller("trust")
export class TrustController {
  constructor(
    @Inject(TrustService) private trust: TrustService,
    @Inject(ExtractionService) private extraction: ExtractionService,
    @Inject(RulesService) private rules: RulesService,
  ) {}
  @Get("rules") @RequirePermission("rules:read") listRules() {
    return this.rules.list();
  }
  @Get("rules/language") @RequirePermission("rules:read") ruleLanguage() {
    return this.rules.language();
  }
  @Post("rules/validate") @RequirePermission("rules:read") validateRules(
    @Body() body: { rules?: unknown },
  ) {
    return this.rules.checkExpressions(body);
  }
  @Post("rules/:id/preview") @RequirePermission("rules:read") previewRules(
    @Param("id") id: string,
    @Body() body: { version?: unknown; rules?: unknown; templates?: unknown },
  ) {
    return this.rules.preview(id, body);
  }
  @Post("rules") @RequirePermission("rules:write") createRules(
    @Body() body: { name?: unknown; reason?: unknown },
    @Req() req: SessionRequest,
  ) {
    return this.rules.create(body, req.user);
  }
  @Patch("rules/:id") @RequirePermission("rules:write") saveRules(
    @Param("id") id: string,
    @Body() body: { version?: unknown; rules?: unknown; templates?: unknown },
    @Req() req: SessionRequest,
  ) {
    return this.rules.save(id, body, req.user);
  }
  @Post("rules/:id/submit") @RequirePermission("rules:write") submitRules(
    @Param("id") id: string,
    @Body() body: { version?: unknown },
    @Req() req: SessionRequest,
  ) {
    return this.rules.submit(id, body?.version, req.user);
  }
  @Post("rules/:id/publish") @RequirePermission("rules:publish") publishRules(
    @Param("id") id: string,
    @Body() body: { version?: unknown },
    @Req() req: SessionRequest,
  ) {
    return this.rules.publish(id, body?.version, req.user);
  }
  @Get("contracts/:code/signatures")
  @RequirePermission("signing:verify")
  signatures(@Param("code") code: string, @Req() req: SessionRequest) {
    return this.trust.signatureBundle(code, req.user);
  }
  @Get("contracts/:code/extraction")
  @RequirePermission("contracts:digitize")
  latestExtraction(@Param("code") code: string, @Req() req: SessionRequest) {
    return this.extraction.latest(code, req.user);
  }
  @Post("contracts/:code/extraction")
  @RequirePermission("contracts:digitize")
  extract(@Param("code") code: string, @Req() req: SessionRequest) {
    return this.extraction.extract(code, req.user);
  }
  @Post("contracts/:code/extraction/:id/confirm")
  @RequirePermission("contracts:digitize")
  confirmExtraction(
    @Param("code") code: string,
    @Param("id") id: string,
    @Body() body: { values?: unknown },
    @Req() req: SessionRequest,
  ) {
    return this.extraction.confirm(code, id, body?.values, req.user);
  }
  @Get("status") @RequirePermission("anchors:read") status() {
    return this.trust.status();
  }
  @Get("anchors") @RequirePermission("anchors:read") list() {
    return this.trust.list();
  }
  @Post("anchors") @RequirePermission("anchors:write") request(
    @Body() body: { idempotencyKey?: unknown },
    @Req() req: SessionRequest,
  ) {
    return this.trust.request(body?.idempotencyKey, req.user);
  }
  @Post("anchors/:id/retry") @RequirePermission("anchors:write") retry(
    @Param("id") id: string,
    @Req() req: SessionRequest,
  ) {
    return this.trust.retry(id, req.user);
  }
  @Get("anchors/:id/bundle") @RequirePermission("anchors:read") bundle(
    @Param("id") id: string,
    @Req() req: SessionRequest,
  ) {
    return this.trust.bundle(id, req.user);
  }
  @Post("anchors/verify") @RequirePermission("anchors:read") check(
    @Body() body: { payload?: AnchorPayload; receipt?: LocalProof },
  ) {
    return this.trust.check(body);
  }
}
