import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
} from "@nestjs/common";
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger("HTTP");
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      res = ctx.getResponse(),
      req = ctx.getRequest();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const detail = error instanceof HttpException ? error.getResponse() : null;
    const message =
      typeof detail === "string"
        ? detail
        : ((detail as { message?: unknown })?.message ?? "INTERNAL_ERROR");
    if (status === 500) this.log.error(error);
    res.status(status).json({
      statusCode: status,
      code: typeof message === "string" ? message : "VALIDATION_ERROR",
      message,
      requestId: req.requestId,
    });
  }
}
