import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { PERMISSION_KEY, can } from "../permissions";
import type { Role } from "../types";
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles?.length && !roles.includes(user.role))
      throw new ForbiddenException();
    const permission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (permission && !can(user.role, permission))
      throw new ForbiddenException("PERMISSION_DENIED");
    return true;
  }
}
