import { createParamDecorator, ExecutionContext } from "@nestjs/common";
export const TenantId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().user.organizationId,
);
