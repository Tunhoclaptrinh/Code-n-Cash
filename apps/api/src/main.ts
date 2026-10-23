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
    HealthController,
    AuthController,
    BaseController,
    EngineController,
    WorkflowController,
    DocumentsController,
    PermissionsController,
  ],
  providers: [
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
  const app = await NestFactory.create(ApplicationModule);
  await app.get(Repository).init();
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: (
      process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173,http://localhost:5173"
    ).split(","),
  });
  app.use((req: any, res: any, next: () => void) => {
    req.requestId = randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
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
  // Loopback by default; containers set API_HOST=0.0.0.0 behind the reverse proxy.
  await app.listen(
    Number(process.env.API_PORT ?? 3000),
    process.env.API_HOST ?? "127.0.0.1",
  );
}
void main();
