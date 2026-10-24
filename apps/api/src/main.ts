import { existsSync } from "node:fs";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentsController } from "./documents";
import "reflect-metadata";
import { WorkflowController, WorkflowService } from "./workflow.controller";
import { config as loadEnv } from "dotenv";
import { Module, Controller, Get, Inject } from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Repository } from "./common/repository";
import { BaseService } from "./common/services/base.service";
import { BaseController } from "./common/controllers/base.controller";
import { AuthService, AuthGuard, AuthController } from "./auth";
import { RolesGuard } from "./common/guards/roles.guard";
import { Public } from "./common/decorators/roles.decorator";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { EngineController } from "./engine";
import { PermissionsController } from "./permissions.controller";
import { DomainService } from "./domain/service";
import { auditContext } from "./common/audit-events";
import { AuditReadsInterceptor } from "./common/audit-http";
import { TrustService } from "./trust/service";
import { TrustController } from "./trust/controller";
import { ExtractionService } from "./trust/extraction-service";
import { RulesService } from "./trust/rules-service";
import { AuditExportController } from "./common/audit-export";
process.env.REPO_ROOT ??= resolve(__dirname, "../../..");
loadEnv({ path: resolve(process.env.REPO_ROOT, ".env") });
process.chdir(process.env.REPO_ROOT);
@Controller("health")
class HealthController {
  constructor(@Inject(Repository) private repo: Repository) {}
  @Public() @Get() health() {
    return { status: "ok", storage: this.repo.driver };
  }
}
@Module({
  controllers: [
    AuditExportController,
    TrustController,
    HealthController,
    AuthController,
    BaseController,
    EngineController,
    WorkflowController,
    DocumentsController,
    PermissionsController,
  ],
  providers: [
    TrustService,
    ExtractionService,
    RulesService,
    Repository,
    BaseService,
    AuthService,
    WorkflowService,
    DomainService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
class ApplicationModule {}
async function main() {
  const app =
    await NestFactory.create<NestExpressApplication>(ApplicationModule);
  // A full 128-rule version exceeds Express's default 100 kB JSON limit.
  app.useBodyParser("json", { limit: "4mb" });
  await app.get(Repository).init();
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(",") : true,
  });
  app.use((req: any, res: any, next: () => void) => {
    if (req.path === "/healthz") {
      res.status(200).send("ok\n");
      return;
    }
    req.requestId = randomUUID();
    res.setHeader("x-request-id", req.requestId);
    auditContext.run(
      { requestId: req.requestId, method: req.method, path: req.path },
      next,
    );
  });
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Repository)));
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    new AuditReadsInterceptor(app.get(Repository), app.get(BaseService)),
  );
  // The Data Pack is the base data of every deployment; seed accounts need a seed password.
  await app.get(DomainService).bootstrap();
  if (process.env.NODE_ENV !== "production" || process.env.SEED_PASSWORD)
    await app.get(AuthService).seed();
  const config = new DocumentBuilder()
    .setTitle("CodeCash API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(app, config),
  );
  app.enableShutdownHooks();

  // If the web build is present, serve it directly so single-container deployments require zero setup.
  const staticDir = resolve(
    process.env.REPO_ROOT ?? resolve(__dirname, "../../.."),
    "apps/web/dist",
  );
  if (existsSync(staticDir)) {
    app.useStaticAssets(staticDir, {
      setHeaders: (res: any, path: string) => {
        if (path.includes("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
    app.use((req: any, res: any, next: () => void) => {
      if (
        req.method === "GET" &&
        !req.path.startsWith("/api") &&
        !req.path.startsWith("/healthz")
      ) {
        res.sendFile(resolve(staticDir, "index.html"));
        return;
      }
      next();
    });
  }

  // Cloud PaaS (Render, Koyeb, Railway, Cloud Run) supply PORT and expect 0.0.0.0.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  const host =
    process.env.API_HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
  await app.listen(port, host);
}
void main();
