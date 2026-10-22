import {
  Injectable,
  Inject,
  Controller,
  Post,
  Get,
  Body,
  Req,
  Param,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  CanActivate,
  ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Repository } from "./common/repository";
import { Public } from "./common/decorators/roles.decorator";
import { RequirePermission, permissionsFor } from "./common/permissions";
import type { Actor, SessionRequest, Role, RecordEntity } from "./common/types";
/** Accounts created by `seed()`; the demo sign-in menu lists only these. */
const DEMO_ACCOUNT_IDS = [
  "u-owner",
  "u-legal",
  "u-finance",
  "u-admin",
  "u-supplier",
];
/**
 * One-click demo sign-in: on by default in development, off in production unless DEMO_LOGIN=true.
 * Never enable it on a deployment that holds real data.
 */
export function demoLoginEnabled() {
  if (process.env.DEMO_LOGIN === "true") return true;
  if (process.env.DEMO_LOGIN === "false") return false;
  return process.env.NODE_ENV !== "production";
}
@Injectable()
export class AuthService {
  private secret = process.env.JWT_SECRET || randomBytes(48).toString("hex");
  constructor(@Inject(Repository) private repo: Repository) {
    if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET)
      throw new Error("JWT_SECRET is required");
  }
  actor(record: RecordEntity): Actor {
    return {
      id: record.id,
      email: String(record.email),
      displayName: String(record.displayName),
      role: record.role as Role,
      organizationId: String(record.organizationId),
      roleChipOrganization: String(
        record.roleChipOrganization ?? record.organizationId,
      ),
      permissions: permissionsFor(record.role as Role),
      active: record.active !== false,
    };
  }
  async login(body: unknown) {
    if (!body || typeof body !== "object")
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    const { email, password } = body as Record<string, unknown>;
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 1024
    )
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    const user = (await this.repo.list("users")).find(
      (x) => String(x.email).toLowerCase() === email.trim().toLowerCase(),
    );
    if (
      !user ||
      user.active === false ||
      !(await bcrypt.compare(password, String(user.passwordHash)))
    )
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    return this.session(user);
  }
  private session(user: RecordEntity) {
    return {
      token: jwt.sign(
        { sub: user.id, tv: user.tokenVersion ?? 0 },
        this.secret,
        {
          expiresIn: "8h",
          issuer: "codecash",
          audience: "codecash-web",
        },
      ),
      user: this.actor(user),
    };
  }
  async demoAccounts() {
    if (!demoLoginEnabled()) return { enabled: false, accounts: [] };
    const users = await this.repo.list("users");
    return {
      enabled: true,
      accounts: DEMO_ACCOUNT_IDS.map((id) => users.find((u) => u.id === id))
        .filter((u): u is RecordEntity => !!u && u.active !== false)
        .map((u) => ({
          email: String(u.email),
          displayName: String(u.displayName),
          role: u.role as Role,
          organization: String(u.roleChipOrganization ?? ""),
        })),
    };
  }
  async demoLogin(body: unknown) {
    if (!demoLoginEnabled()) throw new NotFoundException("DEMO_LOGIN_DISABLED");
    const email = String((body as { email?: unknown })?.email ?? "")
      .trim()
      .toLowerCase();
    const user = (await this.repo.list("users")).find(
      (x) =>
        DEMO_ACCOUNT_IDS.includes(x.id) &&
        String(x.email).toLowerCase() === email &&
        x.active !== false,
    );
    if (!user) throw new UnauthorizedException("INVALID_CREDENTIALS");
    const now = new Date().toISOString();
    await this.repo.mutate("audit", (items) =>
      items.push({
        id: randomBytes(16).toString("hex"),
        version: 1,
        createdAt: now,
        updatedAt: now,
        organizationId: String(user.organizationId),
        actorId: user.id,
        action: "LOGIN_DEMO",
        resource: "users",
        recordId: user.id,
      }),
    );
    return this.session(user);
  }
  async authenticate(token: string) {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: "codecash",
        audience: "codecash-web",
      }) as jwt.JwtPayload;
      const user = (await this.repo.list("users")).find(
        (x) => x.id === decoded.sub,
      );
      if (
        !user ||
        user.active === false ||
        decoded.tv !== (user.tokenVersion ?? 0)
      )
        throw new Error();
      return this.actor(user);
    } catch {
      throw new UnauthorizedException("INVALID_SESSION");
    }
  }
  async resetPassword(id: string, password: unknown, actor: Actor) {
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      throw new BadRequestException("PASSWORD_MINIMUM_12_CHARACTERS");
    const passwordHash = await bcrypt.hash(password, 12);
    await this.repo.mutate(
      "users",
      (items) => {
        const user = items.find((x) => x.id === id);
        if (!user) throw new NotFoundException("USER_NOT_FOUND");
        user.passwordHash = passwordHash;
        user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
        user.version++;
        user.updatedAt = new Date().toISOString();
      },
      {
        id: randomBytes(16).toString("hex"),
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "RESET_PASSWORD",
        resource: "users",
        recordId: id,
      },
    );
    return { updated: true };
  }
  async logout(actor: Actor) {
    await this.repo.mutate("users", (items) => {
      const user = items.find((x) => x.id === actor.id);
      if (user) user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
    });
    return { loggedOut: true };
  }
  async seed() {
    if ((await this.repo.list("users")).length) return;
    const passwordHash = await bcrypt.hash(
      process.env.SEED_PASSWORD ?? "Passw0rd!",
      12,
    );
    const now = new Date().toISOString();
    const accounts = [
      ["owner", "owner@novaan.vn", "Nguyễn Văn An", "CONTRACT_OWNER"],
      ["legal", "legal@novaan.vn", "Trần Thị Mai", "LEGAL_REVIEWER"],
      ["finance", "finance@novaan.vn", "Lê Quốc Dũng", "FINANCE_APPROVER"],
      ["admin", "admin@novaan.vn", "Phạm Hoàng Nam", "ADMIN_AUDITOR"],
      ["supplier", "supplier@phuminh.vn", "Vũ Thanh Hà", "SUPPLIER"],
    ];
    await this.repo.mutate("users", (items) =>
      items.push(
        ...accounts.map(([id, email, displayName, role]) => ({
          id: "u-" + id,
          email,
          displayName,
          role,
          passwordHash,
          active: true,
          organizationId: role === "SUPPLIER" ? "org-phu-minh" : "org-nova-an",
          roleChipOrganization:
            role === "SUPPLIER"
              ? "Phú Minh Technology JSC"
              : "Nova An Business JSC",
          version: 1,
          createdAt: now,
          updatedAt: now,
        })),
      ),
    );
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      throw new UnauthorizedException("AUTHENTICATION_REQUIRED");
    req.user = await this.auth.authenticate(header.slice(7));
    return true;
  }
}
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  @Public() @Post("login") login(@Body() body: unknown) {
    return this.auth.login(body);
  }
  @Public() @Get("demo-accounts") demoAccounts() {
    return this.auth.demoAccounts();
  }
  @Public() @Post("demo-login") demoLogin(@Body() body: unknown) {
    return this.auth.demoLogin(body);
  }
  @Post("logout") logout(@Req() req: SessionRequest) {
    return this.auth.logout(req.user);
  }
  @Get("me") me(@Req() req: SessionRequest) {
    return req.user;
  }
  @RequirePermission("users:reset-password")
  @Post("users/:id/password")
  reset(
    @Param("id") id: string,
    @Body() body: { password: unknown },
    @Req() req: SessionRequest,
  ) {
    return this.auth.resetPassword(id, body?.password, req.user);
  }
}
