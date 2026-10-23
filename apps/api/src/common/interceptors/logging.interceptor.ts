import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { tap } from "rxjs/operators";
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private log = new Logger("HTTP");
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const request = ctx.switchToHttp().getRequest();
    const start = Date.now();
    return next
      .handle()
      .pipe(
        tap(() =>
          this.log.log(
            `${request.method} ${request.path} ${Date.now() - start}ms ${request.requestId}`,
          ),
        ),
      );
  }
}
